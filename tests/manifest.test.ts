import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { parseManifestJson } from '@openchamber/sdk/schemas';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('package.json carries a valid OpenChamber manifest', async () => {
  const json = await readFile(path.join(root, 'package.json'), 'utf8');
  const result = parseManifestJson(json) as { ok: boolean; error?: string; manifest?: unknown };
  assert.equal(result.ok, true, `manifest rejected: ${result.error ?? 'unknown'}`);
});

// The surface stays thin, but `panel.entry` is required because the SDK only
// accepts `page`, `commands` and `statusSection`'s frame beside it — they carry
// the full-screen page and the `/design` slash command. `panel.dock`/`panel.size`
// still require a shared `service.surface` we do not have, so they stay absent.
test('declared entries match the shipped files: panel row, page, command and status section', async () => {
  const json = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')) as {
    openchamber: {
      contributes: {
        panel: { id: string; name?: string; icon?: string; entry?: string; dock?: string; size?: number };
        page?: unknown;
        attach?: { mode?: string; entry?: string };
        capabilities?: string[];
        commands?: { name: string; description?: string }[];
        statusSection?: { entry?: string; title?: string; requiresProject?: boolean; defaultExpanded?: boolean; height?: number };
        service?: { entry: string; runtime: string; surface?: boolean; provides?: string[] };
      };
    };
  };
  const contributes = json.openchamber.contributes;

  // Panel identity plus the page the rail icon and the full-screen page paint.
  assert.equal(contributes.panel.id, 'design-studio');
  assert.equal(contributes.panel.entry, 'panel/index.html', 'panel.entry carries page + commands');
  // dock/size only make sense beside a shared service surface, which we do not ship.
  assert.equal(contributes.panel.dock, undefined, 'no dock without service.surface');
  assert.equal(contributes.panel.size, undefined, 'no size without service.surface');

  // The `/design` slash command stays; the "+"-menu attach dialog is gone.
  assert.deepEqual(contributes.commands, [
    { name: 'design', description: 'Toggle Design Mode and attach design context' },
  ]);
  assert.equal(contributes.attach, undefined, 'the attach dialog contribution is removed');

  // The chat Work Status section still reuses the same page.
  assert.equal(contributes.statusSection?.entry, 'panel/index.html');
  assert.equal(contributes.statusSection?.title, 'Design Mode');
  assert.equal(contributes.statusSection?.requiresProject, true);
  assert.equal(contributes.statusSection?.defaultExpanded, true);
  assert.equal(typeof contributes.statusSection?.height, 'number', 'a compact height is declared');

  // The service this host starts to own the real Chrome window.
  assert.equal(contributes.service?.runtime, 'host');
  assert.equal(contributes.service?.surface, undefined);
  assert.ok(contributes.service?.provides?.includes('browser'), 'service provides the browser role');
  // startSession and prompt are still needed by the row.
  assert.ok(contributes.capabilities?.includes('sessions'), 'declares the sessions capability');
  assert.ok(contributes.capabilities?.includes('prompt'), 'declares the prompt capability');

  // The full-screen sidebar page reuses the panel page.
  assert.deepEqual(contributes.page, { entry: 'panel/index.html', title: 'OpenChamber Design Studio' });

  // The built bundles must exist: OpenChamber never compiles extension code.
  await assert.doesNotReject(readFile(path.join(root, 'panel', 'main.js')));
  await assert.doesNotReject(readFile(path.join(root, 'service', 'main.js')));
});

// The installed SDK makes contributes.panel a required key; a manifest without
// it is rejected. This pins why the identity panel stays (only its entry is
// dropped) rather than the whole panel being removed.
test('the SDK requires contributes.panel, so only its entry can be dropped', () => {
  const withoutPanel = JSON.stringify({
    openchamber: {
      apiVersion: 1,
      contributes: {
        statusSection: { entry: 'panel/index.html', title: 'Design Mode' },
        service: { entry: 'service/main.js', runtime: 'host', provides: ['browser'] },
      },
    },
  });
  const result = parseManifestJson(withoutPanel) as { ok: boolean; code?: string };
  assert.equal(result.ok, false);
  assert.equal(result.code, 'missing-panel');
});
