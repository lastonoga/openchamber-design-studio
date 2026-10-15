// Focused tests for the picked-element attach chip (panel/attach-dialog.ts).
// The former attach-dialog mode was removed; what remains is the payload
// builder every pick path shares, so a chip is identical no matter which
// window picked the element. The SDK's connectHost needs a `window`, so a
// minimal shim is installed before importing (same pattern as panel-open).
import { test } from 'node:test';
import assert from 'node:assert/strict';

(globalThis as { window?: unknown }).window = {
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  parent: { postMessage: () => undefined },
};

const attachDialog = await import('../panel/attach-dialog.ts');

const PICK = {
  selector: '#view-hero > h1',
  tag: 'h1',
  classes: 'hero title',
  text: 'Plan trips together',
  outerHTML: '<h1 class="hero title">Plan trips together</h1>',
  styles: { color: 'rgb(15, 15, 15)', fontSize: '32px' },
  rect: { x: 100, y: 80, width: 320, height: 48 },
};

test('buildAttachPayload keeps the exact chip shape every pick path shares', () => {
  const pickedAt = new Date(1731500000000);
  const chip = attachDialog.buildAttachPayload(PICK, 7, 'http://127.0.0.1:5173/', pickedAt);
  assert.deepEqual(chip, {
    providerId: 'design-studio',
    id: 'element-7',
    title: '#view-hero > h1',
    url: 'http://127.0.0.1:5173/',
    text: chip.text,
    data: {
      selector: '#view-hero > h1',
      tag: 'h1',
      classes: PICK.classes,
      snippet: PICK.outerHTML,
      styles: PICK.styles,
      url: 'http://127.0.0.1:5173/',
    },
  });
  assert.match(chip.text!, /#view-hero > h1/);
  assert.equal(chip.data!.selector, chip.title);
});

test('a second pick of the same element gets its own chip id (no dedupe by shape)', () => {
  const first = attachDialog.buildAttachPayload(PICK, 7, 'http://127.0.0.1:5173/', new Date());
  const second = attachDialog.buildAttachPayload(PICK, 8, 'http://127.0.0.1:5173/', new Date());
  assert.notEqual(first.id, second.id);
  assert.deepEqual(first.data, second.data, 'identical elements carry identical context');
});
