// G5 — layout invariants.
//
// Three cheap geometric checks the probe's rects already answer: tap targets a
// thumb cannot hit, interactive elements stacked on each other, and a page that
// jitters as it loads. The 44px touch guideline is a note, not a finding — it is
// guidance for a phone, not a defect on a desktop capture.
import { gateStatusFromFindings } from '../../shared/verify-types.ts';
import type { GateResult, VerifyFinding } from '../../shared/verify-types.ts';
import type { ProbeReport } from './probe.ts';
import { dedupeFindings, isInteractive, isRendered, rectContains, rectsOverlap } from './probe.ts';

const MIN_TARGET = 24;
const TOUCH_TARGET = 44;
const MAX_CLS = 0.1;

export function runLayoutGate(probe: ProbeReport): GateResult {
  const findings: VerifyFinding[] = [];
  const interactive = probe.selectors.filter(
    (el) => isRendered(el) && isInteractive(el) && (el.rect.width > 0 || el.rect.height > 0),
  );

  let belowTouch = 0;
  for (const el of interactive) {
    const { width, height } = el.rect;
    if (width < MIN_TARGET || height < MIN_TARGET) {
      findings.push({
        id: 'layout/tap-target',
        gate: 'G5',
        severity: 'P1',
        selector: el.selector,
        message: `Tap target ${width}×${height}px is smaller than ${MIN_TARGET}×${MIN_TARGET}px.`,
        evidence: `${width}x${height} < ${MIN_TARGET}x${MIN_TARGET}`,
      });
    }
    if (width < TOUCH_TARGET || height < TOUCH_TARGET) belowTouch++;
  }

  for (let i = 0; i < interactive.length; i++) {
    for (let j = i + 1; j < interactive.length; j++) {
      const a = interactive[i]!;
      const b = interactive[j]!;
      if (!rectsOverlap(a.rect, b.rect)) continue;
      // A control nested inside another (or vice versa) is containment, not a
      // collision; only genuinely overlapping siblings are a defect.
      if (rectContains(a.rect, b.rect) || rectContains(b.rect, a.rect)) continue;
      findings.push({
        id: 'layout/overlap',
        gate: 'G5',
        severity: 'P2',
        selector: a.selector,
        message: `Interactive elements overlap: ${a.selector} and ${b.selector}.`,
        evidence: `${a.selector} ∩ ${b.selector}`,
      });
    }
  }

  if (probe.cls > MAX_CLS) {
    findings.push({
      id: 'layout/shift',
      gate: 'G5',
      severity: 'P1',
      message: `Cumulative layout shift ${probe.cls} exceeds ${MAX_CLS}.`,
      evidence: `cls ${probe.cls}`,
    });
  }

  const unique = dedupeFindings(findings);
  const note =
    belowTouch > 0 ? `${belowTouch} tap target(s) are below the ${TOUCH_TARGET}px touch guideline.` : undefined;
  return { gate: 'G5', status: gateStatusFromFindings('G5', unique), findings: unique, ...(note ? { note } : {}) };
}
