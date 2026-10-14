import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DESIGN_SYSTEMS } from '../shared/design-systems.ts';

test('catalog is non-empty and has at least 12 presets', () => {
  assert.ok(Array.isArray(DESIGN_SYSTEMS));
  assert.ok(DESIGN_SYSTEMS.length >= 12, `expected >= 12 presets, got ${DESIGN_SYSTEMS.length}`);
});

test('preset ids are unique', () => {
  const ids = DESIGN_SYSTEMS.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate preset ids');
});

test('every preset has non-empty name, category, description and >= 4 tokens', () => {
  for (const preset of DESIGN_SYSTEMS) {
    assert.ok(preset.name.trim().length > 0, `${preset.id}: empty name`);
    assert.ok(preset.category.trim().length > 0, `${preset.id}: empty category`);
    assert.ok(preset.description.trim().length > 0, `${preset.id}: empty description`);
    assert.ok(
      preset.description.length <= 200,
      `${preset.id}: description is ${preset.description.length} chars`,
    );
    const tokenEntries = Object.entries(preset.tokens);
    assert.ok(
      tokenEntries.length >= 4,
      `${preset.id}: only ${tokenEntries.length} tokens`,
    );
    for (const [name, value] of tokenEntries) {
      assert.match(name, /^--/, `${preset.id}: token name "${name}" is not a custom property`);
      assert.ok(
        typeof value === 'string' && value.trim().length > 0,
        `${preset.id}: token "${name}" has an empty value`,
      );
    }
  }
});

test('every preset has a non-empty designMd excerpt <= 1400 chars', () => {
  for (const preset of DESIGN_SYSTEMS) {
    assert.ok(preset.designMd.trim().length > 0, `${preset.id}: empty designMd`);
    assert.ok(
      preset.designMd.length <= 1400,
      `${preset.id}: designMd is ${preset.designMd.length} chars`,
    );
  }
});

test('known OpenDesign slugs are present', () => {
  const ids = new Set(DESIGN_SYSTEMS.map((p) => p.id));
  for (const known of ['apple', 'linear-app', 'stripe', 'vercel', 'notion', 'shadcn', 'editorial', 'brutalism', 'bento', 'minimal']) {
    assert.ok(ids.has(known), `expected preset "${known}" to be present`);
  }
});

test('known presets carry their signature tokens', () => {
  const apple = DESIGN_SYSTEMS.find((p) => p.id === 'apple');
  assert.ok(apple, 'apple preset missing');
  assert.match(apple.tokens['--accent'] ?? '', /^#/);
  assert.ok(Object.keys(apple.tokens).length >= 20, 'apple: too few tokens');

  const linear = DESIGN_SYSTEMS.find((p) => p.id === 'linear-app');
  assert.ok(linear, 'linear-app preset missing');
  assert.ok(linear.name.length > 0);
});
