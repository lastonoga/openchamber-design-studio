// The gate engine's view of a page probe.
//
// The shapes themselves are single-sourced in shared/verify-types.ts (so the
// browser driver and the gates cannot drift); this module re-exports them and
// adds the pure predicates the gates share. Everything here is a plain value or
// a pure predicate — no DOM, no I/O — so the gates can run identically in a unit
// test and against a live page, and the same input always yields the same
// verdict (same promise as service/lint.ts).
import type {
  ProbeElement,
  ProbeRect,
  ProbeReport,
  ProbeStyles,
  VerifyFinding,
} from '../../shared/verify-types.ts';

export type { ProbeElement, ProbeRect, ProbeReport, ProbeStyles } from '../../shared/verify-types.ts';

const INTERACTIVE_TAGS = new Set(['a', 'button', 'input', 'select', 'textarea', 'summary', 'option']);

const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'tab',
  'checkbox',
  'radio',
  'switch',
  'textbox',
  'searchbox',
  'combobox',
  'slider',
  'spinbutton',
]);

function nonEmpty(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Whether the element is the kind a user can act on or focus. */
export function isInteractive(el: ProbeElement): boolean {
  const tag = (el.tag ?? '').toLowerCase();
  if (INTERACTIVE_TAGS.has(tag)) return true;
  const role = (el.role ?? '').toLowerCase();
  if (role && INTERACTIVE_ROLES.has(role)) return true;
  return typeof el.tabIndex === 'number' && el.tabIndex >= 0;
}

/** A display:none element has no rendered box; skip it for a11y/layout rules. */
export function isRendered(el: ProbeElement): boolean {
  return !el.styles || el.styles.display !== 'none';
}

/** Accessible name, best effort, from whatever the probe/host supplied. */
export function hasAccessibleName(el: ProbeElement): boolean {
  return nonEmpty(el.label) || nonEmpty(el.ariaLabel);
}

/** Does the element carry readable text worth contrast-checking? */
export function hasText(el: ProbeElement): boolean {
  return hasAccessibleName(el);
}

/** Heading level 1–6, from the explicit field or the tag name. */
export function headingLevelOf(el: ProbeElement): number | null {
  if (typeof el.headingLevel === 'number' && el.headingLevel >= 1 && el.headingLevel <= 6) {
    return el.headingLevel;
  }
  const m = /^h([1-6])$/.exec((el.tag ?? '').toLowerCase());
  return m ? parseInt(m[1]!, 10) : null;
}

/** Computed font-size in CSS px; computed styles are px, but rem/em are handled too. */
export function fontSizePx(value: string): number | null {
  const m = /^([\d.]+)\s*(px|rem|em)?$/i.exec((value ?? '').trim());
  if (!m) return null;
  const n = parseFloat(m[1]!);
  if (Number.isNaN(n)) return null;
  const unit = (m[2] ?? 'px').toLowerCase();
  if (unit === 'px') return n;
  if (unit === 'rem' || unit === 'em') return n * 16;
  return null;
}

/** WCAG large text: >= 24px, or >= 18.66px at semibold weight (>= 700). */
export function isLargeText(fontSize: string, fontWeight: string): boolean {
  const px = fontSizePx(fontSize);
  if (px === null) return false;
  if (px >= 24) return true;
  const weight = parseInt(fontWeight, 10);
  return px >= 18.66 && Number.isFinite(weight) && weight >= 700;
}

/**
 * Fully transparent backgrounds cannot be contrast-checked against an inherited
 * page colour without guessing, so the gate skips them.
 */
export function isFullyTransparent(color: string): boolean {
  const v = (color ?? '').trim().toLowerCase();
  if (!v || v === 'transparent') return true;

  const fn = /^(rgba?|hsla?)\(([^)]*)\)$/.exec(v);
  if (fn) {
    const name = fn[1]!;
    const body = fn[2]!;
    if (name.endsWith('a')) {
      const tokens = body.split(',');
      const last = tokens[tokens.length - 1]!.trim();
      const alpha = last.endsWith('%') ? parseFloat(last) / 100 : parseFloat(last);
      if (alpha === 0) return true;
    } else if (body.includes('/')) {
      const alphaTok = body.split('/')[1]!.trim();
      const alpha = alphaTok.endsWith('%') ? parseFloat(alphaTok) / 100 : parseFloat(alphaTok);
      if (alpha === 0) return true;
    }
  }

  const hex = /^#([0-9a-f]{4}|[0-9a-f]{8})$/.exec(v);
  if (hex) {
    const h = hex[1]!;
    const alpha = h.length === 4 ? h[3]! : h.slice(6);
    if (alpha === '0' || alpha === '00') return true;
  }
  return false;
}

export function rectRight(el: ProbeElement): number {
  return el.rect.x + el.rect.width;
}

/** Strict overlap: touching edges do not count. */
export function rectsOverlap(a: ProbeRect, b: ProbeRect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** True when `outer` fully contains `inner` (nested elements, not siblings). */
export function rectContains(outer: ProbeRect, inner: ProbeRect): boolean {
  return (
    outer.x <= inner.x &&
    outer.y <= inner.y &&
    outer.x + outer.width >= inner.x + inner.width &&
    outer.y + outer.height >= inner.y + inner.height
  );
}

/** Drop findings that repeat the same rule, selector and evidence. */
export function dedupeFindings(findings: VerifyFinding[]): VerifyFinding[] {
  const seen = new Set<string>();
  const out: VerifyFinding[] = [];
  for (const f of findings) {
    const key = `${f.id}|${f.selector ?? ''}|${f.evidence}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}
