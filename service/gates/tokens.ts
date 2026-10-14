// G4 — design tokens.
//
// Greppy and deterministic, the same philosophy as service/lint.ts: scan source
// text for two smells — a `var(--x)` with no definition, and a hardcoded colour
// on a value that should have come from a token. False positives are tolerable
// because every finding carries the `path:line` where it was seen, so a human
// can dismiss it in one glance. No filesystem, no network.
import { parseColor } from '../lint.ts';
import { gateStatusFromFindings } from '../../shared/verify-types.ts';
import type { GateResult, VerifyFinding } from '../../shared/verify-types.ts';
import { dedupeFindings } from './probe.ts';

export type TokensInput = {
  files: { path: string; text: string }[];
  tokens: Record<string, string>;
};

/** Blank out comment bodies while preserving length, so indices/line numbers stay put. */
function blankComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '));
}

function lineOf(text: string, index: number): number {
  let line = 1;
  const end = Math.min(index, text.length);
  for (let i = 0; i < end; i++) if (text[i] === '\n') line++;
  return line;
}

/**
 * A selector opens a token/theme scope when it is `:root`, a data-theme /
 * colour-scheme hook, a `.theme`/`.dark` class, or a prefers-color-scheme
 * media query. Colours declared there are token definitions, not raw colour.
 */
function isTokenSelector(selector: string): boolean {
  const s = selector.trim().toLowerCase();
  if (!s) return false;
  return (
    /:root\b/.test(s) ||
    /\[data-theme\b/.test(s) ||
    /\[data-color-scheme\b/.test(s) ||
    /(?:^|[\s,>+~])\.theme\b/.test(s) ||
    /(?:^|[\s,>+~])\.dark\b/.test(s) ||
    /prefers-color-scheme/.test(s)
  );
}

/** Ranges [openBrace, closeBrace] of every block that lives in a token scope. */
function tokenScopeRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const stack: Array<{ token: boolean; start: number }> = [];
  let prelude = '';

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '{') {
      const parentToken = stack.length > 0 ? stack[stack.length - 1]!.token : false;
      stack.push({ token: parentToken || isTokenSelector(prelude), start: i });
      prelude = '';
    } else if (ch === '}') {
      const block = stack.pop();
      if (block && block.token) ranges.push([block.start, i]);
      prelude = '';
    } else if (ch === ';') {
      prelude = '';
    } else {
      prelude += ch;
    }
  }
  return ranges;
}

/**
 * Canonical form for comparing literals to token values. Alpha is dropped (the
 * same simplification parseColor makes); invalid lengths return null.
 */
function normalizeColor(value: string): string | null {
  const v = (value ?? '').trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,8})$/.exec(v);
  if (hex) {
    let h = hex[1]!;
    if (h.length === 3) h = h.replace(/./g, (c) => c + c);
    else if (h.length === 4) h = h.slice(0, 3).replace(/./g, (c) => c + c);
    else if (h.length === 6) {
      /* already canonical */
    } else if (h.length === 8) h = h.slice(0, 6);
    else return null;
    return `#${h}`;
  }
  const rgb = parseColor(v);
  if (rgb) return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  return null;
}

const VAR_RE = /var\(\s*(--[A-Za-z0-9_-]+)/g;
const COLOR_RE = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})\b|(?:rgba?|hsla?)\([^)]*\)/gi;

export function runTokensGate(input: TokensInput): GateResult {
  const findings: VerifyFinding[] = [];
  const tokens = input.tokens ?? {};
  const defined = new Set(Object.keys(tokens));

  // literal colour -> token name, for "use the token" findings.
  const tokenByColor = new Map<string, string>();
  for (const [name, value] of Object.entries(tokens)) {
    const norm = normalizeColor(value);
    if (norm && !tokenByColor.has(norm)) tokenByColor.set(norm, name);
  }

  for (const file of input.files ?? []) {
    const text = blankComments(file.text ?? '');
    const ranges = tokenScopeRanges(text);
    const inTokenScope = (index: number): boolean =>
      ranges.some(([start, end]) => index >= start && index <= end);

    let m: RegExpExecArray | null;

    VAR_RE.lastIndex = 0;
    while ((m = VAR_RE.exec(text))) {
      const name = m[1]!;
      if (defined.has(name)) continue;
      findings.push({
        id: 'tokens/undefined-var',
        gate: 'G4',
        severity: 'P0',
        message: `var(${name}) is referenced but not defined.`,
        evidence: `${file.path}:${lineOf(text, m.index)}`,
      });
    }

    COLOR_RE.lastIndex = 0;
    while ((m = COLOR_RE.exec(text))) {
      if (inTokenScope(m.index)) continue;
      const literal = m[0]!;
      const norm = normalizeColor(literal);
      const token = norm ? tokenByColor.get(norm) : undefined;
      const line = lineOf(text, m.index);
      if (token) {
        findings.push({
          id: 'tokens/token-literal',
          gate: 'G4',
          severity: 'P1',
          message: `Colour ${literal} is defined by ${token}; use var(${token}) instead.`,
          evidence: `${file.path}:${line}`,
        });
      } else {
        findings.push({
          id: 'tokens/raw-color',
          gate: 'G4',
          severity: 'P1',
          message: `Raw colour ${literal} used outside a token/theme scope.`,
          evidence: `${file.path}:${line}`,
        });
      }
    }
  }

  const unique = dedupeFindings(findings);
  return { gate: 'G4', status: gateStatusFromFindings('G4', unique), findings: unique };
}
