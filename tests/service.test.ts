import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TOKEN = 'test-token-123';

/** Reserve then release an ephemeral port. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

async function waitForHealth(port: number, child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`service exited early: ${child.exitCode}`);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`, { headers: { authorization: `Bearer ${TOKEN}` } });
      if (res.status === 200) return;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('service did not become healthy');
}

test('service requires the bearer token and reports live-window state', async () => {
  const port = 43000 + Math.floor(Math.random() * 2000);
  const project = await mkdtemp(path.join(tmpdir(), 'ds-service-'));
  await mkdir(path.join(project, 'design'), { recursive: true });
  await writeFile(
    path.join(project, 'design', 'index.html'),
    '<!doctype html><html><head><style>body{color:#123}</style></head><body><h1 class="t">Hi</h1></body></html>',
  );

  const child = spawn(process.execPath, [path.join(root, 'service', 'main.js')], {
    env: { ...process.env, DS_KILL_WINDOW_ON_STOP: '1', OPENCHAMBER_SERVICE_PORT: String(port), OPENCHAMBER_SERVICE_TOKEN: TOKEN },
    stdio: 'ignore',
  });

  try {
    await waitForHealth(port, child);

    // Every route, including /state, needs the bearer token.
    const noAuth = await fetch(`http://127.0.0.1:${port}/state`);
    assert.equal(noAuth.status, 401);

    // /state before the first /open: no window, empty page.
    const stateRes = await fetch(`http://127.0.0.1:${port}/state`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    assert.equal(stateRes.status, 200);
    const state = (await stateRes.json()) as {
      url: string;
      title: string;
      lastPick: unknown;
      pickSeq: number;
      windowOpen: boolean;
    };
    assert.deepEqual(state, {
      url: '',
      title: '',
      lastPick: null,
      pickSeq: 0,
      windowOpen: false,
    });

    const stat = await fetch(
      `http://127.0.0.1:${port}/stat?dir=${encodeURIComponent(project)}&path=${encodeURIComponent('design/index.html')}`,
      { headers: { authorization: `Bearer ${TOKEN}` } },
    );
    assert.equal(stat.status, 200);
    assert.equal(typeof ((await stat.json()) as { mtime: number }).mtime, 'number');

    // /close requires the bearer token; with no window open it is a no-op that
    // still answers ok:true (the panel's Design Mode toggle OFF path).
    const closeNoAuth = await fetch(`http://127.0.0.1:${port}/close`, { method: 'POST' });
    assert.equal(closeNoAuth.status, 401, '/close needs the bearer token');
    const closeRes = await fetch(`http://127.0.0.1:${port}/close`, {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    assert.equal(closeRes.status, 200);
    assert.deepEqual(await closeRes.json(), { ok: true });

    // /focus requires the bearer token and answers ok:true with no window open
    // (the service has no browser instance here).
    const focusNoAuth = await fetch(`http://127.0.0.1:${port}/focus`, { method: 'POST' });
    assert.equal(focusNoAuth.status, 401, '/focus needs the bearer token');
    const focusRes = await fetch(`http://127.0.0.1:${port}/focus`, {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    assert.equal(focusRes.status, 200);
    assert.deepEqual(await focusRes.json(), { ok: true });

    // /highlight requires the bearer token. With no window open it answers
    // ok:false with an error (never a crash), for any selector.
    const highlightNoAuth = await fetch(`http://127.0.0.1:${port}/highlight`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ selector: '#x' }),
    });
    assert.equal(highlightNoAuth.status, 401, '/highlight needs the bearer token');
    const highlightRes = await fetch(`http://127.0.0.1:${port}/highlight`, {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ selector: '#x' }),
    });
    assert.equal(highlightRes.status, 200);
    const highlightBody = (await highlightRes.json()) as { ok: boolean; error?: string };
    assert.equal(highlightBody.ok, false, 'no window: highlight answers ok:false');
    assert.equal(typeof highlightBody.error, 'string', 'a failed highlight carries an error message');

    // A missing/empty selector is a validation error.
    const highlightEmpty = await fetch(`http://127.0.0.1:${port}/highlight`, {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ selector: '' }),
    });
    assert.equal(highlightEmpty.status, 400, 'an empty selector is rejected');
  } finally {
    child.kill('SIGKILL');
  }
});

test('/open answers ok:false for an unreachable loopback url without opening a window', async () => {
  const port = 46000 + Math.floor(Math.random() * 1500);
  const child = spawn(process.execPath, [path.join(root, 'service', 'main.js')], {
    env: { ...process.env, DS_KILL_WINDOW_ON_STOP: '1', OPENCHAMBER_SERVICE_PORT: String(port), OPENCHAMBER_SERVICE_TOKEN: TOKEN },
    stdio: 'ignore',
  });

  try {
    await waitForHealth(port, child);

    const deadPort = await freePort();
    const res = await fetch(`http://127.0.0.1:${port}/open`, {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ url: `http://127.0.0.1:${deadPort}/` }),
    });
    assert.equal(res.status, 200, 'a refused open is a 200 with ok:false');
    const body = (await res.json()) as { ok: boolean; error?: string };
    assert.equal(body.ok, false, 'no window opens on a dead page');
    assert.match(body.error ?? '', /not running/);
  } finally {
    child.kill('SIGKILL');
  }
});

// OFF must always end with no lingering window: /close reaps any orphan Chrome
// process carrying a `ds-chrome-` temp profile, even one this service instance
// never tracked (e.g. launched by a previous service that then restarted).
test('/close kills an orphan ds-chrome- process the service does not track', { timeout: 30_000 }, async () => {
  const port = 48000 + Math.floor(Math.random() * 1500);
  const profile = await mkdtemp(path.join(tmpdir(), 'ds-chrome-test-'));
  const child = spawn(process.execPath, [path.join(root, 'service', 'main.js')], {
    env: { ...process.env, DS_KILL_WINDOW_ON_STOP: '1', OPENCHAMBER_SERVICE_PORT: String(port), OPENCHAMBER_SERVICE_TOKEN: TOKEN },
    stdio: 'ignore',
  });
  // A hermetic stand-in for a leftover Chrome: a live process whose command line
  // carries a ds-chrome- temp profile. The service never learned about it.
  const orphan = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)', '--', `--user-data-dir=${profile}`], {
    stdio: 'ignore',
  });

  try {
    await waitForHealth(port, child);
    const alive = (): boolean => orphan.exitCode === null && orphan.signalCode === null;
    assert.equal(alive(), true, 'the orphan is running before /close');

    const close = await fetch(`http://127.0.0.1:${port}/close`, {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    assert.equal(close.status, 200);
    assert.deepEqual(await close.json(), { ok: true });

    const killDeadline = Date.now() + 8_000;
    while (Date.now() < killDeadline && alive()) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    // A SIGKILL leaves exitCode null and sets signalCode; either proves it died.
    assert.equal(alive(), false, 'the orphan ds-chrome- process was killed by /close');

    let gone = false;
    const dirDeadline = Date.now() + 8_000;
    while (Date.now() < dirDeadline) {
      try {
        await stat(profile);
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch {
        gone = true;
        break;
      }
    }
    assert.equal(gone, true, 'the orphan ds-chrome- profile dir is removed');
  } finally {
    child.kill('SIGKILL');
    if (orphan.exitCode === null && orphan.signalCode === null) orphan.kill('SIGKILL');
    await rm(profile, { recursive: true, force: true }).catch(() => undefined);
  }
});

// The scaffold route: bearer-authed, validates the body, and refuses a project
// that already exists. The hermetic cases here never reach npm install or a dev
// server (refusal and validation happen first), so this stays network-free.
test('POST /scaffold requires the bearer token, validates dir/type, and refuses an existing project', async () => {
  const port = 52000 + Math.floor(Math.random() * 1500);
  const existing = await mkdtemp(path.join(tmpdir(), 'ds-scaffold-existing-'));
  await writeFile(
    path.join(existing, '.design-studio.json'),
    JSON.stringify({ version: 1, name: 'taken', type: 'hi-fi' }),
    'utf8',
  );
  const child = spawn(process.execPath, [path.join(root, 'service', 'main.js')], {
    env: { ...process.env, DS_KILL_WINDOW_ON_STOP: '1', OPENCHAMBER_SERVICE_PORT: String(port), OPENCHAMBER_SERVICE_TOKEN: TOKEN },
    stdio: 'ignore',
  });

  try {
    await waitForHealth(port, child);

    const noAuth = await fetch(`http://127.0.0.1:${port}/scaffold`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dir: existing, type: 'hi-fi' }),
    });
    assert.equal(noAuth.status, 401, '/scaffold needs the bearer token');

    const badDir = await fetch(`http://127.0.0.1:${port}/scaffold`, {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ dir: 'relative/path', type: 'hi-fi' }),
    });
    assert.equal(badDir.status, 400, 'dir must be an absolute project path');

    const badType = await fetch(`http://127.0.0.1:${port}/scaffold`, {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ dir: existing, type: '' }),
    });
    assert.equal(badType.status, 400, 'type must be a non-empty string');

    const taken = await fetch(`http://127.0.0.1:${port}/scaffold`, {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ dir: existing, type: 'hi-fi' }),
    });
    assert.equal(taken.status, 200, 'a refused scaffold is a 200 with ok:false');
    const body = (await taken.json()) as { ok: boolean; error?: string };
    assert.equal(body.ok, false);
    assert.match(body.error ?? '', /already exists/);
  } finally {
    child.kill('SIGKILL');
    await rm(existing, { recursive: true, force: true }).catch(() => undefined);
  }
});

// Design Mode turning ON posts to /harness; the service drops the in-session
// OpenCode plugin into the project and answers the write result. Idempotent.
test('POST /harness writes the generated plugin and is idempotent', async () => {
  const port = 50000 + Math.floor(Math.random() * 1500);
  const project = await mkdtemp(path.join(tmpdir(), 'ds-harness-route-'));
  const child = spawn(process.execPath, [path.join(root, 'service', 'main.js')], {
    env: { ...process.env, DS_KILL_WINDOW_ON_STOP: '1', OPENCHAMBER_SERVICE_PORT: String(port), OPENCHAMBER_SERVICE_TOKEN: TOKEN },
    stdio: 'ignore',
  });

  try {
    await waitForHealth(port, child);

    const noAuth = await fetch(`http://127.0.0.1:${port}/harness`, { method: 'POST' });
    assert.equal(noAuth.status, 401, '/harness needs the bearer token');

    const badDir = await fetch(`http://127.0.0.1:${port}/harness`, {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ dir: 'relative/path' }),
    });
    assert.equal(badDir.status, 400, 'dir must be an absolute project path');

    const first = await fetch(`http://127.0.0.1:${port}/harness`, {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ dir: project }),
    });
    assert.equal(first.status, 200);
    const firstBody = (await first.json()) as { path: string; created: boolean; changed: boolean };
    assert.equal(firstBody.path, '.opencode/plugin/design-studio-harness.ts');
    assert.equal(firstBody.created, true);
    assert.equal(firstBody.changed, true);
    assert.match(await readFile(path.join(project, firstBody.path), 'utf8'), /design-studio harness — generated, do not edit/);

    const second = await fetch(`http://127.0.0.1:${port}/harness`, {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ dir: project }),
    });
    assert.equal(second.status, 200);
    assert.deepEqual(await second.json(), {
      path: '.opencode/plugin/design-studio-harness.ts',
      created: false,
      updated: false,
      changed: false,
    });
  } finally {
    child.kill('SIGKILL');
    await rm(project, { recursive: true, force: true }).catch(() => undefined);
  }
});

// The files route: bearer-authed, listing a project's files so the panel can
// attach a FILE reference. Validation of dir/limit is a 400; the listing itself
// is a 200 with the sorted relative paths.
test('POST /files requires the bearer token, validates dir/limit, and lists files', async () => {
  const port = 54000 + Math.floor(Math.random() * 1500);
  const project = await mkdtemp(path.join(tmpdir(), 'ds-files-route-'));
  await mkdir(path.join(project, 'src'), { recursive: true });
  await writeFile(path.join(project, 'src', 'app.ts'), 'export const x = 1;\n');
  await writeFile(path.join(project, 'readme.md'), '# hi\n');
  await mkdir(path.join(project, 'node_modules', 'dep'), { recursive: true });
  await writeFile(path.join(project, 'node_modules', 'dep', 'index.js'), '// dep\n');
  const child = spawn(process.execPath, [path.join(root, 'service', 'main.js')], {
    env: { ...process.env, DS_KILL_WINDOW_ON_STOP: '1', OPENCHAMBER_SERVICE_PORT: String(port), OPENCHAMBER_SERVICE_TOKEN: TOKEN },
    stdio: 'ignore',
  });

  try {
    await waitForHealth(port, child);

    const noAuth = await fetch(`http://127.0.0.1:${port}/files`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dir: project }),
    });
    assert.equal(noAuth.status, 401, '/files needs the bearer token');

    const badDir = await fetch(`http://127.0.0.1:${port}/files`, {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ dir: 'relative/path' }),
    });
    assert.equal(badDir.status, 400, 'dir must be an absolute project path');

    const badLimit = await fetch(`http://127.0.0.1:${port}/files`, {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ dir: project, limit: 0 }),
    });
    assert.equal(badLimit.status, 400, 'limit must be a positive integer');

    const listed = await fetch(`http://127.0.0.1:${port}/files`, {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ dir: project }),
    });
    assert.equal(listed.status, 200);
    const body = (await listed.json()) as { ok: boolean; files: string[] };
    assert.equal(body.ok, true);
    assert.deepEqual(body.files, ['readme.md', 'src/app.ts']);
    assert.equal(body.files.some((file) => file.includes('node_modules')), false, 'node_modules is skipped');
  } finally {
    child.kill('SIGKILL');
    await rm(project, { recursive: true, force: true }).catch(() => undefined);
  }
});

// The server routes: bearer-authed, an absolute dir required. `POST /server/stop`
// for an unknown dir is a safe no-op (`stopped:false`), never a kill of a group
// the service did not record; `GET /server/status` reports a down server.
test('POST /server/stop requires the bearer token, validates dir, and no-ops an unknown dir', async () => {
  const port = 56000 + Math.floor(Math.random() * 1500);
  const unknown = await mkdtemp(path.join(tmpdir(), 'ds-server-stop-'));
  const child = spawn(process.execPath, [path.join(root, 'service', 'main.js')], {
    env: { ...process.env, DS_KILL_WINDOW_ON_STOP: '1', OPENCHAMBER_SERVICE_PORT: String(port), OPENCHAMBER_SERVICE_TOKEN: TOKEN },
    stdio: 'ignore',
  });

  try {
    await waitForHealth(port, child);

    const noAuth = await fetch(`http://127.0.0.1:${port}/server/stop`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dir: unknown }),
    });
    assert.equal(noAuth.status, 401, '/server/stop needs the bearer token');

    const badDir = await fetch(`http://127.0.0.1:${port}/server/stop`, {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ dir: 'relative/path' }),
    });
    assert.equal(badDir.status, 400, 'dir must be an absolute project path');

    const stopped = await fetch(`http://127.0.0.1:${port}/server/stop`, {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ dir: unknown }),
    });
    assert.equal(stopped.status, 200, 'a no-op stop is a 200');
    assert.deepEqual(await stopped.json(), { ok: true, stopped: false }, 'an unknown dir records nothing to stop');

    // /server/status: bearer-authed, absolute dir, down with no record.
    const statusNoAuth = await fetch(`http://127.0.0.1:${port}/server/status?dir=${encodeURIComponent(unknown)}`);
    assert.equal(statusNoAuth.status, 401, '/server/status needs the bearer token');
    const statusBadDir = await fetch(`http://127.0.0.1:${port}/server/status?dir=relative`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    assert.equal(statusBadDir.status, 400, 'dir must be absolute');
    const status = await fetch(`http://127.0.0.1:${port}/server/status?dir=${encodeURIComponent(unknown)}`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    assert.equal(status.status, 200);
    assert.deepEqual(await status.json(), { up: false, port: null }, 'an unknown dir reports down with no port');
  } finally {
    child.kill('SIGKILL');
    await rm(unknown, { recursive: true, force: true }).catch(() => undefined);
  }
});

// POST /server/start must treat the project's configured url as authoritative:
// the probe, the record and the recorded port all come from .design-studio.json,
// while the request url is validation-only. The test drives this with a request
// url whose port is held by a foreign ANSWERING server: if the route ever used
// the request url instead, that foreign answer would be reported as ours
// (ok:true, started:false) and the configured command would never be spawned —
// so started:true plus the config-port record here can only come from the
// config url.
test('POST /server/start uses the configured url, not the request url', { timeout: 60_000 }, async () => {
  const port = 60000 + Math.floor(Math.random() * 1500);
  const devPort = await freePort();
  const decoyPort = await freePort();
  const project = await mkdtemp(path.join(tmpdir(), 'ds-server-start-'));
  await writeFile(
    path.join(project, 'serve.cjs'),
    `require("http").createServer((q,s)=>s.end("ok")).listen(${devPort},"127.0.0.1")`,
    'utf8',
  );
  await writeFile(
    path.join(project, '.design-studio.json'),
    JSON.stringify({ version: 1, name: 'pinned', type: 'hi-fi', url: `http://127.0.0.1:${devPort}/`, command: `node serve.cjs` }),
    'utf8',
  );
  // A foreign process already answers on the request url's port: if the route
  // ever used the request url, this answerer would be reported as ours
  // (ok:true, started:false) instead of the config url's server being spawned.
  const decoyHolder = createServer((_q, res) => res.end('foreign'));
  await new Promise<void>((resolve, reject) => {
    decoyHolder.once('error', reject);
    decoyHolder.listen(decoyPort, '127.0.0.1', () => resolve());
  });
  const child = spawn(process.execPath, [path.join(root, 'service', 'main.js')], {
    env: { ...process.env, DS_KILL_WINDOW_ON_STOP: '1', OPENCHAMBER_SERVICE_PORT: String(port), OPENCHAMBER_SERVICE_TOKEN: TOKEN },
    stdio: 'ignore',
  });

  try {
    await waitForHealth(port, child);

    const noAuth = await fetch(`http://127.0.0.1:${port}/server/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dir: project, url: `http://127.0.0.1:${decoyPort}/` }),
    });
    assert.equal(noAuth.status, 401, '/server/start needs the bearer token');

    const badDir = await fetch(`http://127.0.0.1:${port}/server/start`, {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ dir: 'relative/path', url: `http://127.0.0.1:${decoyPort}/` }),
    });
    assert.equal(badDir.status, 400, 'dir must be an absolute project path');

    const start = await fetch(`http://127.0.0.1:${port}/server/start`, {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ dir: project, url: `http://127.0.0.1:${decoyPort}/` }),
    });
    assert.equal(start.status, 200);
    const body = (await start.json()) as { ok: boolean; started: boolean; up: boolean; error?: string };
    assert.equal(body.ok, true, `the config url is authoritative; the request url (${decoyPort}) is foreign and must not be used: ${body.error ?? ''}`);
    assert.equal(body.started, true, 'the config url (not the request url) decides whether to spawn');
    assert.equal(body.up, true);

    // The record carries the config url's port, not the request url's port.
    const record = JSON.parse(await readFile(path.join(project, '.design-studio', 'server.json'), 'utf8')) as { port: number; pid: number };
    assert.equal(record.port, devPort, 'the recorded port is the config url port');
    assert.equal(record.port === decoyPort, false, 'the recorded port is never the request url port');

    // The pinned server answers on the config port; the request url's port is
    // still served by the foreign holder, never by the spawned server.
    assert.equal(await (await fetch(`http://127.0.0.1:${devPort}/`)).text(), 'ok', 'the pinned dev server is up');
    assert.equal(await (await fetch(`http://127.0.0.1:${decoyPort}/`)).text(), 'foreign', 'the request url port still belongs to the foreign holder');

    // Stopping through the route kills the pinned group and frees the port.
    const stop = await fetch(`http://127.0.0.1:${port}/server/stop`, {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ dir: project }),
    });
    assert.equal(stop.status, 200);
    assert.deepEqual(await stop.json(), { ok: true, stopped: true }, 'the pinned server is stopped');
    await new Promise((resolve) => setTimeout(resolve, 300));
    const rebound = await new Promise<boolean>((resolve, reject) => {
      const probe = createServer();
      probe.once('error', () => resolve(false));
      probe.listen(devPort, '127.0.0.1', () => probe.close(() => resolve(true)));
    });
    assert.equal(rebound, true, 'the config port was freed by the stop');
  } finally {
    child.kill('SIGKILL');
    await new Promise<void>((resolve) => decoyHolder.close(() => resolve()));
    await rm(project, { recursive: true, force: true }).catch(() => undefined);
  }
});

// POST /server/start is the manual start path: when the configured port is
// answered by a process the service never started (and no verified record
// exists), the route must refuse with the port-in-use error instead of
// reporting ok:true/up:true for someone else's server.
test('POST /server/start refuses a foreign holder on the configured port', { timeout: 60_000 }, async () => {
  const port = 62000 + Math.floor(Math.random() * 1500);
  const devPort = await freePort();
  const project = await mkdtemp(path.join(tmpdir(), 'ds-server-foreign-'));
  await writeFile(
    path.join(project, 'serve.cjs'),
    `require("http").createServer((q,s)=>s.end("ok")).listen(${devPort},"127.0.0.1")`,
    'utf8',
  );
  await writeFile(
    path.join(project, '.design-studio.json'),
    JSON.stringify({ version: 1, name: 'pinned', type: 'hi-fi', url: `http://127.0.0.1:${devPort}/`, command: 'node serve.cjs' }),
    'utf8',
  );
  // A foreign process already ANSWERS on the configured port.
  const holder = createServer((_q, res) => res.end('foreign'));
  await new Promise<void>((resolve, reject) => {
    holder.once('error', reject);
    holder.listen(devPort, '127.0.0.1', () => resolve());
  });
  const child = spawn(process.execPath, [path.join(root, 'service', 'main.js')], {
    env: { ...process.env, DS_KILL_WINDOW_ON_STOP: '1', OPENCHAMBER_SERVICE_PORT: String(port), OPENCHAMBER_SERVICE_TOKEN: TOKEN },
    stdio: 'ignore',
  });

  try {
    await waitForHealth(port, child);

    const start = await fetch(`http://127.0.0.1:${port}/server/start`, {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ dir: project, url: `http://127.0.0.1:${devPort}/` }),
    });
    assert.equal(start.status, 200);
    const body = (await start.json()) as { ok: boolean; started: boolean; up: boolean; error?: string };
    assert.equal(body.ok, false, 'a foreign answer on the configured port is not our running server');
    assert.equal(body.up, false);
    assert.equal(body.started, false);
    assert.match(body.error ?? '', /already in use/);
    assert.equal(await readFile(path.join(project, '.design-studio', 'server.json'), 'utf8').then(() => true, (e: NodeJS.ErrnoException) => e.code === 'ENOENT' ? false : Promise.reject(e)), false, 'no server record was written');
  } finally {
    child.kill('SIGKILL');
    await new Promise<void>((resolve) => holder.close(() => resolve()));
    await rm(project, { recursive: true, force: true }).catch(() => undefined);
  }
});
