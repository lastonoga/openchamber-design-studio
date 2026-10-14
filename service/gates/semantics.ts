// G6 — document semantics.
//
// Heading structure and the focus/AT contract: exactly one h1, no skipped
// levels, every control named, and nothing that is hidden from assistive tech
// while still being reachable by keyboard.
import { gateStatusFromFindings } from '../../shared/verify-types.ts';
import type { GateResult, VerifyFinding } from '../../shared/verify-types.ts';
import type { ProbeElement, ProbeReport } from './probe.ts';
import { dedupeFindings, hasAccessibleName, headingLevelOf, isInteractive, isRendered } from './probe.ts';

export function runSemanticsGate(probe: ProbeReport): GateResult {
  const findings: VerifyFinding[] = [];

  // The probe emits headings in document order; filtering preserves that order.
  const headings = probe.selectors
    .map((el) => ({ el, level: headingLevelOf(el) }))
    .filter((h): h is { el: ProbeElement; level: number } => h.level !== null);

  const h1Count = headings.filter((h) => h.level === 1).length;
  if (h1Count !== 1) {
    findings.push({
      id: 'semantics/h1-count',
      gate: 'G6',
      severity: 'P1',
      message: `Expected exactly one <h1>, found ${h1Count}.`,
      evidence: `h1 count ${h1Count}`,
    });
  }

  let prev = 0;
  for (const { el, level } of headings) {
    if (prev > 0 && level > prev + 1) {
      findings.push({
        id: 'semantics/heading-order',
        gate: 'G6',
        severity: 'P1',
        selector: el.selector,
        message: `Heading level jumps from h${prev} to h${level}.`,
        evidence: `h${prev} -> h${level}`,
      });
    }
    prev = level;
  }

  for (const el of probe.selectors) {
    if (!isRendered(el)) continue;
    if (el.ariaHidden === true) continue;
    if (isInteractive(el) && !hasAccessibleName(el)) {
      findings.push({
        id: 'semantics/unlabelled-control',
        gate: 'G6',
        severity: 'P0',
        selector: el.selector,
        message: 'Interactive element has no accessible name.',
        evidence: `${el.tag} name empty`,
      });
    }
  }

  for (const el of probe.selectors) {
    if (el.ariaHidden === true && typeof el.tabIndex === 'number' && el.tabIndex >= 0) {
      findings.push({
        id: 'semantics/aria-hidden-focus',
        gate: 'G6',
        severity: 'P1',
        selector: el.selector,
        message: 'Element is hidden from assistive technology but still focusable.',
        evidence: `aria-hidden tabindex ${el.tabIndex}`,
      });
    }
  }

  const unique = dedupeFindings(findings);
  return { gate: 'G6', status: gateStatusFromFindings('G6', unique), findings: unique };
}
