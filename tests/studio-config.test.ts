import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { CONFIG_CANDIDATES, readStudioConfig, writeStudioConfig } from '../service/studio-config.ts';

test('write then read round-trips at the default config path', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'ds-config-'));
  const text = JSON.stringify({ version: 1, url: 'http://localhost:5173' }, null, 2);
  const { path: rel } = await writeStudioConfig(root, null, text);
  assert.equal(rel, CONFIG_CANDIDATES[0]);

  const { config, path: found } = await readStudioConfig(root);
  assert.equal(config?.url, 'http://localhost:5173');
  assert.equal(found, CONFIG_CANDIDATES[0]);
});

test('harness.verify round-trips the reduced shape (viewports and stabilize)', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'ds-config-verify-'));
  const verify = {
    viewports: ['mobile', 'desktop'],
    stabilize: true,
  };
  const text = JSON.stringify({ version: 1, harness: { verify } }, null, 2);
  await writeStudioConfig(root, null, text);

  const { config } = await readStudioConfig(root);
  assert.deepEqual(config?.harness?.verify, verify);
});

test('harness without verify still parses', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'ds-config-noverify-'));
  const text = JSON.stringify({ version: 1, harness: { direction: 'editorial' } }, null, 2);
  await writeStudioConfig(root, null, text);

  const { config } = await readStudioConfig(root);
  assert.equal(config?.harness?.direction, 'editorial');
  assert.equal(config?.harness?.verify, undefined);
});

test('readStudioConfig returns nulls when no config exists', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'ds-config-none-'));
  assert.deepEqual(await readStudioConfig(root), { config: null, path: null });
});

test('writeStudioConfig refuses escapes and invalid JSON', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'ds-config-bad-'));
  await assert.rejects(() => writeStudioConfig(root, '../evil.json', '{}'));
  await assert.rejects(() => writeStudioConfig(root, null, '{ not json'));
});
