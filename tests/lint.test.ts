import { test } from 'node:test';
import assert from 'node:assert/strict';

import { contrastRatio, lintHtml } from '../service/lint.ts';

test('contrastRatio computes WCAG ratios and rejects unparseable colours', () => {
  assert.equal(contrastRatio('#000', '#fff'), 21);
  assert.equal(contrastRatio('#fff', '#fff'), 1);
  assert.equal(contrastRatio('rgb(0,0,0)', 'white'), 21);
  assert.equal(contrastRatio('not-a-colour', '#fff'), null);
});

test('flags indigo and violet brand colours', () => {
  const res = lintHtml('<style>.btn{background:#6366F1;color:#8b5cf6}</style>');
  const indigo = res.findings.filter((f) => f.rule === 'anti-slop/indigo');
  assert.equal(indigo.length, 2);
  assert.ok(indigo.every((f) => f.severity === 'P0'));
});

test('flags a two-stop linear-gradient hero but not a three-stop one', () => {
  const two = lintHtml('<style>.hero{background:linear-gradient(135deg, #111, #222)}</style>');
  const finding = two.findings.find((f) => f.rule === 'anti-slop/hero-gradient');
  assert.ok(finding);
  assert.match(finding!.evidence ?? '', /linear-gradient/);

  const three = lintHtml('<style>.hero{background:linear-gradient(135deg, #111, #222, #333)}</style>');
  assert.equal(three.findings.some((f) => f.rule === 'anti-slop/hero-gradient'), false);
});

test('flags an emoji used as a button icon', () => {
  const res = lintHtml('<button>🚀 Launch</button>');
  assert.ok(res.findings.some((f) => f.rule === 'anti-slop/emoji-icon'));
});

test('flags invented metrics', () => {
  const res = lintHtml('<p>Ship 3x faster and 50% better today.</p>');
  assert.ok(res.findings.some((f) => f.rule === 'anti-slop/invented-metric'));
});

test('flags more than two uses of the accent colour', () => {
  const html =
    '<style>:root{--accent:#ff7a00}.a{color:#ff7a00}.b{background:#ff7a00}.c{background-color:#ff7a00}</style>';
  const res = lintHtml(html);
  assert.equal(res.accentUses, 3);
  assert.ok(res.findings.some((f) => f.rule === 'color/accent-usage' && f.severity === 'P1'));
});

test('flags low-contrast body text', () => {
  const res = lintHtml('<style>body{color:#999999;background:#ffffff}</style>');
  assert.equal(res.contrast.length, 1);
  assert.ok(res.findings.some((f) => f.rule === 'contrast/body'));
});

test('a clean document yields no P0 findings', () => {
  const html = [
    '<!doctype html><html><head><style>',
    'body{color:#111111;background:#ffffff;font-size:16px}',
    '.hero{background:linear-gradient(90deg,#111111,#ffffff,#111111)}',
    '</style></head><body>',
    '<h1>Design Studio</h1>',
    '<button>Send</button>',
    '<p>Readable body text.</p>',
    '</body></html>',
  ].join('\n');
  const res = lintHtml(html);
  assert.deepEqual(
    res.findings.filter((f) => f.severity === 'P0'),
    [],
  );
  assert.equal(res.accentUses, 0);
});
