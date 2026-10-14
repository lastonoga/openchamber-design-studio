// Shared between the panel and the local service — the verifying harness's
// contract. Plain types and const tables only: no zod, no runtime deps, so
// every later lane can import the same shapes without pulling anything in.
//
// Severity is reused from lint-types so a verify finding and a lint finding
// speak the same "P0/P1/P2" language in the UI and in saved reports.
import type { LintSeverity } from './lint-types.ts';

export type ViewportMode = 'mobile' | 'tablet' | 'desktop' | 'wide';

export type Viewport = {
  id: string;
  label: string;
  width: number;
  height: number;
  mode?: ViewportMode;
};

/** Default capture matrix, ordered smallest to largest. */
export const VIEWPORTS: readonly Viewport[] = [
  { id: 'mobile', label: 'Mobile', width: 390, height: 844, mode: 'mobile' },
  { id: 'tablet', label: 'Tablet', width: 768, height: 1024, mode: 'tablet' },
  { id: 'desktop', label: 'Desktop', width: 1280, height: 800, mode: 'desktop' },
  { id: 'wide', label: 'Wide', width: 2048, height: 1152, mode: 'wide' },
];

// Pinch points a preset-only layout usually forgets; mirrors the responsive
// rule in panel/craft.ts ("test the awkward widths, not just the presets").
export const AWKWARD_WIDTHS: readonly number[] = [320, 375, 1024, 1440];

// ---- The page probe's shapes (single source of truth) -----------------------
//
// shared/probe-script.ts installs the in-page probe and returns a ProbeReport
// as a JSON string; the service parses that string and the gate engine reads
// these shapes. They live here, not in service/gates/probe.ts or
// service/browser.ts, so there is exactly one definition and the browser
// driver, the gates and the panel all agree.

export type ProbeRect = { x: number; y: number; width: number; height: number };

export type ProbeStyles = {
  color: string;
  backgroundColor: string;
  fontSize: string;
  fontWeight: string;
  display: string;
  position: string;
};

/**
 * One described element from the probe. `label` already folds together
 * aria-label, `<label>`, placeholder and visible text (probe's labelFor), so it
 * is the best available accessible name. `ariaLabel` is accepted separately for
 * hosts that emit it verbatim; the probe itself does not.
 */
export type ProbeElement = {
  selector: string;
  tag: string;
  role?: string;
  label?: string;
  ariaLabel?: string;
  ariaHidden?: boolean;
  rect: ProbeRect;
  styles: ProbeStyles;
  hasAlt?: boolean;
  headingLevel?: number;
  tabIndex?: number;
};

/** The raw facts `window.__dsProbe()` reports, as parsed by `getProbe()`. */
export type ProbeReport = {
  scrollWidth: number;
  clientWidth: number;
  innerWidth: number;
  innerHeight: number;
  scrollHeight: number;
  /** Cumulative layout shift accumulated since navigation (0 when unobservable). */
  cls: number;
  selectors: ProbeElement[];
};

export type GateId = 'G1' | 'G3' | 'G4' | 'G5' | 'G6';

// Cheap and deterministic first, so an obviously broken page fails fast.
export const GATE_ORDER: readonly GateId[] = ['G1', 'G4', 'G3', 'G6', 'G5'];

export const GATE_LABELS: Record<GateId, string> = {
  G1: 'overflow',
  G3: 'accessibility',
  G4: 'design tokens',
  G5: 'layout invariants',
  G6: 'semantics',
};

export type GateStatus = 'pass' | 'fail' | 'warn' | 'skipped';

export type VerifyFinding = {
  /** Stable rule id within a gate, e.g. "overflow/horizontal". */
  id: string;
  gate: GateId;
  severity: LintSeverity;
  selector?: string;
  message: string;
  /** Short, machine-checkable string — the raw evidence, not prose. */
  evidence: string;
};

export type GateResult = {
  gate: GateId;
  status: GateStatus;
  findings: VerifyFinding[];
  note?: string;
};

export type VerifyReport = {
  url: string;
  ranAt: string;
  viewports: string[];
  gates: GateResult[];
  summary: { p0: number; p1: number; p2: number };
  iterations?: number;
  /** Set when a service-side loop guard stopped the run early. */
  halted?: VerifyHalt;
};

/** Why a `runVerification` loop stopped before finishing its viewport matrix. */
export type VerifyHalt = {
  guard: 'iterations' | 'deadline' | 'oscillation' | 'control';
  reason: string;
  /** For oscillation: the finding signature(s) or gate id(s) that flipped. */
  signatures?: string[];
};

/** Nests under `.design-studio.json` `harness.verify`; every field optional. */
export type VerifyConfig = {
  viewports?: string[];
  stabilize?: boolean;
};

/**
 * The bounded block a browser-control answer attaches to its `data`. The host
 * passes `data` through as-is, so this is the whole contract with the panel.
 */
export type ProviderVerification = {
  url: string;
  ranAt: string;
  viewports: string[];
  gates: { gate: GateId; status: GateStatus; summary: { p0: number; p1: number; p2: number } }[];
  note?: string;
};

/**
 * gate|selector|id|evidence — the identity of a finding. Comparing signatures
 * across iterations is how the loop detects a fix that oscillates rather than
 * converges.
 */
export function findingSignature(f: VerifyFinding): string {
  return `${f.gate}|${f.selector ?? ''}|${f.id}|${f.evidence}`;
}

export function summarizeFindings(findings: VerifyFinding[]): { p0: number; p1: number; p2: number } {
  const summary = { p0: 0, p1: 0, p2: 0 };
  for (const f of findings) {
    if (f.severity === 'P0') summary.p0++;
    else if (f.severity === 'P1') summary.p1++;
    else summary.p2++;
  }
  return summary;
}

/**
 * Derive a single gate's status from its findings. A clean gate passes;
 * tolerated findings warn instead of fail.
 */
export function gateStatusFromFindings(
  gate: GateId,
  findings: VerifyFinding[],
  opts?: { tolerated?: boolean },
): GateStatus {
  const own = findings.filter((f) => f.gate === gate);
  if (own.length === 0) return 'pass';
  if (opts?.tolerated) return 'warn';
  return 'fail';
}
