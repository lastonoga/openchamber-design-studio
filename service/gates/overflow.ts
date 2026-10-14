// G1 — horizontal overflow.
//
// The single most common "looks broken on a phone" defect: one wide child makes
// the whole document scroll sideways. The probe reports the document's
// scrollWidth/clientWidth and flags any element whose box hangs past the
// viewport, so this gate only has to compare numbers.
import { gateStatusFromFindings } from '../../shared/verify-types.ts';
import type { GateResult, VerifyFinding } from '../../shared/verify-types.ts';
import type { ProbeReport } from './probe.ts';
import { dedupeFindings, rectRight } from './probe.ts';

/** 1px absorbs sub-pixel scrollbar rounding rather than hiding real overflow. */
const TOLERANCE = 1;

export function runOverflowGate(probe: ProbeReport): GateResult {
  const findings: VerifyFinding[] = [];

  if (probe.scrollWidth > probe.clientWidth + TOLERANCE) {
    findings.push({
      id: 'overflow/horizontal',
      gate: 'G1',
      severity: 'P0',
      message: `Page scrolls horizontally: the document is ${probe.scrollWidth - probe.clientWidth}px wider than its viewport.`,
      evidence: `scrollWidth ${probe.scrollWidth} > clientWidth ${probe.clientWidth}`,
    });

    const docWidth = Math.max(probe.clientWidth, probe.innerWidth);
    for (const el of probe.selectors) {
      const right = rectRight(el);
      const offRight = right > docWidth + TOLERANCE;
      const offLeft = el.rect.x < 0;
      if (!offRight && !offLeft) continue;
      findings.push({
        id: 'overflow/element',
        gate: 'G1',
        severity: 'P0',
        selector: el.selector,
        message: offRight
          ? `Element extends past the ${docWidth}px document width.`
          : 'Element sits left of the viewport edge.',
        evidence: offRight ? `rect.right ${right} > width ${docWidth}` : `rect.x ${el.rect.x} < 0`,
      });
    }
  }

  const unique = dedupeFindings(findings);
  return { gate: 'G1', status: gateStatusFromFindings('G1', unique), findings: unique };
}
