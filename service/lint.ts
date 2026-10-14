// Deterministic design linter — the "anti-slop + contrast gate".
//
// Pure, synchronous and network-free: the panel sends one already-stitched
// document and gets back the same verdict every time. Nothing here reads the
// filesystem, spawns a process or parses a URL, so the same input always yields
// the same findings.
//
// The output shape lives in ../shared/lint-types.ts so the panel can render it
// without importing this file.
import type { ContrastResult, LintFinding, LintResult } from '../shared/lint-types.ts';

/** Brand hexes that read as "generic AI landing page". */
const INDIGO = ['#6366f1', '#4f46e5', '#4338ca', '#3730a3', '#8b5cf6', '#7c3aed', '#a855f7'];

const DEFAULT_ACCENT = '#5b8cff';
const MAX_FINDINGS = 50;

type RGB = [number, number, number];

function clampChannel(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

/** Parse #rgb/#rrggbb, rgb()/rgba() and named white/black. Returns null otherwise. */
export function parseColor(input: string): RGB | null {
  const value = input.trim().toLowerCase();
  if (!value) return null;
  if (value === 'white') return [255, 255, 255];
  if (value === 'black') return [0, 0, 0];

  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (hex) {
    let h = hex[1]!;
    if (h.length === 3) h = h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]!;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  const rgb = /^rgba?\(\s*([^)]+)\s*\)$/i.exec(value);
  if (rgb) {
    const parts = rgb[1]!.split(',').map((p) => p.trim());
    if (parts.length < 3) return null;
    const nums = parts.slice(0, 3).map((p) => (p.endsWith('%') ? (parseFloat(p) / 100) * 255 : parseFloat(p)));
    if (nums.some((n) => Number.isNaN(n))) return null;
    return [clampChannel(nums[0]!), clampChannel(nums[1]!), clampChannel(nums[2]!)];
  }

  return null;
}

/** WCAG relative luminance of an sRGB colour. */
function luminance([r, g, b]: RGB): number {
  const chan = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

/**
 * Contrast ratio (L1 + 0.05) / (L2 + 0.05), rounded to two decimals.
 * Returns null when either colour cannot be parsed.
 */
export function contrastRatio(fg: string, bg: string): number | null {
  const a = parseColor(fg);
  const b = parseColor(bg);
  if (!a || !b) return null;
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

/** Normalize the first #rgb/#rrggbb in a value to lowercase six digits. */
function normalizeHex(value: string): string | null {
  const m = /#([0-9a-f]{3}|[0-9a-f]{6})(?![0-9a-f])/i.exec(value);
  if (!m) return null;
  let h = m[1]!.toLowerCase();
  if (h.length === 3) h = h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]!;
  return `#${h}`;
}

type Decl = { prop: string; value: string };

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Flatten a stylesheet into selector/body pairs. Grouping at-rules (@media,
 * @supports, @layer…) are unwrapped; their inner rules are still collected.
 */
function parseStyleRules(css: string): { selector: string; body: string }[] {
  const rules: { selector: string; body: string }[] = [];
  let depth = 0;
  let captureDepth = -1;
  let prelude = '';
  let selector = '';
  let body = '';

  for (let i = 0; i < css.length; i++) {
    const ch = css[i]!;
    if (ch === '{') {
      if (captureDepth < 0) {
        if (!prelude.trim().startsWith('@')) {
          selector = prelude.trim();
          body = '';
          captureDepth = depth + 1;
        }
      } else {
        body += '{';
      }
      depth++;
      prelude = '';
    } else if (ch === '}') {
      if (captureDepth >= 0 && depth === captureDepth) {
        if (selector) rules.push({ selector, body });
        captureDepth = -1;
        selector = '';
        body = '';
      }
      depth = Math.max(0, depth - 1);
      prelude = '';
    } else if (captureDepth < 0) {
      prelude += ch;
    } else {
      body += ch;
    }
  }
  return rules;
}

function declarationsFromBody(body: string): Decl[] {
  const out: Decl[] = [];
  for (const chunk of body.split(';')) {
    const idx = chunk.indexOf(':');
    if (idx < 0) continue;
    const prop = chunk.slice(0, idx).trim().toLowerCase();
    const value = chunk
      .slice(idx + 1)
      .replace(/!important\s*$/i, '')
      .trim();
    if (prop) out.push({ prop, value });
  }
  return out;
}

type Rule = { selector: string; decls: Decl[] };

/** Every declaration from <style> blocks and inline style="" attributes. */
function collectRules(html: string): Rule[] {
  const rules: Rule[] = [];

  const styleRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m: RegExpExecArray | null;
  while ((m = styleRe.exec(html))) {
    for (const rule of parseStyleRules(stripComments(m[1]!))) {
      rules.push({ selector: rule.selector, decls: declarationsFromBody(rule.body) });
    }
  }

  const inlineRe = /<([a-z][\w-]*)\b[^>]*\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  while ((m = inlineRe.exec(html))) {
    const tag = m[1]!.toLowerCase();
    const style = m[2] ?? m[3] ?? '';
    rules.push({ selector: tag, decls: declarationsFromBody(style) });
  }

  return rules;
}

function parseFontSize(value: string): number | null {
  const m = /^([\d.]+)\s*(px|rem|em)?$/i.exec(value.trim());
  if (!m) return null;
  const n = parseFloat(m[1]!);
  if (Number.isNaN(n)) return null;
  const unit = (m[2] ?? 'px').toLowerCase();
  if (unit === 'px') return n;
  if (unit === 'rem' || unit === 'em') return n * 16;
  return null;
}

function findMatchingParen(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i]!;
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function splitTopLevel(args: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const c of args) {
    if (c === '(') depth++;
    else if (c === ')') depth--;
    if (c === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** Count colour stops, dropping a leading direction/angle keyword if present. */
function gradientStops(args: string): number {
  const parts = splitTopLevel(args);
  if (parts.length === 0) return 0;
  const first = parts[0]!;
  const isDirection =
    /^(?:to\s|[-+]?(?:\d*\.)?\d+(?:deg|grad|rad|turn)\b|(?:top|bottom|left|right|center)\b)/i.test(first);
  return isDirection ? parts.slice(1).length : parts.length;
}

function isEmoji(ch: string): boolean {
  return /\p{Extended_Pictographic}/u.test(ch);
}

/** The declaration that encloses a match, for readable evidence. */
function contextOf(text: string, idx: number, len: number): string {
  let s = idx;
  while (s > 0 && !/[;{}"']/.test(text[s - 1]!)) s--;
  let e = idx + len;
  while (e < text.length && !/[;{}"']/.test(text[e]!)) e++;
  return text.slice(s, e).trim();
}

export function lintHtml(html: string): LintResult {
  // data: URIs are huge and full of colour-looking noise; strip them first.
  const clean = html.replace(/data:[^"')\s>]*/gi, '');

  const findings: LintFinding[] = [];

  // 1. Indigo / violet brand colours.
  const indigoRe = new RegExp(`#(?:${INDIGO.map((h) => h.slice(1)).join('|')})(?![0-9a-f])`, 'gi');
  const seenIndigo = new Set<string>();
  let im: RegExpExecArray | null;
  while ((im = indigoRe.exec(clean))) {
    const hex = im[0]!.toLowerCase();
    if (seenIndigo.has(hex)) continue;
    seenIndigo.add(hex);
    findings.push({
      rule: 'anti-slop/indigo',
      severity: 'P0',
      message: 'Hardcoded indigo or violet brand colour detected.',
      evidence: hex,
    });
  }

  // 2. Two-stop hero gradients.
  const gradRe = /linear-gradient\s*\(/gi;
  let gm: RegExpExecArray | null;
  while ((gm = gradRe.exec(clean))) {
    const open = gm.index + gm[0].length - 1;
    const close = findMatchingParen(clean, open);
    if (close < 0) break;
    if (gradientStops(clean.slice(open + 1, close)) === 2) {
      findings.push({
        rule: 'anti-slop/hero-gradient',
        severity: 'P0',
        message: 'Two-stop hero gradient detected.',
        evidence: contextOf(clean, gm.index, close - gm.index + 1),
      });
    }
    gradRe.lastIndex = close + 1;
  }

  // 3. Emoji used as a button/link/emphasis icon.
  const tagRe = /<(button|a|i)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let tm: RegExpExecArray | null;
  while ((tm = tagRe.exec(clean))) {
    const trimmed = (tm[2] ?? '').trim();
    if (!trimmed) continue;
    const chars = Array.from(trimmed);
    if (isEmoji(chars[0]!) || isEmoji(chars[chars.length - 1]!)) {
      findings.push({
        rule: 'anti-slop/emoji-icon',
        severity: 'P0',
        message: 'Emoji used as an icon in a button, link or emphasis element.',
        evidence: tm[0]!.trim().slice(0, 120),
      });
    }
  }

  // 4. Invented metrics.
  const metricRe = /\b\d+(?:\.\d+)?\s*[x×]\b|\b\d{2,}%\s*(?:faster|more|better)\b/gi;
  const seenMetric = new Set<string>();
  let mm: RegExpExecArray | null;
  while ((mm = metricRe.exec(clean))) {
    const text = mm[0]!.replace(/\s+/g, ' ').trim();
    if (seenMetric.has(text)) continue;
    seenMetric.add(text);
    findings.push({
      rule: 'anti-slop/invented-metric',
      severity: 'P0',
      message: 'Invented metric claim detected.',
      evidence: text,
    });
  }

  // 5. Accent usage.
  const rules = collectRules(clean);
  const decls = rules.flatMap((r) => r.decls);
  const accentDecl = decls.find((d) => d.prop === '--accent');
  const accent = (accentDecl && normalizeHex(accentDecl.value)) || DEFAULT_ACCENT;
  const accentRe = new RegExp(`${accent}(?![0-9a-f])`, 'gi');
  let accentUses = 0;
  for (const d of decls) {
    if (d.prop === 'color' || d.prop === 'background' || d.prop === 'background-color') {
      const matches = d.value.match(accentRe);
      if (matches) accentUses += matches.length;
    }
  }
  if (accentUses > 2) {
    findings.push({
      rule: 'color/accent-usage',
      severity: 'P1',
      message: `Accent colour used ${accentUses} times; keep it to two per screen.`,
      evidence: accent,
    });
  }

  // 6. Contrast on rules that set both a text and a surface colour.
  const contrast: ContrastResult[] = [];
  for (const rule of rules) {
    let fg: string | null = null;
    let bg: string | null = null;
    let fontSize: number | null = null;
    for (const d of rule.decls) {
      if (d.prop === 'color') fg = d.value;
      else if (d.prop === 'background-color') bg = d.value;
      else if (d.prop === 'background' && !/url\(|gradient\(/i.test(d.value)) bg = d.value;
      else if (d.prop === 'font-size') fontSize = parseFontSize(d.value);
    }
    if (!fg || !bg) continue;
    const ratio = contrastRatio(fg, bg);
    if (ratio === null) continue;
    const large = fontSize !== null && fontSize >= 18;
    const level: ContrastResult['level'] = ratio >= 4.5 ? 'AA' : ratio >= 3 ? 'AA-large' : 'fail';
    contrast.push({ selector: rule.selector, fg, bg, ratio, level });
    const evidence = `${rule.selector} { color: ${fg}; background: ${bg} }`.trim();
    if (!large && ratio < 4.5) {
      findings.push({
        rule: 'contrast/body',
        severity: 'P0',
        message: `Body-text contrast ${ratio}:1 is below the 4.5:1 minimum.`,
        evidence,
      });
    } else if (large && ratio < 3) {
      findings.push({
        rule: 'contrast/large',
        severity: 'P0',
        message: `Large-text contrast ${ratio}:1 is below the 3:1 minimum.`,
        evidence,
      });
    }
  }

  const seen = new Set<string>();
  const unique: LintFinding[] = [];
  for (const f of findings) {
    const key = `${f.rule}|${f.evidence ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(f);
  }

  return { findings: unique.slice(0, MAX_FINDINGS), contrast, accentUses };
}
