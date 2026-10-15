// Focused tests for the exclusive pick→chat bridge claim (service/bridge-claim.ts).
// The hidden pane `/design` mounts inside a chat window claims ownership and
// heartbeats; every other panel must see `bridgeActive` and stand down. A dead
// holder's claim expires so the Work Status row quietly resumes.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BridgeClaims } from '../service/bridge-claim.ts';

test('a fresh claim wins; a second window is refused while the claim is warm', () => {
  const bridge = new BridgeClaims(4000, () => 1000);
  const first = bridge.claim();
  assert.equal(first.ok, true);
  assert.equal(bridge.active(), true);
  const second = bridge.claim();
  assert.deepEqual(second, { ok: false, bridgeActive: true });
});

test('the holder renews with its token; a foreign token still gets refused', () => {
  const bridge = new BridgeClaims(4000, () => 1000);
  const first = bridge.claim();
  assert.ok(first.ok);
  if (!first.ok) return;
  const renewed = bridge.claim(first.token);
  assert.equal(renewed.ok, true);
  if (renewed.ok) assert.equal(renewed.token, first.token, 'the holder keeps its identity');
  assert.deepEqual(bridge.claim('ds-bridge-forged'), { ok: false, bridgeActive: true });
});

test('the claim expires: after the TTL the next window takes over cleanly', () => {
  let now = 1000;
  const bridge = new BridgeClaims(4000, () => now);
  const hold = bridge.claim();
  assert.ok(hold.ok);
  if (!hold.ok) return;
  assert.equal(bridge.active(), true);
  now = 1000 + 4001;
  assert.equal(bridge.active(), false, 'the warm claim expires after the ttl');
  const takeover = bridge.claim();
  assert.ok(takeover.ok, 'an expired claim is replaced, not refused');
  if (takeover.ok) assert.notEqual(takeover.token, hold.token);
  // the dead holder's stale token must not renew the new owner's claim
  assert.deepEqual(bridge.claim(hold.token), { ok: false, bridgeActive: true });
});

test('release only works for the current holder with a warm claim', () => {
  const bridge = new BridgeClaims(4000, () => 1000);
  assert.equal(bridge.release('ds-bridge-nobody'), false, 'a foreign token cannot drop someone else’s bridge');
  const hold = bridge.claim();
  assert.ok(hold.ok);
  if (!hold.ok) return;
  assert.equal(bridge.release('wrong-token'), false);
  assert.equal(bridge.active(), true, 'a wrong-token release leaves the bridge up');
  assert.equal(bridge.release(hold.token), true);
  assert.equal(bridge.active(), false, 'the holder released cleanly');
  assert.equal(bridge.claim().ok, true, 'after release a new claim is served immediately');
});

test('a released-then-reclaimed bridge does not accept the old token as a heartbeat', () => {
  const bridge = new BridgeClaims(4000, () => 1000);
  const first = bridge.claim();
  assert.ok(first.ok);
  if (!first.ok) return;
  bridge.release(first.token);
  const second = bridge.claim();
  assert.ok(second.ok);
  assert.deepEqual(bridge.claim(first.token), { ok: false, bridgeActive: true }, 'the old holder is just another window now');
});
