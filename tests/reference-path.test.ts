import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, realpath, symlink, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import * as projectFiles from '../service/project-files.ts';

async function fixture(run: (root: string, base: string) => Promise<void>): Promise<void> {
  const base = await mkdtemp(path.join(tmpdir(), 'ds-reference-'));
  const root = path.join(base, 'project');
  await mkdir(root);
  await writeFile(path.join(root, 'same.ts'), 'not uploaded');
  await writeFile(path.join(base, 'external.ts'), 'not uploaded');
  try { await run(root, base); } finally { await rm(base, { recursive: true, force: true }); }
}

function resolver(): (dir: string, input: string) => Promise<{ path: string; sourceDirectory: string }> {
  const resolve = (projectFiles as Record<string, unknown>).resolveReferencePath;
  assert.equal(typeof resolve, 'function', 'explicit pasted-path resolution must exist');
  return resolve as ReturnType<typeof resolver>;
}

test('relative pasted paths capture a canonical source root and resolve file symlinks', async () => {
  await fixture(async (root, base) => {
    const resolve = resolver();
    await symlink(root, path.join(base, 'source-link'));
    await symlink(path.join(root, 'same.ts'), path.join(root, 'alias.ts'));
    assert.deepEqual(await resolve(path.join(base, 'source-link'), './alias.ts'), {
      path: await realpath(path.join(root, 'same.ts')), sourceDirectory: await realpath(root),
    });
    await mkdir(path.join(base, 'other'));
    await writeFile(path.join(base, 'other', 'same.ts'), 'different file');
    const first = await resolve(root, 'same.ts');
    const second = await resolve(path.join(base, 'other'), 'same.ts');
    assert.notEqual(first.path, second.path, 'basename must not determine identity');
    assert.equal(first.sourceDirectory, await realpath(root), 'later sources cannot reinterpret a retained path');
  });
});

test('an explicit absolute external file is allowed without reading/uploading contents', async () => {
  await fixture(async (root, base) => {
    const resolve = resolver();
    const external = await realpath(path.join(base, 'external.ts'));
    assert.deepEqual(await resolve(root, external), { path: external, sourceDirectory: await realpath(root) });
  });
});

test('nonexistent files and directories are rejected with an actionable reason', async () => {
  await fixture(async (root) => {
    const resolve = resolver();
    await assert.rejects(() => resolve(root, 'missing.ts'), /not found|exist|accessible/i);
    await assert.rejects(() => resolve(root, '.'), /regular file|directory/i);
  });
});

test('relative traversal and file/directory symlink escapes are rejected', async () => {
  await fixture(async (root, base) => {
    const resolve = resolver();
    await symlink(path.join(base, 'external.ts'), path.join(root, 'escape.ts'));
    await symlink(base, path.join(root, 'escape-dir'));
    for (const input of ['../external.ts', 'escape.ts', 'escape-dir/external.ts']) {
      await assert.rejects(() => resolve(root, input), /outside|within|escape/i, input);
    }
    await mkdir(root + '-sibling');
    await writeFile(path.join(root + '-sibling', 'same.ts'), 'sibling');
    await assert.rejects(() => resolve(root, '../project-sibling/same.ts'), /outside|within|escape/i);
  });
});

test('empty/control-character paths and non-absolute source roots are rejected', async () => {
  await fixture(async (root) => {
    const resolve = resolver();
    for (const input of ['', '  ', 'same.ts\n', '\0same.ts', 'same.ts\u007f', 'same.ts\u0085']) {
      await assert.rejects(() => resolve(root, input), /empty|paste|control|valid/i);
    }
    await assert.rejects(() => resolve('relative', 'same.ts'), /absolute/i);
  });
});

test('an unreadable regular file is rejected', { skip: process.getuid?.() === 0 ? 'root can read mode-000 files' : false }, async () => {
  await fixture(async (root) => {
    const resolve = resolver();
    const file = path.join(root, 'same.ts');
    await chmod(file, 0);
    try { await assert.rejects(() => resolve(root, 'same.ts'), /readable|permission|access/i); }
    finally { await chmod(file, 0o600); }
  });
});

test('source service exposes authenticated POST /reference validation without a build', { timeout: 15000 }, async () => {
  await fixture(async (root) => {
    const probe = createServer();
    probe.listen(0, '127.0.0.1');
    await once(probe, 'listening');
    const address = probe.address();
    assert.ok(address && typeof address === 'object');
    const port = address.port;
    await new Promise<void>((resolve) => probe.close(() => resolve()));
    const child = spawn(process.execPath, [new URL('../service/main.ts', import.meta.url).pathname], {
      env: { ...process.env, OPENCHAMBER_SERVICE_PORT: String(port), OPENCHAMBER_SERVICE_TOKEN: 'reference-test' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    const base = `http://127.0.0.1:${port}`;
    const headers = { authorization: 'Bearer reference-test', 'content-type': 'application/json' };
    try {
      const deadline = Date.now() + 8000;
      let healthy = false;
      while (Date.now() < deadline && child.exitCode === null) {
        try { healthy = (await fetch(base + '/health', { headers })).status === 200; } catch { /* starting */ }
        if (healthy) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      assert.ok(healthy, 'source service must become healthy: ' + output);
      assert.equal((await fetch(base + '/reference', { method: 'POST' })).status, 401);
      const response = await fetch(base + '/reference', { method: 'POST', headers, body: JSON.stringify({ dir: root, path: 'same.ts' }) });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { path: await realpath(path.join(root, 'same.ts')), sourceDirectory: await realpath(root) });
      assert.equal((await fetch(base + '/reference', { headers })).status, 405);
      for (const body of ['not JSON', JSON.stringify({ dir: root, path: 'missing.ts' }), JSON.stringify({ dir: root, path: '.' }), JSON.stringify({ dir: root, path: 42 })]) {
        const bad = await fetch(base + '/reference', { method: 'POST', headers, body });
        assert.equal(bad.status, 400);
        assert.equal(typeof (await bad.json() as { error: unknown }).error, 'string');
      }
    } finally {
      if (child.exitCode === null) {
        child.kill('SIGTERM');
        await once(child, 'exit');
      }
    }
  });
});
