import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CRAFT_RULES, defaultCraft, type CraftRuleId } from '../panel/craft.ts';

test('verification is a craft rule id with the breakpoint and token rules', () => {
  // Type-checked: 'verification' must be assignable to CraftRuleId.
  const id: CraftRuleId = 'verification';
  const rules = CRAFT_RULES[id];
  assert.match(rules, /every breakpoint/);
  assert.match(rules, /mobile 390, desktop 1280, wide 2048/);
  assert.match(rules, /tokens\.css \/ DESIGN\.md/);
  assert.match(rules, /Horizontal scroll/);
  assert.match(rules, /at least 24px \(44px on touch\)/);
});

test('defaultCraft includes the verification rules by default', () => {
  const text = defaultCraft();
  assert.match(text, /### verification/);
  assert.match(text, /at every breakpoint/);
});
