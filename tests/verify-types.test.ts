import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  AWKWARD_WIDTHS,
  GATE_LABELS,
  GATE_ORDER,
  VIEWPORTS,
  findingSignature,
  gateStatusFromFindings,
  summarizeFindings,
} from '../shared/verify-types.ts';
import type { GateId, VerifyFinding } from '../shared/verify-types.ts';
import { PROBE_EXPR, PROBE_SCRIPT } from '../shared/probe-script.ts';

test('VIEWPORTS is ordered small to large with the agreed sizes', () => {
  assert.deepEqual(
    VIEWPORTS.map((v) => [v.id, v.width, v.height, v.mode]),
    [
      ['mobile', 390, 844, 'mobile'],
      ['tablet', 768, 1024, 'tablet'],
      ['desktop', 1280, 800, 'desktop'],
      ['wide', 2048, 1152, 'wide'],
    ],
  );
  const widths = VIEWPORTS.map((v) => v.width);
  assert.deepEqual(widths, [...widths].sort((a, b) => a - b));
  assert.deepEqual([...AWKWARD_WIDTHS], [320, 375, 1024, 1440]);
});

test('GATE_ORDER is cheap-first and holds exactly the five gate ids', () => {
  assert.deepEqual([...GATE_ORDER], ['G1', 'G4', 'G3', 'G6', 'G5']);
  assert.deepEqual([...GATE_ORDER].sort(), ['G1', 'G3', 'G4', 'G5', 'G6']);
  const labelled = Object.keys(GATE_LABELS).sort();
  assert.deepEqual(labelled, ['G1', 'G3', 'G4', 'G5', 'G6']);
});

function finding(over: Partial<VerifyFinding> = {}): VerifyFinding {
  return {
    id: 'overflow/horizontal',
    gate: 'G1',
    severity: 'P0',
    selector: 'div.hero',
    message: 'page scrolls sideways',
    evidence: 'scrollWidth 812 > clientWidth 390',
    ...over,
  };
}

test('summarizeFindings counts findings by severity', () => {
  const summary = summarizeFindings([
    finding({ severity: 'P0' }),
    finding({ severity: 'P1', id: 'a' }),
    finding({ severity: 'P1', id: 'b' }),
    finding({ severity: 'P2', id: 'c' }),
  ]);
  assert.deepEqual(summary, { p0: 1, p1: 2, p2: 1 });
  assert.deepEqual(summarizeFindings([]), { p0: 0, p1: 0, p2: 0 });
});

test('gateStatusFromFindings honours tolerance, fail and pass', () => {
  const gate: GateId = 'G1';
  const none: VerifyFinding[] = [];
  const problems = [finding()];

  assert.equal(gateStatusFromFindings(gate, problems, { tolerated: true }), 'warn');
  assert.equal(gateStatusFromFindings(gate, problems), 'fail');
  assert.equal(gateStatusFromFindings(gate, none), 'pass');

  // findings for another gate must not leak into this gate's status.
  assert.equal(gateStatusFromFindings('G1', [finding({ gate: 'G3' })]), 'pass');
});

test('findingSignature is stable and identifies the finding', () => {
  const f = finding();
  const sig = findingSignature(f);
  assert.equal(sig, findingSignature(f));
  assert.equal(sig, 'G1|div.hero|overflow/horizontal|scrollWidth 812 > clientWidth 390');

  // no selector still yields a positionally stable signature.
  assert.equal(
    findingSignature(finding({ selector: undefined })),
    'G1||overflow/horizontal|scrollWidth 812 > clientWidth 390',
  );
  assert.notEqual(findingSignature(f), findingSignature(finding({ id: 'overflow/vertical' })));
});

test('PROBE_SCRIPT and PROBE_EXPR are non-empty and parse as JavaScript', () => {
  assert.ok(PROBE_SCRIPT.length > 0);
  assert.ok(PROBE_EXPR.length > 0);

  assert.doesNotThrow(() => {
    new Function(PROBE_SCRIPT);
  });
  assert.doesNotThrow(() => {
    new Function('return (' + PROBE_EXPR + ')');
  });

  assert.match(PROBE_SCRIPT, /layout-shift/);
  assert.match(PROBE_SCRIPT, /__dsProbe/);
});

test('PROBE_SCRIPT skips data-ds-overlay elements (the pick outline)', () => {
  // The live window's pick feedback marks its outline with data-ds-overlay;
  // the probe must ignore that subtree so gates never see a highlight.
  assert.match(PROBE_SCRIPT, /data-ds-overlay/, 'the probe knows the overlay marker');
  assert.match(PROBE_SCRIPT, /isDsOverlay/, 'the probe has an overlay exclusion helper');
  assert.match(
    PROBE_SCRIPT,
    /closest\(\s*['"]\[data-ds-overlay\]/,
    'the exclusion walks up to the data-ds-overlay root',
  );
});
