// The prompt harness: assembles the discovery, board, edit and critique prompts
// the Design Studio panel hands to the model, and loads the optional project
// design context (DESIGN.md + tokens.css).
//
// All copy is English, since it is model-facing and the user requires English.

import type { LintFinding } from '../shared/lint-types.ts';
import type { VerifyReport } from '../shared/verify-types.ts';
import { GATE_LABELS, summarizeFindings } from '../shared/verify-types.ts';
import type { SelectedElement } from './compose.ts';
import { DIRECTIONS, defaultCraft, inferDirection } from './craft.ts';
import type { DirectionId } from './craft.ts';
import { VERIFY_PROTOCOL } from './mode.ts';
import { IDENTITY } from '../shared/harness-text.ts';

export type Fidelity = 'wireframe' | 'hi-fi' | 'interactive';
export type CritiquePolicy = 'required' | 'opt-in' | 'opt-out';

export type HarnessConfig = {
  direction: 'auto' | DirectionId;
  fidelity: Fidelity;
  critiquePolicy: CritiquePolicy;
  designMdPath: string;
  tokensPath: string;
};

export type DesignContext = {
  designMd: string | null;
  tokensCss: string | null;
};

export type ReadTextFile = (path: string) => Promise<string>;

function safeRead(read: ReadTextFile, path: string): Promise<string | null> {
  return read(path).catch(() => null);
}

export async function loadDesignContext(read: ReadTextFile, cfg: HarnessConfig): Promise<DesignContext> {
  const [designMd, tokensCss] = await Promise.all([
    safeRead(read, cfg.designMdPath),
    safeRead(read, cfg.tokensPath),
  ]);
  return { designMd, tokensCss };
}

export function resolveDirection(cfg: HarnessConfig, brief: string): DirectionId {
  return cfg.direction === 'auto' ? inferDirection(brief) : cfg.direction;
}

function fidelityLine(fidelity: Fidelity): string {
  switch (fidelity) {
    case 'wireframe':
      return 'Fidelity: WIREFRAME. Establish structure and navigation only. Do not settle final copy or color; use blocks and neutral placeholders.';
    case 'interactive':
      return 'Fidelity: INTERACTIVE. Build the full hi-fi page, and render all five data states (Loading, Empty, Error, Populated, Edge) plus purposeful motion.';
    case 'hi-fi':
    default:
      return 'Fidelity: HI-FI. Apply the full token set and build out every section to a finished, shippable look.';
  }
}

function directionLock(cfg: HarnessConfig, brief: string): string {
  const dir = DIRECTIONS[resolveDirection(cfg, brief)];
  return [
    `Direction: LOCKED to "${dir.name}" — ${dir.when}.`,
    'Apply this direction for the whole artifact; do not mix in another direction later.',
    `Posture: ${dir.posture.join(' ')}`,
  ].join('\n');
}

function contextSection(ctx: DesignContext): string | null {
  const parts: string[] = [];
  if (ctx.designMd) {
    parts.push('DESIGN.md (authoritative — follow it over any conflicting instinct):', '```markdown', ctx.designMd.trim(), '```');
  }
  if (ctx.tokensCss) {
    parts.push('tokens.css (authoritative — use these values, do not invent new ones):', '```css', ctx.tokensCss.trim(), '```');
  }
  return parts.length > 0 ? parts.join('\n') : null;
}

function preamble(entry: string, intent: string, cfg: HarnessConfig, ctx: DesignContext): string[] {
  const lines: string[] = [
    IDENTITY,
    '',
    `Entry file: ${entry || '(pick or create an entry html)'}`,
    directionLock(cfg, intent),
    fidelityLine(cfg.fidelity),
  ];
  const context = contextSection(ctx);
  if (context) {
    lines.push('', context);
  }
  lines.push('', 'Craft rules:', defaultCraft());
  lines.push('', 'Verification protocol:', VERIFY_PROTOCOL);
  return lines;
}

export function buildBoardPrompt(entry: string, intent: string, cfg: HarnessConfig, ctx: DesignContext): string {
  const intentText = intent.trim() || 'Build or refine the layout into something coherent and well-crafted.';
  return [
    ...preamble(entry, intent, cfg, ctx),
    '',
    `Task: ${intentText}`,
  ].join('\n');
}

function styleLines(styles: Record<string, string>): string {
  const keys = ['font-family', 'font-size', 'font-weight', 'line-height', 'color', 'background-color', 'border-radius', 'padding', 'margin', 'display', 'gap'];
  return keys
    .filter((key) => styles[key] && styles[key] !== 'normal' && styles[key] !== 'none')
    .map((key) => `  ${key}: ${styles[key]};`)
    .join('\n');
}

export function buildEditPrompt(entry: string, element: SelectedElement, intent: string, cfg: HarnessConfig, ctx: DesignContext): string {
  const intentText = intent.trim() || 'Improve this element so it looks better and matches its neighbours.';
  return [
    ...preamble(entry, intent, cfg, ctx),
    '',
    'Point-and-edit target:',
    `  selector: ${element.selector}`,
    `  tag: ${element.tag}${element.id ? `#${element.id}` : ''}`,
    `  classes: ${element.classes || '(none)'}`,
    `  text: ${element.text ? JSON.stringify(element.text) : '(empty)'}`,
    '  current styles:',
    styleLines(element.styles) || '    (no notable styles)',
    '  markup:',
    '```html',
    element.outerHTML,
    '```',
    '',
    `Task: ${intentText}`,
  ].join('\n');
}

function renderFindings(findings: LintFinding[]): string {
  if (findings.length === 0) return 'No automated findings.';
  return findings
    .map((f) => `- [${f.severity}] ${f.rule}: ${f.message}${f.evidence ? ` (evidence: ${f.evidence})` : ''}`)
    .join('\n');
}

function renderGateTable(report: VerifyReport): string {
  if (report.gates.length === 0) return 'No gates reported.';
  const rows = report.gates.map((g) => {
    const counts = summarizeFindings(g.findings);
    return `- ${GATE_LABELS[g.gate]} (${g.gate}): ${g.status} — P0 ${counts.p0} · P1 ${counts.p1}`;
  });
  rows.push(
    `Totals: P0 ${report.summary.p0} · P1 ${report.summary.p1} · P2 ${report.summary.p2}${report.iterations != null ? ` · iterations ${report.iterations}` : ''}`,
  );
  return rows.join('\n');
}

export function buildCritiquePrompt(entry: string, findings: LintFinding[], cfg: HarnessConfig, ctx: DesignContext, report?: VerifyReport): string {
  const dir = DIRECTIONS[resolveDirection(cfg, entry)];
  const lines: string[] = [
    IDENTITY,
    '',
    `Entry file: ${entry || '(pick or create an entry html)'}`,
    `Direction under critique: "${dir.name}" — ${dir.when}.`,
  ];
  const context = contextSection(ctx);
  if (context) {
    lines.push('', context);
  }
  if (report) {
    lines.push(
      '',
      'Verification gates (from the browser harness — authoritative, not advisory):',
      renderGateTable(report),
    );
  }
  lines.push(
    '',
    'The 0–10 critique below is advisory only: it is not pass/fail and never overrides a failing gate.',
    '',
    'Critique this artifact against its locked direction. Score each dimension 0–10 and justify each score:',
    '1. Philosophy consistency — does the page commit to one coherent direction? (0–3 lost direction; 4–6 partly; 7–10 fully owned)',
    '2. Visual hierarchy — is there a clear order of attention? (0–3 flat; 4–6 inconsistent; 7–10 deliberate)',
    '3. Detail execution — spacing, alignment, type and states handled with care. (0–3 sloppy; 4–6 uneven; 7–10 precise)',
    '4. Functionality — does every state and affordance actually work? (0–3 broken; 4–6 partial; 7–10 complete)',
    '5. Innovation — is anything memorable rather than a template default? (0–3 generic; 4–6 safe; 7–10 distinctive)',
    '',
    'Automated findings:',
    renderFindings(findings),
    '',
    'Then output:',
    '- Keep: what already works and must survive edits.',
    '- Fix: the ordered list of concrete problems to resolve.',
    '- Quick wins: the small changes with the largest payoff.',
  );
  return lines.join('\n');
}

export function buildDiscoveryPrompt(cfg: HarnessConfig): string {
  return [
    'You are the Design Studio discovery step. Ask the user at most 5 questions, and pre-fill a recommended default for each so they can accept it in one click.',
    'Do NOT ask the user to choose a visual direction — infer it from their brief.',
    '',
    'Cover exactly these areas:',
    '1. Goal and fidelity — what are we building, and is it wireframe, hi-fi, or interactive? (default: hi-fi)',
    '2. Audience — who is it for? (default: the most likely reader inferred from the brief)',
    '3. Delivery format and quantity — how many pages or screens, and in what form? (default: one entry page plus its sections)',
    '4. Brand context — is there a DESIGN.md, a reference to mimic, or should the direction be inferred? (default: infer)',
    '5. Content — real content now, or realistic placeholders to be swapped later? (default: realistic placeholders)',
    '',
    `Configured defaults: fidelity=${cfg.fidelity}, critiquePolicy=${cfg.critiquePolicy}.`,
    'Keep questions short and concrete, and state the recommended default inline with each one.',
  ].join('\n');
}
