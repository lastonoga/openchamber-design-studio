// Teeth tests for the LANE A gate engine.
//
// Every gate gets a known-broken fixture that MUST produce a finding and a
// known-good fixture that MUST stay clean, so a gate that silently stops
// detecting anything fails the suite rather than passing it.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { contrastRatio } from '../service/lint.ts';
import {
  runA11yGate,
  runGateReport,
  runLayoutGate,
  runOverflowGate,
  runSemanticsGate,
  runTokensGate,
} from '../service/gates/index.ts';
import type { ProbeElement, ProbeReport, ProbeStyles } from '../service/gates/index.ts';

const BASE_STYLES: ProbeStyles = {
  color: '#111111',
  backgroundColor: '#ffffff',
  fontSize: '16px',
  fontWeight: '400',
  display: 'block',
  position: 'static',
};

function el(over: Partial<ProbeElement> & { selector: string; tag: string }): ProbeElement {
  return {
    rect: { x: 0, y: 0, width: 100, height: 40 },
    styles: { ...BASE_STYLES },
    ...over,
  };
}

function probe(over: Partial<ProbeReport> = {}): ProbeReport {
  return {
    scrollWidth: 1280,
    clientWidth: 1280,
    innerWidth: 1280,
    innerHeight: 800,
    scrollHeight: 2000,
    cls: 0.02,
    selectors: [],
    ...over,
  };
}

const ids = (findings: { id: string }[]): string[] => findings.map((f) => f.id);

// A clean page: one h1, labelled controls, an image with alt, contrast that
// passes, tap targets past 44px, stable layout, no horizontal overflow.
const goodProbe = probe({
  selectors: [
    el({
      selector: 'h1',
      tag: 'h1',
      headingLevel: 1,
      label: 'Design Studio',
      rect: { x: 0, y: 0, width: 400, height: 40 },
      styles: { ...BASE_STYLES, fontSize: '32px', fontWeight: '700' },
    }),
    el({
      selector: 'button.cta',
      tag: 'button',
      label: 'Send',
      tabIndex: 0,
      rect: { x: 0, y: 100, width: 120, height: 48 },
      styles: { ...BASE_STYLES, color: '#ffffff', backgroundColor: '#1a1a1a', display: 'inline-block' },
    }),
    el({ selector: 'img.hero', tag: 'img', hasAlt: true, rect: { x: 0, y: 200, width: 400, height: 300 } }),
  ],
});

const goodFiles = [{ path: 'styles.css', text: ':root {\n  --brand: #ff00ff;\n}\n.card {\n  color: var(--brand);\n}\n' }];
const goodTokens = { '--brand': '#ff00ff' };

test('a known-good report passes every gate G1/G3/G4/G5/G6', () => {
  const results = runGateReport(goodProbe, { files: goodFiles, tokens: goodTokens });
  assert.deepEqual(
    results.map((r) => r.gate),
    ['G1', 'G4', 'G3', 'G6', 'G5'],
    'runs in GATE_ORDER with G2 excluded',
  );
  for (const r of results) {
    assert.equal(r.status, 'pass', `${r.gate} should pass a clean page`);
    assert.deepEqual(r.findings, [], `${r.gate} should have no findings`);
  }
});

// ---- G1 overflow -----------------------------------------------------------

test('G1 flags a page that scrolls sideways and names the offending element', () => {
  const report = probe({
    scrollWidth: 1310,
    clientWidth: 1280,
    selectors: [el({ selector: 'div.hero', tag: 'div', rect: { x: 1200, y: 0, width: 110, height: 300 } })],
  });
  const result = runOverflowGate(report);
  assert.equal(result.status, 'fail');
  const page = result.findings.find((f) => f.id === 'overflow/horizontal');
  assert.ok(page, 'page-level overflow finding');
  assert.equal(page!.severity, 'P0');
  assert.equal(page!.evidence, 'scrollWidth 1310 > clientWidth 1280');
  const element = result.findings.find((f) => f.id === 'overflow/element');
  assert.ok(element, 'offending element finding');
  assert.equal(element!.selector, 'div.hero');
  assert.equal(element!.severity, 'P0');
});

test('G1 leaves within-tolerance pages alone', () => {
  const report = probe({ scrollWidth: 1281, clientWidth: 1280 });
  assert.equal(runOverflowGate(report).status, 'pass');
  assert.deepEqual(runOverflowGate(report).findings, []);
});

// ---- G3 a11y ---------------------------------------------------------------

test('G3 flags a 2.1:1 contrast pair as P0', () => {
  const ratio = contrastRatio('#000000', '#424242');
  assert.ok(ratio !== null && ratio > 2 && ratio < 2.2, `fixture ratio near 2.1 (got ${ratio})`);
  const report = probe({
    selectors: [
      el({
        selector: 'p.muted',
        tag: 'p',
        label: 'Muted copy',
        styles: { ...BASE_STYLES, color: '#000000', backgroundColor: '#424242' },
      }),
    ],
  });
  const result = runA11yGate(report);
  assert.equal(result.status, 'fail');
  const f = result.findings.find((x) => x.id === 'a11y/contrast');
  assert.ok(f, 'contrast finding');
  assert.equal(f!.severity, 'P0');
  assert.match(f!.evidence, /#000000 on #424242 = 2\.\d+:1/);
});

test('G3 flags an interactive element without an accessible name and an img without alt', () => {
  const report = probe({
    selectors: [
      el({
        selector: 'button.icon',
        tag: 'button',
        label: '',
        tabIndex: 0,
        styles: { ...BASE_STYLES, display: 'inline-block' },
      }),
      el({ selector: 'img.logo', tag: 'img', rect: { x: 0, y: 0, width: 32, height: 32 } }),
    ],
  });
  const result = runA11yGate(report);
  assert.equal(result.status, 'fail');
  assert.ok(ids(result.findings).includes('a11y/name'));
  assert.ok(ids(result.findings).includes('a11y/img-alt'));
  assert.ok(result.findings.filter((f) => f.id === 'a11y/name' || f.id === 'a11y/img-alt').every((f) => f.severity === 'P0'));
});

test('G3 skips a transparent background with a note instead of guessing', () => {
  const report = probe({
    selectors: [
      el({
        selector: 'a.link',
        tag: 'a',
        label: 'Read more',
        tabIndex: 0,
        styles: { ...BASE_STYLES, color: '#999999', backgroundColor: 'rgba(0, 0, 0, 0)', display: 'inline' },
      }),
    ],
  });
  const result = runA11yGate(report);
  assert.equal(result.status, 'pass');
  assert.ok(result.note && /transparent/i.test(result.note), 'note explains the skip');
});

// ---- G6 semantics ----------------------------------------------------------

test('G6 flags two h1s and an h2->h4 heading skip', () => {
  const report = probe({
    selectors: [
      el({ selector: 'h1.title', tag: 'h1', headingLevel: 1, label: 'Title' }),
      el({ selector: 'header > h1', tag: 'h1', headingLevel: 1, label: 'Brand' }),
      el({ selector: 'h2', tag: 'h2', headingLevel: 2, label: 'Section' }),
      el({ selector: 'h4', tag: 'h4', headingLevel: 4, label: 'Sub' }),
    ],
  });
  const result = runSemanticsGate(report);
  assert.equal(result.status, 'fail');
  const count = result.findings.find((f) => f.id === 'semantics/h1-count');
  assert.ok(count && count.severity === 'P1');
  assert.equal(count!.evidence, 'h1 count 2');
  const order = result.findings.find((f) => f.id === 'semantics/heading-order');
  assert.ok(order && order.severity === 'P1');
  assert.equal(order!.evidence, 'h2 -> h4');
});

test('G6 flags an unlabelled control and an aria-hidden element that is focusable', () => {
  const report = probe({
    selectors: [
      el({ selector: 'button.x', tag: 'button', label: '', tabIndex: 0, styles: { ...BASE_STYLES, display: 'inline-block' } }),
      el({ selector: 'div.trap', tag: 'div', label: 'text', ariaHidden: true, tabIndex: 0 }),
    ],
  });
  const result = runSemanticsGate(report);
  assert.equal(result.status, 'fail');
  assert.ok(ids(result.findings).includes('semantics/unlabelled-control'));
  const hidden = result.findings.find((f) => f.id === 'semantics/aria-hidden-focus');
  assert.ok(hidden && hidden.severity === 'P1');
});

test('G6 stays quiet when a single h1 is present and nothing is skipped', () => {
  const report = probe({
    selectors: [
      el({ selector: 'h1', tag: 'h1', headingLevel: 1, label: 'Title' }),
      el({ selector: 'h2', tag: 'h2', headingLevel: 2, label: 'Section' }),
      el({ selector: 'h3', tag: 'h3', headingLevel: 3, label: 'Sub' }),
    ],
  });
  assert.equal(runSemanticsGate(report).status, 'pass');
  assert.deepEqual(runSemanticsGate(report).findings, []);
});

// ---- G4 tokens -------------------------------------------------------------

test('G4 flags a raw colour outside :root and an undefined var', () => {
  const result = runTokensGate({
    files: [{ path: 'app.css', text: '.btn {\n  color: #ff00ff;\n  background: var(--missing);\n}\n' }],
    tokens: {},
  });
  assert.equal(result.status, 'fail');
  const raw = result.findings.find((f) => f.id === 'tokens/raw-color');
  assert.ok(raw && raw.severity === 'P1');
  assert.equal(raw!.evidence, 'app.css:2');
  const undef = result.findings.find((f) => f.id === 'tokens/undefined-var');
  assert.ok(undef && undef.severity === 'P0');
  assert.equal(undef!.evidence, 'app.css:3');
});

test('G4 flags a literal that a token already defines, outside theme scope', () => {
  const result = runTokensGate({
    files: [{ path: 'card.css', text: '.card {\n  color: #ff00ff;\n}\n' }],
    tokens: { '--brand': '#ff00ff' },
  });
  assert.equal(result.status, 'fail');
  const f = result.findings.find((x) => x.id === 'tokens/token-literal');
  assert.ok(f && f.severity === 'P1');
  assert.equal(f!.evidence, 'card.css:2');
});

test('G4 accepts colour declarations inside :root and defined vars', () => {
  const result = runTokensGate({
    files: goodFiles,
    tokens: goodTokens,
  });
  assert.equal(result.status, 'pass');
  assert.deepEqual(result.findings, []);
});

// ---- G5 layout -------------------------------------------------------------

test('G5 flags a 20px tap target, overlapping controls, and layout shift', () => {
  const report = probe({
    cls: 0.3,
    selectors: [
      el({
        selector: 'button.tiny',
        tag: 'button',
        label: 'x',
        tabIndex: 0,
        rect: { x: 0, y: 0, width: 20, height: 20 },
        styles: { ...BASE_STYLES, display: 'inline-block' },
      }),
      el({ selector: 'button.a', tag: 'button', label: 'A', tabIndex: 0, rect: { x: 100, y: 0, width: 40, height: 40 } }),
      el({ selector: 'button.b', tag: 'button', label: 'B', tabIndex: 0, rect: { x: 120, y: 10, width: 40, height: 40 } }),
    ],
  });
  const result = runLayoutGate(report);
  assert.equal(result.status, 'fail');
  const tap = result.findings.find((f) => f.id === 'layout/tap-target');
  assert.ok(tap && tap.severity === 'P1');
  assert.equal(tap!.selector, 'button.tiny');
  assert.ok(ids(result.findings).includes('layout/overlap'));
  const shift = result.findings.find((f) => f.id === 'layout/shift');
  assert.ok(shift && shift.severity === 'P1');
  assert.equal(shift!.evidence, 'cls 0.3');
  assert.ok(result.findings.find((f) => f.id === 'layout/overlap')!.severity === 'P2');
});

test('G5 ignores nested (contained) interactive elements and stable pages', () => {
  const nested = probe({
    selectors: [
      el({ selector: 'button.outer', tag: 'button', label: 'Outer', tabIndex: 0, rect: { x: 0, y: 0, width: 100, height: 100 } }),
      el({ selector: 'span.inner', tag: 'span', role: 'button', label: 'Inner', tabIndex: 0, rect: { x: 10, y: 10, width: 20, height: 20 } }),
    ],
  });
  const result = runLayoutGate(nested);
  // containment is not a collision; the inner 20px span is still a real tap-target finding.
  assert.equal(result.findings.some((f) => f.id === 'layout/overlap'), false);
});
