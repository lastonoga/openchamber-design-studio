// The verifying harness: one entry point, `runVerification`, that drives the
// live browser across the viewport matrix and assembles a VerifyReport.
//
// For each viewport it applies the exact device metrics, freezes the page for
// determinism, reads the page probe and runs the five pure gates
// (G1/G4/G3/G6/G5) with token/source context gathered from the project. There
// are no pixel baselines: every gate is a deterministic invariant, so a run is
// reproducible and needs no approval step.
//
// The loop is guarded service-side so a runaway agent cannot loop forever: an
// iteration counter, a wall-clock deadline, an oscillation detector built on
// `findingSignature` (a finding that reappears after being fixed, or a gate that
// flips A→B→A across runs, halts the run), and a surface-control guard that
// stops resizing the moment the user takes over the shared browser.
import { promises as fs } from 'node:fs';
import path from 'node:path';

import {
  GATE_ORDER,
  VIEWPORTS,
  findingSignature,
  summarizeFindings,
} from '../shared/verify-types.ts';
import type {
  GateId,
  GateResult,
  GateStatus,
  ProbeReport,
  ProviderVerification,
  VerifyFinding,
  VerifyHalt,
  VerifyReport,
  Viewport,
} from '../shared/verify-types.ts';

import { runGateReport } from './gates/index.ts';
import type { GateContext } from './gates/index.ts';
import { ensureBrowser, getController } from './surface.ts';
import type { Browser } from './browser.ts';

/** Wall-clock budget for one run (the prompt's "10 minutes" made concrete). */
export const DEFAULT_DEADLINE_MS = 10 * 60_000;
/** Hard cap on viewport iterations, in case a caller sends a huge matrix. */
export const MAX_ITERATIONS = 40;

const SOURCE_EXT = new Set([
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.html',
  '.htm',
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.vue',
  '.svelte',
  '.svg',
]);

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', '.design-studio']);
const MAX_FILES = 200;
const MAX_FILE_BYTES = 200_000;
const MAX_TOTAL_BYTES = 2_000_000;

const TOKEN_RE = /(--[A-Za-z0-9_-]+)\s*:\s*([^;{}]+);/g;

/** G4's tokens: every `--name: value;` declaration in `tokens.css`. */
export function parseTokens(text: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  let m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(text))) tokens[m[1]!] = m[2]!.trim();
  return tokens;
}

async function walkSources(
  root: string,
  dir: string,
  out: { path: string; text: string }[],
): Promise<void> {
  if (out.length >= MAX_FILES) return;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (out.length >= MAX_FILES) return;
    if (entry.name.startsWith('.')) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walkSources(root, abs, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!SOURCE_EXT.has(path.extname(entry.name).toLowerCase())) continue;
    try {
      const stat = await fs.stat(abs);
      if (stat.size > MAX_FILE_BYTES) continue;
      const text = await fs.readFile(abs, 'utf8');
      out.push({ path: path.relative(root, abs).split(path.sep).join('/'), text });
    } catch {
      /* unreadable file; skip it */
    }
  }
}

/**
 * The source context the pure gates need: the project's CSS/HTML/JS files (for
 * G4) and the parsed values of `tokens.css`. Bounded so a huge project cannot
 * stall a run.
 */
export async function gatherGateContext(dir: string | null): Promise<GateContext> {
  if (!dir) return { files: [], tokens: {} };
  const files: { path: string; text: string }[] = [];
  await walkSources(dir, dir, files);

  let total = 0;
  const bounded: typeof files = [];
  for (const file of files) {
    if (total + file.text.length > MAX_TOTAL_BYTES) break;
    total += file.text.length;
    bounded.push(file);
  }

  let tokens: Record<string, string> = {};
  try {
    tokens = parseTokens(await fs.readFile(path.join(dir, 'tokens.css'), 'utf8'));
  } catch {
    /* no tokens.css — G4 simply has no known tokens */
  }

  return { files: bounded, tokens };
}

// ---- per-viewport findings -------------------------------------------------

/**
 * Tag every finding with the viewport it was observed at, so a merged report is
 * unambiguous about which breakpoint failed. The id goes into the evidence (a
 * selector stays a usable CSS selector) which also makes two identical findings
 * at different viewports distinct signatures for the oscillation guard.
 */
export function tagFindings(gates: GateResult[], viewportId: string): GateResult[] {
  return gates.map((gate) => ({
    ...gate,
    findings: gate.findings.map((finding): VerifyFinding => ({
      ...finding,
      evidence: `@${viewportId} ${finding.evidence}`,
    })),
  }));
}

// ---- merging viewport results ---------------------------------------------

const STATUS_RANK: Record<GateStatus, number> = {
  pass: 0,
  skipped: 1,
  warn: 2,
  fail: 3,
};

/** Fold per-viewport gate results into one gate per id, worst status wins. */
function mergeGates(perViewport: GateResult[][]): GateResult[] {
  const merged = new Map<GateId, GateResult>();
  for (const gates of perViewport) {
    for (const gate of gates) {
      const current = merged.get(gate.gate);
      if (!current) {
        merged.set(gate.gate, {
          gate: gate.gate,
          status: gate.status,
          findings: [...gate.findings],
          ...(gate.note ? { note: gate.note } : {}),
        });
        continue;
      }
      current.findings.push(...gate.findings);
      if (STATUS_RANK[gate.status] > STATUS_RANK[current.status]) current.status = gate.status;
      if (gate.note) current.note = current.note ? `${current.note}; ${gate.note}` : gate.note;
    }
  }
  return GATE_ORDER.filter((gate) => merged.has(gate)).map((gate) => merged.get(gate)!);
}

// ---- oscillation guard -----------------------------------------------------

type RunSnapshot = {
  signatures: Set<string>;
  gateStatus: Partial<Record<GateId, GateStatus>>;
};

type OscillationState = {
  /** Signatures present in an older run, absent in the previous run, back now. */
  reappeared: string[];
  /** Gates alternating A→B→A between the two previous runs and this one. */
  flipped: GateId[];
};

/**
 * Compare the current run to the previous two. A finding that was present, then
 * fixed (absent), then present again is oscillating; so is a gate whose status
 * alternates A→B→A. One-way change is progress, not oscillation, so it is not
 * flagged.
 */
export function detectOscillation(
  history: RunSnapshot[],
  current: RunSnapshot,
): OscillationState {
  const previous = history[history.length - 1];
  const older = history[history.length - 2];
  if (!previous || !older) return { reappeared: [], flipped: [] };

  const reappeared: string[] = [];
  for (const signature of current.signatures) {
    if (older.signatures.has(signature) && !previous.signatures.has(signature)) {
      reappeared.push(signature);
    }
  }

  const flipped: GateId[] = [];
  for (const gate of GATE_ORDER) {
    const a = older.gateStatus[gate];
    const b = previous.gateStatus[gate];
    const c = current.gateStatus[gate];
    if (a !== undefined && a === c && b !== undefined && b !== a) flipped.push(gate);
  }

  return { reappeared, flipped };
}

let history: RunSnapshot[] = [];
let lastReport: VerifyReport | null = null;

/** The most recent report, for `GET /verify/report`. */
export function getLastReport(): VerifyReport | null {
  return lastReport;
}

/** Forget cross-run oscillation history (tests and a fresh session). */
export function resetVerifyHistory(): void {
  history = [];
}

// ---- provider verification block ------------------------------------------

/** The bounded block attached to `browser.open`/`capture`/`resize`/`snapshot`. */
export function providerVerification(
  url: string,
  gates: GateResult[],
  viewports: string[] = [],
  note?: string,
): ProviderVerification {
  return {
    url,
    ranAt: new Date().toISOString(),
    viewports,
    gates: gates.map((gate) => ({
      gate: gate.gate,
      status: gate.status,
      summary: summarizeFindings(gate.findings),
    })),
    ...(note ? { note } : {}),
  };
}

/**
 * Package a finished matrix report as the bounded provider block the browser
 * actions attach to their `data`. A halted run (oscillation, deadline, or the
 * user taking surface control) is reported through the optional `note`.
 */
export function providerVerificationFromReport(report: VerifyReport): ProviderVerification {
  return providerVerification(
    report.url,
    report.gates,
    report.viewports,
    report.halted?.reason,
  );
}

// ---- the run ---------------------------------------------------------------

export type RunVerificationOptions = {
  /** Project dir for token/source context; null when there is no project. */
  dir: string | null;
  url: string;
  /** Viewport ids to run (`VIEWPORTS` ids); omitted means the full matrix. */
  viewports?: string[];
  /**
   * Navigate to `url` before the matrix (default true). A browser action that
   * has already loaded the page passes false so it verifies what is on screen.
   */
  navigate?: boolean;
  maxIterations?: number;
  deadlineMs?: number;
};

export async function runVerification(opts: RunVerificationOptions): Promise<VerifyReport> {
  const dir = opts.dir;
  if (dir !== null && !path.isAbsolute(dir)) throw new Error('dir must be an absolute project path');

  let matrix: Viewport[] = opts.viewports && opts.viewports.length
    ? VIEWPORTS.filter((v) => opts.viewports!.includes(v.id))
    : [...VIEWPORTS];
  if (matrix.length === 0) matrix = [...VIEWPORTS];

  const maxIterations = opts.maxIterations ?? MAX_ITERATIONS;
  const deadlineMs = opts.deadlineMs ?? DEFAULT_DEADLINE_MS;
  const started = Date.now();

  const browser = await ensureBrowser();
  const restore = browser.viewport();
  const camera = await browser.getCamera();
  try {
  if (opts.navigate !== false) await browser.navigate(opts.url);
  await browser.applyStableMode();

  const ctx = await gatherGateContext(dir);

  const perViewport: GateResult[][] = [];
  const halts: VerifyHalt[] = [];
  let iterations = 0;

  for (const viewport of matrix) {
    // Never resize while the user holds surface control: results would be
    // captured at a size the user did not ask for, so stop instead.
    if (getController() === 'user') {
      halts.push({
        guard: 'control',
        reason:
          'the user is controlling the shared browser; the viewport matrix stopped before resizing. ' +
          'Wait for control to return, then retry the browser action.',
      });
      break;
    }
    if (iterations >= maxIterations) {
      halts.push({ guard: 'iterations', reason: `stopped after ${iterations} viewport iteration(s)` });
      break;
    }
    if (Date.now() - started > deadlineMs) {
      halts.push({ guard: 'deadline', reason: `wall-clock budget of ${deadlineMs}ms exceeded` });
      break;
    }
    iterations++;

    await browser.resize(viewport.width, viewport.height);
    await browser.applyStableMode();
    const probe: ProbeReport = await browser.getProbe();
    perViewport.push(tagFindings(runGateReport(probe, ctx), viewport.id));
  }

  const gates = mergeGates(perViewport);
  const summary = summarizeFindings(gates.flatMap((gate) => gate.findings));

  const snapshot: RunSnapshot = {
    signatures: new Set(gates.flatMap((gate) => gate.findings.map(findingSignature))),
    gateStatus: Object.fromEntries(gates.map((gate) => [gate.gate, gate.status])) as Partial<
      Record<GateId, GateStatus>
    >,
  };
  const oscillation = detectOscillation(history, snapshot);
  history.push(snapshot);
  if (history.length > 3) history.shift();

  if (oscillation.reappeared.length > 0 || oscillation.flipped.length > 0) {
    halts.push({
      guard: 'oscillation',
      reason: [
        oscillation.reappeared.length > 0
          ? `${oscillation.reappeared.length} finding(s) reappeared after being fixed`
          : '',
        oscillation.flipped.length > 0
          ? `gate(s) ${oscillation.flipped.join(', ')} flipped back and forth`
          : '',
      ]
        .filter(Boolean)
        .join('; '),
      signatures: oscillation.reappeared,
    });
  }

  const report: VerifyReport = {
    url: opts.url,
    ranAt: new Date().toISOString(),
    viewports: matrix.slice(0, iterations).map((viewport) => viewport.id),
    gates,
    summary,
    iterations,
    ...(halts.length > 0 ? { halted: halts[0] } : {}),
  };
  lastReport = report;
  return report;
  } finally {
    if (getController() !== 'user' && (await browser.state()).windowOpen) {
      try { await browser.resize(restore.width, restore.height); }
      finally { await browser.restoreCamera(camera); }
    }
  }
}
