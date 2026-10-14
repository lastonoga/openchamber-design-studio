// listProjectFiles: the recursive, sorted, capped, escape-safe walk the panel
// uses to attach a FILE reference. Temp dirs only — no network, no Chrome.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { listProjectFiles } from '../service/project-files.ts';

/** Create a file, making its parent directories. */
async function fill(root: string, rel: string, text = 'x'): Promise<void> {
  const abs = path.join(root, rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, text, 'utf8');
}

test('lists nested files as sorted relative POSIX paths and keeps dotfiles', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'ds-files-'));
  try {
    await fill(root, 'b/two.txt');
    await fill(root, 'a/one.txt');
    await fill(root, 'root.txt');
    await fill(root, 'a/nested/three.txt');
    await fill(root, '.design-studio.json', '{}');

    const files = await listProjectFiles(root);
    assert.deepEqual(files, [
      '.design-studio.json',
      'a/nested/three.txt',
      'a/one.txt',
      'b/two.txt',
      'root.txt',
    ]);
    // The contract is files only, relative and POSIX.
    for (const file of files) {
      assert.equal(path.isAbsolute(file), false);
      assert.equal(file.includes('\\'), false);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('skips node_modules, dist, build and any dotted directory, but keeps top-level dotfiles', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'ds-files-skip-'));
  try {
    await fill(root, 'src/app.ts');
    await fill(root, 'node_modules/dep/index.js');
    await fill(root, 'dist/out.js');
    await fill(root, 'build/out.js');
    await fill(root, '.git/config');
    await fill(root, '.cache/tmp');
    await fill(root, '.next/tmp');
    await fill(root, '.design-studio/cache');
    await fill(root, '.openchamber/state');
    await fill(root, '.design-studio.json', '{}');

    const files = await listProjectFiles(root);
    assert.deepEqual(files, ['.design-studio.json', 'src/app.ts']);
    for (const skipped of [
      'node_modules/dep/index.js',
      'dist/out.js',
      'build/out.js',
      '.git/config',
      '.cache/tmp',
      '.next/tmp',
      '.design-studio/cache',
      '.openchamber/state',
    ]) {
      assert.equal(files.includes(skipped), false, `${skipped} must be skipped`);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('never follows a symlink that escapes the project root', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'ds-files-escape-'));
  const outside = await mkdtemp(path.join(tmpdir(), 'ds-files-outside-'));
  try {
    await fill(outside, 'secret.txt');
    await fill(root, 'inside.txt');
    // A symlinked directory pointing outside the project, and a symlinked file.
    await symlink(outside, path.join(root, 'escape-dir'), 'dir');
    await symlink(path.join(outside, 'secret.txt'), path.join(root, 'escape-file.txt'), 'file');

    const files = await listProjectFiles(root);
    assert.deepEqual(files, ['inside.txt']);
    for (const file of files) {
      assert.equal(file.includes('escape'), false, `${file} escapes the root`);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test('caps the listing at the requested limit and defaults safely', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'ds-files-cap-'));
  try {
    for (let i = 0; i < 6; i++) await fill(root, `file-${i}.txt`);

    const capped = await listProjectFiles(root, 3);
    assert.equal(capped.length, 3);
    // Sorted, so the cap keeps the first entries in name order.
    assert.deepEqual(capped, ['file-0.txt', 'file-1.txt', 'file-2.txt']);

    const all = await listProjectFiles(root);
    assert.equal(all.length, 6, 'the default limit keeps every file here');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('refuses a non-absolute dir and an invalid limit', async () => {
  await assert.rejects(() => listProjectFiles('relative/path'), /absolute/);
  const root = await mkdtemp(path.join(tmpdir(), 'ds-files-bad-'));
  try {
    await assert.rejects(() => listProjectFiles(root, 0), /limit/);
    await assert.rejects(() => listProjectFiles(root, -1), /limit/);
    await assert.rejects(() => listProjectFiles(root, 1.5), /limit/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects a dir that cannot be read', async () => {
  const missing = path.join(tmpdir(), `ds-files-missing-${Date.now()}`);
  await assert.rejects(() => listProjectFiles(missing));
});
