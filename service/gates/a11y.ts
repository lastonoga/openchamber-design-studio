// G3 — accessibility.
//
// Contrast reuses the exact WCAG maths from service/lint.ts so a page cannot
// pass the linter and fail the harness on the same pair. A fully transparent
// background is skipped with a note: the effective surface is inherited from an
// ancestor the probe did not measure, and guessing a colour would be worse than
// saying nothing.
import { contrastRatio } from '../lint.ts';
import { gateStatusFromFindings } from '../../shared/verify-types.ts';
import type { GateResult, VerifyFinding } from '../../shared/verify-types.ts';
import type { ProbeReport } from './probe.ts';
import { dedupeFindings, hasAccessibleName, hasText, isFullyTransparent, isInteractive, isLargeText, isRendered } from './probe.ts';

const NORMAL_MIN = 4.5;
const LARGE_MIN = 3;

export function runA11yGate(probe: ProbeReport): GateResult {
  const findings: VerifyFinding[] = [];
  let skippedTransparent = 0;

  for (const el of probe.selectors) {
    if (!isRendered(el)) continue;
    const styles = el.styles;

    // Contrast — only for elements that actually carry text.
    if (styles && hasText(el)) {
      if (isFullyTransparent(styles.backgroundColor)) {
        skippedTransparent++;
      } else {
        const ratio = contrastRatio(styles.color, styles.backgroundColor);
        if (ratio !== null) {
          const large = isLargeText(styles.fontSize, styles.fontWeight);
          const min = large ? LARGE_MIN : NORMAL_MIN;
          if (ratio < min) {
            findings.push({
              id: large ? 'a11y/contrast-large' : 'a11y/contrast',
              gate: 'G3',
              severity: 'P0',
              selector: el.selector,
              message: `${large ? 'Large' : 'Normal'} text contrast ${ratio}:1 is below the ${min}:1 minimum.`,
              evidence: `${styles.color} on ${styles.backgroundColor} = ${ratio}:1`,
            });
          }
        }
      }
    }

    // Interactive element with no accessible name.
    if (el.ariaHidden !== true && isInteractive(el) && !hasAccessibleName(el)) {
      findings.push({
        id: 'a11y/name',
        gate: 'G3',
        severity: 'P0',
        selector: el.selector,
        message: 'Interactive element has no accessible name.',
        evidence: `${el.tag} name empty`,
      });
    }

    // <img> with no alt attribute at all (alt="" is a valid decorative image).
    if ((el.tag ?? '').toLowerCase() === 'img' && el.hasAlt !== true) {
      findings.push({
        id: 'a11y/img-alt',
        gate: 'G3',
        severity: 'P0',
        selector: el.selector,
        message: 'Image is missing an alt attribute.',
        evidence: 'img alt missing',
      });
    }
  }

  const unique = dedupeFindings(findings);
  const note =
    skippedTransparent > 0
      ? `${skippedTransparent} text element(s) on a transparent background were not contrast-checked.`
      : undefined;
  return { gate: 'G3', status: gateStatusFromFindings('G3', unique), findings: unique, ...(note ? { note } : {}) };
}
