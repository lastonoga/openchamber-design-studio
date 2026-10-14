import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isColorValue, parseTokensCss, serializeTokensCss, toHex } from '../panel/tokens.ts';

test('parseTokensCss reads declarations and keeps the first of duplicates', () => {
  const css = `:root {\n  --bg: #0f1115;\n  --accent: #5b8cff;\n  --accent: #fff;\n  --gap: 8px;\n}`;
  assert.deepEqual(parseTokensCss(css), [
    { name: '--bg', value: '#0f1115' },
    { name: '--accent', value: '#5b8cff' },
    { name: '--gap', value: '8px' },
  ]);
});

test('serializeTokensCss rewrites in place and appends missing names', () => {
  const css = ':root {\n  --bg: #000;\n}';
  const out = serializeTokensCss(
    [
      { name: '--bg', value: '#111' },
      { name: '--accent', value: '#5b8cff' },
    ],
    css,
  );
  assert.match(out, /--bg: #111;/);
  assert.match(out, /--accent: #5b8cff;/);
});

test('serializeTokensCss creates a :root block when none exists', () => {
  const out = serializeTokensCss([{ name: '--bg', value: '#111' }], 'body { margin: 0; }');
  assert.match(out, /:root \{/);
  assert.match(out, /--bg: #111;/);
});

test('isColorValue and toHex classify token values', () => {
  assert.equal(isColorValue('#5b8cff'), true);
  assert.equal(isColorValue('rgb(0 0 0 / 50%)'), true);
  assert.equal(isColorValue('8px'), false);
  assert.equal(toHex('#abc'), '#aabbcc');
  assert.equal(toHex('rgb(0,0,0)'), null);
});
