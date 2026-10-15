// The on-demand dev-server starter. No Chrome: every case drives the real
// spawn/probe path against tiny node HTTP servers (or commands that never
// serve), using temp dirs and ephemeral ports. Spawned servers are detached, so
// each test tears its own down through a pid file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { ensureDevServer, getDevServerStatus, isLoopbackUrl, canBindPort, readServerRecord, stopDevServer } from '../service/project-server.ts';

/** Reserve then release an ephemeral port (a small reuse race is acceptable). */
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

async function tempDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'ds-project-server-'));
}

async function writeConfig(dir: string, config: Record<string, unknown>): Promise<void> {
  await writeFile(path.join(dir, '.design-studio.json'), JSON.stringify(config), 'utf8');
}

async function killPidFile(file: string): Promise<void> {
  try {
    const pid = Number((await readFile(file, 'utf8')).trim());
    if (Number.isFinite(pid) && pid > 0) process.kill(pid, 'SIGKILL');
  } catch {
    /* already gone */
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The `ps -o lstart=` fingerprint of a live pid, or null when it is gone. */
async function processLstart(pid: number): Promise<string | null> {
  try {
    const { stdout } = await promisify(execFile)('ps', ['-p', String(pid), '-o', 'lstart=']);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/** A detached, long-lived process whose pid is a live process-group id. */
async function liveGroupLeader(): Promise<number> {
  const child = spawn('node', ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' });
  child.unref();
  const pid = child.pid!;
  await delay(100);
  assert.equal(groupGone(pid), false, 'the detached process is alive and is its own group leader');
  return pid;
}

/** True once the whole process group has no live member. */
function groupGone(pgid: number): boolean {
  try {
    process.kill(-pgid, 0);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH';
  }
}

function listening(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve(typeof address === 'object' && address ? address.port : 0);
    });
  });
}

test('isLoopbackUrl accepts loopback literals and rejects remote hosts', () => {
  assert.equal(isLoopbackUrl('http://127.0.0.1:5173/'), true);
  assert.equal(isLoopbackUrl('http://localhost:5173/'), true);
  assert.equal(isLoopbackUrl('http://[::1]:5173/'), true);
  assert.equal(isLoopbackUrl('https://example.com/'), false);
  assert.equal(isLoopbackUrl('not a url'), false);
});

test('an unreachable URL with no config reports the missing command', async () => {
  const dir = await tempDir();
  const port = await freePort();

  const result = await ensureDevServer(`http://127.0.0.1:${port}/`, { dir, timeoutMs: 3000 });

  assert.equal(result.up, false);
  assert.equal(result.started, false);
  assert.match(result.error ?? '', /command/);
});

test('an unreachable URL with no dir reports there is nothing to start', async () => {
  const port = await freePort();
  const result = await ensureDevServer(`http://127.0.0.1:${port}/`);
  assert.equal(result.up, false);
  assert.equal(result.started, false);
  assert.match(result.error ?? '', /not running/);
});

test('a non-loopback host is refused', async () => {
  const dir = await tempDir();
  const result = await ensureDevServer('https://example.com/', { dir });
  assert.equal(result.up, false);
  assert.equal(result.started, false);
  assert.match(result.error ?? '', /non-loopback/);
});

test('a reachable URL is reported up without spawning', async () => {
  const server = createServer((_req, res) => res.end('ok'));
  const port = await listening(server);
  const dir = await tempDir();
  try {
    const result = await ensureDevServer(`http://127.0.0.1:${port}/`, { dir });
    assert.deepEqual(result, { started: false, up: true });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('starts the configured command, reports it up, and does not restart on a second call', async () => {
  const dir = await tempDir();
  const pidFile = path.join(dir, 'server.pid');
  const port = await freePort();
  const url = `http://127.0.0.1:${port}/`;
  const command = `node -e 'require("fs").writeFileSync("${pidFile}",""+process.pid);require("http").createServer(function(q,s){s.end("ok")}).listen(${port},"127.0.0.1")'`;
  await writeConfig(dir, { version: 1, url, command });

  try {
    const first = await ensureDevServer(url, { dir, timeoutMs: 15_000 });
    assert.equal(first.up, true, 'the dev server came up');
    assert.equal(first.started, true, 'this call started it');

    const second = await ensureDevServer(url, { dir, timeoutMs: 15_000 });
    assert.equal(second.up, true, 'still up');
    assert.equal(second.started, false, 'the second call did not restart it');
    console.log(
      `[project-server] ${url} first={started:${first.started},up:${first.up}} second={started:${second.started},up:${second.up}}`,
    );
  } finally {
    await killPidFile(pidFile);
  }
});

test('a command that exits immediately reports the URL never came up', async () => {
  const dir = await tempDir();
  const port = await freePort();
  const url = `http://127.0.0.1:${port}/`;
  await writeConfig(dir, { version: 1, url, command: 'node -e "process.exit(3)"' });

  const began = Date.now();
  const result = await ensureDevServer(url, { dir, timeoutMs: 15_000 });
  const elapsed = Date.now() - began;

  assert.equal(result.up, false);
  assert.equal(result.started, true);
  assert.match(result.error ?? '', /exited/);
  assert.ok(elapsed < 10_000, `returned before the timeout (took ${elapsed}ms)`);
});

test('a command that starts but never serves times out with an actionable error', async () => {
  const dir = await tempDir();
  const pidFile = path.join(dir, 'sleeper.pid');
  const port = await freePort();
  const url = `http://127.0.0.1:${port}/`;
  const command = `node -e 'require("fs").writeFileSync("${pidFile}",""+process.pid);setTimeout(function(){},60000)'`;
  await writeConfig(dir, { version: 1, url, command });

  try {
    const result = await ensureDevServer(url, { dir, timeoutMs: 700 });
    assert.equal(result.up, false);
    assert.equal(result.started, true);
    assert.match(result.error ?? '', /never came up/);
  } finally {
    await killPidFile(pidFile);
  }
});

// ---- process-group recording and stop (no Chrome) ----

/** A detached server command that serves `port` and records its own pid. */
function serveCommand(pidFile: string, port: number): string {
  return `node -e 'require("fs").writeFileSync("${pidFile}",""+process.pid);require("http").createServer(function(q,s){s.end("ok")}).listen(${port},"127.0.0.1")'`;
}

test('records the process group and stopDevServer kills the group and frees the port', async () => {
  const dir = await tempDir();
  const pidFile = path.join(dir, 'server.pid');
  const port = await freePort();
  const url = `http://127.0.0.1:${port}/`;
  await writeConfig(dir, { version: 1, url, command: serveCommand(pidFile, port) });

  let pgid = 0;
  try {
    const started = await ensureDevServer(url, { dir, timeoutMs: 15_000 });
    assert.equal(started.up, true, 'the dev server came up');

    const record = await readServerRecord(dir);
    assert.ok(record, 'a server record is persisted under <dir>/.design-studio/server.json');
    pgid = record!.pgid;
    assert.ok(Number.isInteger(pgid) && pgid > 0, `the pgid is a positive integer (got ${pgid})`);
    assert.equal(record!.pid, pgid, 'the detached child is the group leader (pgid === pid)');
    assert.equal(record!.port, port, 'the URL port is recorded');
    assert.equal(groupGone(pgid), false, 'the group is alive before the stop');
    assert.equal(await canBindPort(port), false, 'the port is busy before the stop');

    const stop = await stopDevServer(dir);
    assert.equal(stop.stopped, true, 'a recorded server reports stopped:true');

    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline && !groupGone(pgid)) await delay(50);
    assert.equal(groupGone(pgid), true, 'the whole process group is gone');
    assert.equal(await canBindPort(port), true, 'the port is free after the stop');
    assert.equal(await readServerRecord(dir), null, 'the record is removed');
  } finally {
    await killPidFile(pidFile);
    if (pgid > 0) {
      try {
        process.kill(-pgid, 'SIGKILL');
      } catch {
        /* already gone */
      }
    }
  }
});

test('stopDevServer is a no-op for a dir it did not start', async () => {
  const dir = await tempDir();
  assert.deepEqual(await stopDevServer(dir), { stopped: false });
});

// ---- stale records and port conflicts (no Chrome) ----

/** A detached process that exits at once; its pid is then a DEAD process-group id. */
async function deadGroupLeader(): Promise<number> {
  // The child is unref'd, so it does not keep this process's event loop alive.
  // Waiting for its `exit` therefore races the loop: when nothing else holds a
  // handle (the common case here), the runner drains the loop before the child
  // reports exit and cancels every remaining test in the file. Hold the loop
  // until the exit has actually been observed.
  const keepAlive = setInterval(() => {}, 50);
  const pgid = await new Promise<number>((resolve) => {
    const child = spawn('node', ['-e', 'process.exit(0)'], { detached: true, stdio: 'ignore' });
    child.unref();
    child.on('exit', () => resolve(child.pid!));
  });
  clearInterval(keepAlive);
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline && !groupGone(pgid)) await delay(20);
  assert.equal(groupGone(pgid), true, 'the detached leader is gone, so the recorded group is dead');
  return pgid;
}

/** Write a `<dir>/.design-studio/server.json` record by hand (stopDevServer would clear it). */
async function writeServerRecordFile(
  dir: string,
  pgid: number,
  port: number | null,
  identity?: string,
): Promise<void> {
  await mkdir(path.join(dir, '.design-studio'), { recursive: true });
  await writeFile(
    path.join(dir, '.design-studio', 'server.json'),
    JSON.stringify({ pgid, pid: pgid, port, startedAt: Date.now(), ...(identity ? { identity } : {}) }),
    'utf8',
  );
}

test('a URL whose port is occupied but which does not answer reports the port conflict instead of spawning', async () => {
  const dir = await tempDir();
  const pidFile = path.join(dir, 'occupier.pid');
  // Bound but never answering: every connection is destroyed at once, so the
  // reachability probe counts the URL as down while canBindPort sees the port
  // occupied — exactly the crashed/leftover-server situation.
  const occupier = createServer((socket) => socket.destroy());
  const port = await listening(occupier);
  const url = `http://127.0.0.1:${port}/`;
  await writeConfig(dir, { version: 1, url, command: serveCommand(pidFile, port) });

  try {
    assert.equal(await canBindPort(port), false, 'the port is genuinely occupied');
    assert.equal(await isLoopbackUrl(url), true, 'sanity: the url itself is fine');

    const result = await ensureDevServer(url, { dir, timeoutMs: 3_000 });

    assert.equal(result.started, false, 'nothing was spawned');
    assert.equal(result.up, false);
    assert.match(result.error ?? '', /port \d+ is already in use by another process/);
    assert.match(result.error ?? '', /change the port in \.design-studio\.json/);
    assert.equal(await readServerRecord(dir), null, 'no server record was written');
    await assert.rejects(() => readFile(pidFile), { code: 'ENOENT' }, 'the configured command never ran');
  } finally {
    await new Promise<void>((resolve) => occupier.close(() => resolve()));
    await killPidFile(pidFile);
  }
});

test('a dead recorded group whose port is still bound clears the record and reports the port as not ours', async () => {
  const dir = await tempDir();
  const holder = createServer((_req, res) => res.end('busy'));
  const port = await listening(holder);
  const pgid = await deadGroupLeader();
  await writeServerRecordFile(dir, pgid, port);

  try {
    assert.equal(await canBindPort(port), false, 'the port is held by another process');

    const status = await getDevServerStatus(dir);

    assert.equal(status.up, false);
    assert.equal(status.port, port, 'the occupied port is named');
    assert.match(status.error ?? '', /answered by a process this service did not start/);
    assert.equal(status.pid, undefined, 'the stale record is gone: no pid is reported');
    assert.equal(await readServerRecord(dir), null, 'the stale record was cleared');
  } finally {
    await new Promise<void>((resolve) => holder.close(() => resolve()));
  }
});

test('a dead recorded group with a free port is cleared and reports nothing at all', async () => {
  const dir = await tempDir();
  const port = await freePort();
  const pgid = await deadGroupLeader();
  await writeServerRecordFile(dir, pgid, port);

  const status = await getDevServerStatus(dir);

  assert.deepEqual(status, { up: false, port: null }, 'no pid, no port, no error: nothing is recorded');
  assert.equal(await readServerRecord(dir), null, 'the stale record was cleared');
});

test('stopping twice is safe: the second call is a no-op', async () => {
  const dir = await tempDir();
  const pidFile = path.join(dir, 'server.pid');
  const port = await freePort();
  const url = `http://127.0.0.1:${port}/`;
  await writeConfig(dir, { version: 1, url, command: serveCommand(pidFile, port) });

  let pgid = 0;
  try {
    const started = await ensureDevServer(url, { dir, timeoutMs: 15_000 });
    assert.equal(started.up, true);
    pgid = (await readServerRecord(dir))!.pgid;

    assert.deepEqual(await stopDevServer(dir), { stopped: true });
    assert.deepEqual(await stopDevServer(dir), { stopped: false }, 'a second stop finds no record');
  } finally {
    await killPidFile(pidFile);
    if (pgid > 0) {
      try {
        process.kill(-pgid, 'SIGKILL');
      } catch {
        /* already gone */
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Concurrency: one spawn per dir, honest joiners, stop-vs-start races.
// ---------------------------------------------------------------------------

test('concurrent ensureDevServer calls for one dir spawn exactly one server; joiners report started:false', { timeout: 30_000 }, async () => {
  const dir = await tempDir();
  const pidFile = path.join(dir, 'spawn.pids');
  const port = await freePort();
  const url = `http://127.0.0.1:${port}/`;
  const command = `node -e 'require("fs").appendFileSync("${pidFile}",process.pid+"\\n");require("http").createServer(function(q,s){s.end("ok")}).listen(${port},"127.0.0.1")'`;
  await writeConfig(dir, { version: 1, url, command });

  // Several spellings of the SAME directory: all must resolve to one claim.
  const spellings = [dir, `${dir}/.`, `${dir}/`, path.resolve(dir, 'sub', '..')];
  let pids: string[] = [];
  try {
    const results = await Promise.all(spellings.map((spelling) => ensureDevServer(url, { dir: spelling, timeoutMs: 15_000 })));

    // The spawn count FIRST: it is the direct observable for the atomic claim,
    // and a double spawn also breaks the per-call results below.
    pids = (await readFile(pidFile, 'utf8')).trim().split('\n').filter(Boolean);
    assert.equal(pids.length, 1, `exactly one dev-server process was spawned (got ${pids.length}: ${pids.join(',')})`);

    for (const result of results) assert.equal(result.up, true, 'every call reports the server up');
    assert.equal(results.filter((r) => r.started).length, 1, 'exactly one call claims the spawn');
    for (const result of results.filter((r) => !r.started)) {
      assert.equal(result.started, false, 'a joiner did not spawn, so it must not report started:true');
    }

    const record = await readServerRecord(dir);
    assert.ok(record, 'the winner left a server record for the dir');
    assert.equal(typeof record!.identity, 'string', 'the record carries the leader identity fingerprint');
    assert.ok(record!.identity!.length > 0);
  } finally {
    for (const line of pids) await killPidFile(line);
  }
});

test('a newer record written by a concurrent start survives a stop that is already running', { timeout: 30_000 }, async () => {
  const dir = await tempDir();
  const oldPidFile = path.join(dir, 'old.pid');
  const newPidFile = path.join(dir, 'new.pid');
  const port = await freePort();
  const url = `http://127.0.0.1:${port}/`;
  // The old server DROPS its listener at once on SIGTERM (the URL goes down and
  // the port frees) but lingers alive — the shutdown window in which the
  // concurrent restart on the SAME port runs (a different-port start is refused
  // by the port-change guard while a live record exists).
  const commandA = `node -e '
    const server = require("http").createServer(function(q,s){s.end("old")}).listen(${port},"127.0.0.1");
    require("fs").writeFileSync("${oldPidFile}", process.pid + "");
    process.on("SIGTERM", function(){ server.close(); server.closeAllConnections(); server.closeIdleConnections(); setTimeout(function(){process.exit(0)}, 800); });
  '`;
  // B writes its pid/record at once but binds the port only ~1.5s later — the
  // stop's port-free check completes before B binds (a bind racing the stop's
  // check is the known CAND-2 masked-success shape, out of scope here).
  const commandB = `node -e 'require("fs").writeFileSync("${newPidFile}",""+process.pid);setTimeout(function(){require("http").createServer(function(q,s){s.end("new")}).listen(${port},"127.0.0.1")},1500)'`;

  let oldPgid = 0;
  let newPgid = 0;
  try {
    await writeConfig(dir, { version: 1, url, command: commandA });
    const first = await ensureDevServer(url, { dir, timeoutMs: 15_000 });
    assert.equal(first.up, true);
    oldPgid = (await readServerRecord(dir))!.pgid;
    assert.equal(groupGone(oldPgid), false, 'the old server is alive before the stop');

    // Swap the config so the concurrent restart spawns a DIFFERENT server on
    // the SAME port (the old one drops its listener but lingers).
    await writeConfig(dir, { version: 1, url, command: commandB });

    const stopping = stopDevServer(dir);
    await delay(100); // let the stop capture the old record and begin signalling
    const starting = ensureDevServer(url, { dir, timeoutMs: 15_000 });
    const [stop, start] = await Promise.all([stopping, starting]);

    assert.equal(stop.stopped, true, 'the stop still reports the old server stopped');
    assert.equal(start.up, true, 'the concurrent start came up');
    assert.equal(start.started, true, 'the concurrent start spawned the new server');

    const record = await readServerRecord(dir);
    assert.ok(record, 'the new record survived the stop cleanup');
    newPgid = record!.pgid;
    assert.notEqual(newPgid, oldPgid, 'the record names the NEW group, not the stopped one');
    assert.equal(groupGone(newPgid), false, 'the new server is still alive');

    // The new server remains stoppable.
    const secondStop = await stopDevServer(dir);
    assert.equal(secondStop.stopped, true, 'the surviving new server can be stopped');
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline && !groupGone(newPgid)) await delay(50);
    assert.equal(groupGone(newPgid), true, 'the new server group is gone after its own stop');
  } finally {
    await killPidFile(oldPidFile);
    await killPidFile(newPidFile);
    for (const pgid of [oldPgid, newPgid]) {
      if (pgid > 0) {
        try {
          process.kill(-pgid, 'SIGKILL');
        } catch {
          /* already gone */
        }
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Identity guard: a record that does not verify is refused, not killed.
// ---------------------------------------------------------------------------

test('a record naming a live unrelated group is refused: status is not up and the stop spares the group', { timeout: 30_000 }, async () => {
  for (const identity of [undefined, 'bogus-not-a-real-lstart']) {
    const dir = await tempDir();
    const unrelated = await liveGroupLeader();
    const holder = createServer((_q, res) => res.end('busy'));
    const port = await listening(holder);
    await writeServerRecordFile(dir, unrelated, port, identity);

    try {
      assert.equal(groupGone(unrelated), false, 'the unrelated group is alive');

      const status = await getDevServerStatus(dir);
      assert.equal(status.up, false, `[${identity ?? 'no identity'}] a live group that does not verify is not reported up`);
      assert.equal(status.port, port);
      assert.match(status.error ?? '', /cannot be verified/);
      assert.equal(status.pid, undefined, 'no pid is reported for an unverified group');
      assert.ok(await readServerRecord(dir), 'the record is kept, not silently cleared');

      const stop = await stopDevServer(dir);
      assert.equal(groupGone(unrelated), false, 'the innocent group survived the stop call');
      assert.equal(stop.stopped, false, `[${identity ?? 'no identity'}] the stop refuses`);
      assert.match(stop.error ?? '', /cannot be verified/);
      assert.ok(await readServerRecord(dir), 'the record survives the refused stop');
    } finally {
      try {
        process.kill(-unrelated, 'SIGKILL');
      } catch {
        /* already gone */
      }
      await new Promise<void>((resolve) => holder.close(() => resolve()));
    }
  }
});

test('a record with a verified identity is stopped as today (the fingerprint authorizes the kill)', { timeout: 30_000 }, async () => {
  const dir = await tempDir();
  const port = await freePort();
  const child = spawn(
    'node',
    ['-e', `require("http").createServer((q,s)=>s.end("ok")).listen(${port},"127.0.0.1");setTimeout(()=>{},60000)`],
    { detached: true, stdio: 'ignore' },
  );
  child.unref();
  const pgid = child.pid!;
  try {
    // Wait until the port is actually bound, so "port freed" means something.
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline && (await canBindPort(port))) await delay(50);
    assert.equal(await canBindPort(port), false, 'our recorded group holds the port');

    const identity = await processLstart(pgid);
    assert.ok(identity, 'ps reports a start time for the live leader');
    await writeServerRecordFile(dir, pgid, port, identity);

    const stop = await stopDevServer(dir);
    assert.deepEqual(stop, { stopped: true });
    const goneBy = Date.now() + 5_000;
    while (Date.now() < goneBy && !groupGone(pgid)) await delay(50);
    assert.equal(groupGone(pgid), true, 'the recorded group was killed');
    assert.ok(await canBindPort(port), 'the port was freed');
    assert.equal(await readServerRecord(dir), null, 'the record was cleared');
  } finally {
    try {
      process.kill(-pgid, 'SIGKILL');
    } catch {
      /* already gone */
    }
  }
});

// ---------------------------------------------------------------------------
// Honest stop result: a held port after the kill is a failed stop.
// ---------------------------------------------------------------------------

test('a stop whose port is still held afterwards reports stopped:false and keeps the record', { timeout: 30_000 }, async () => {
  const dir = await tempDir();
  const pidFile = path.join(dir, 'server.pid');
  const port = await freePort();
  const url = `http://127.0.0.1:${port}/`;
  await writeConfig(dir, { version: 1, url, command: serveCommand(pidFile, port) });

  let pgid = 0;
  let holder: Server | null = null;
  try {
    const started = await ensureDevServer(url, { dir, timeoutMs: 15_000 });
    assert.equal(started.up, true);
    pgid = (await readServerRecord(dir))!.pgid;

    // Kill the group out-of-band, then let a foreign process grab the port.
    process.kill(-pgid, 'SIGKILL');
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline && !(await canBindPort(port))) await delay(50);
    holder = createServer((_q, res) => res.end('foreign'));
    const holderRef: Server = holder;
    await new Promise<void>((resolve, reject) => {
      holderRef.once('error', reject);
      holderRef.listen(port, '127.0.0.1', () => resolve());
    });

    const stop = await stopDevServer(dir);
    assert.equal(stop.stopped, false, 'the stop does not claim success while the port is held');
    assert.match(stop.error ?? '', /port \d+ remains in use/);
    const record = await readServerRecord(dir);
    assert.ok(record, 'the record is retained');
    assert.equal(record!.pgid, pgid);
    assert.equal(groupGone(pgid), true, 'the group itself is gone');
  } finally {
    const holderToClose: Server | null = holder;
    if (holderToClose) await new Promise<void>((resolve) => holderToClose.close(() => resolve()));
    await killPidFile(pidFile);
    if (pgid > 0) {
      try {
        process.kill(-pgid, 'SIGKILL');
      } catch {
        /* already gone */
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Foreign port holder vs our own recorded server.
// ---------------------------------------------------------------------------

test('an unreachable URL whose port is held by our own verified server reports up instead of a port error', { timeout: 30_000 }, async () => {
  const dir = await tempDir();
  const port = await freePort();
  const url = `http://127.0.0.1:${port}/`;
  await writeConfig(dir, { version: 1, url, command: 'node -e "setTimeout(()=>{},60000)"' });

  // Our own (recorded, identity-verified) group holds the port but never
  // answers: the reachability probe counts the URL as down.
  const child = spawn(
    'node',
    ['-e', `require("http").createServer(function(q){q.destroy()}).listen(${port},"127.0.0.1");setTimeout(()=>{},60000)`],
    { detached: true, stdio: 'ignore' },
  );
  child.unref();
  const pgid = child.pid!;
  try {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline && (await canBindPort(port))) await delay(50);
    assert.equal(await canBindPort(port), false, 'our group holds the port');
    const identity = await processLstart(pgid);
    assert.ok(identity);
    await writeServerRecordFile(dir, pgid, port, identity);

    const result = await ensureDevServer(url, { dir, timeoutMs: 3_000 });
    assert.deepEqual(result, { started: false, up: true });
  } finally {
    try {
      process.kill(-pgid, 'SIGKILL');
    } catch {
      /* already gone */
    }
  }
});

// ---------------------------------------------------------------------------
// Manual-start strictness (ownedOnly): a foreign answer is never "running".
// ---------------------------------------------------------------------------

/** Bind a test HTTP server to a SPECIFIC already-chosen loopback port. */
function listenOn(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve());
  });
}

test('a manual start does not claim a foreign answering server as ours (ownedOnly)', { timeout: 30_000 }, async () => {
  const dir = await tempDir();
  const pidFile = path.join(dir, 'never.pid');
  const port = await freePort();
  const url = `http://127.0.0.1:${port}/`;
  await writeConfig(dir, { version: 1, url, command: serveCommand(pidFile, port) });

  // A foreign process ANSWERS on the configured port (any-response semantics
  // would read it as "running"); no record exists for this dir.
  const holder = createServer((_q, res) => res.end('foreign'));
  await listenOn(holder, port);

  try {
    const result = await ensureDevServer(url, { dir, timeoutMs: 3_000, ownedOnly: true });

    assert.equal(result.started, false);
    assert.equal(result.up, false, 'a foreign answer must not be claimed as our running server');
    assert.match(result.error ?? '', /port \d+ is already in use by another process/);
    assert.equal(await readServerRecord(dir), null, 'no server record was written');
    await assert.rejects(() => readFile(pidFile), { code: 'ENOENT' }, 'the configured command never ran');
  } finally {
    await new Promise<void>((resolve) => holder.close(() => resolve()));
  }
});

test('a manual start trusts a live verified record that names the same port', { timeout: 30_000 }, async () => {
  const dir = await tempDir();
  const port = await freePort();
  const url = `http://127.0.0.1:${port}/`;
  await writeConfig(dir, { version: 1, url, command: 'node -e "setTimeout(()=>{},60000)"' });

  // Our own detached server answers on the port; a verified record covers it.
  const child = spawn(
    'node',
    ['-e', `require("http").createServer((q,s)=>s.end("ok")).listen(${port},"127.0.0.1");setTimeout(()=>{},60000)`],
    { detached: true, stdio: 'ignore' },
  );
  child.unref();
  const pgid = child.pid!;
  try {
    // Wait until the port is actually bound and answering, so the probe sees
    // the server rather than racing its startup.
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline && (await canBindPort(port))) await delay(50);
    assert.equal(await canBindPort(port), false, 'our recorded group holds the port');
    assert.equal((await fetch(url)).status, 200, 'our recorded server answers the URL');

    const identity = await processLstart(pgid);
    assert.ok(identity, 'ps reports a start time for the live leader');
    await writeServerRecordFile(dir, pgid, port, identity);

    const result = await ensureDevServer(url, { dir, timeoutMs: 3_000, ownedOnly: true });
    assert.deepEqual(result, { started: false, up: true });
  } finally {
    try {
      process.kill(-pgid, 'SIGKILL');
    } catch {
      /* already gone */
    }
  }
});

test('a manual start refuses a verified record that names a DIFFERENT port', { timeout: 30_000 }, async () => {
  const dir = await tempDir();
  const port = await freePort();
  const otherPort = await freePort();
  const url = `http://127.0.0.1:${port}/`;
  await writeConfig(dir, { version: 1, url, command: 'node -e "setTimeout(()=>{},60000)"' });

  // A live verified group exists, but its record names another port; the URL's
  // port is answered by a foreign process.
  const unrelated = await liveGroupLeader();
  const holder = createServer((_q, res) => res.end('foreign'));
  await listenOn(holder, port);

  try {
    const identity = await processLstart(unrelated);
    assert.ok(identity);
    await writeServerRecordFile(dir, unrelated, otherPort, identity);

    const result = await ensureDevServer(url, { dir, timeoutMs: 3_000, ownedOnly: true });

    assert.equal(result.up, false, 'a record for another port must not vouch for this URL');
    assert.match(result.error ?? '', /port \d+ is already in use by another process/);
  } finally {
    try {
      process.kill(-unrelated, 'SIGKILL');
    } catch {
      /* already gone */
    }
    await new Promise<void>((resolve) => holder.close(() => resolve()));
  }
});

// ---------------------------------------------------------------------------
// Status without a record: an occupied configured port is reported, not silent.
// ---------------------------------------------------------------------------

test('status names an unowned holder on the configured port when no record exists', { timeout: 30_000 }, async () => {
  const dir = await tempDir();
  const port = await freePort();
  await writeConfig(dir, { version: 1, url: `http://127.0.0.1:${port}/` });

  const holder = createServer((_q, res) => res.end('foreign'));
  await listenOn(holder, port);

  try {
    const status = await getDevServerStatus(dir);

    assert.equal(status.up, false);
    assert.equal(status.port, port, 'the occupied configured port is named');
    assert.match(status.error ?? '', /answered by a process this service did not start/);
    assert.equal(await readServerRecord(dir), null, 'still no record: status must not fabricate one');
  } finally {
    await new Promise<void>((resolve) => holder.close(() => resolve()));
  }
});

test('status with no record and a free configured port stays silent', async () => {
  const dir = await tempDir();
  const port = await freePort();
  await writeConfig(dir, { version: 1, url: `http://127.0.0.1:${port}/` });

  assert.deepEqual(await getDevServerStatus(dir), { up: false, port: null });
});

// ---------------------------------------------------------------------------
// CAND-1: a start for a DIFFERENT port must not overwrite a live record.
// ---------------------------------------------------------------------------

test('a start for a different port is refused while the recorded server is live; the original stays stoppable', { timeout: 60_000 }, async () => {
  const dir = await tempDir();
  const xPidFile = path.join(dir, 'x.pid');
  const yPidFile = path.join(dir, 'y.pid');
  const portX = await freePort();
  const portY = await freePort();
  const urlX = `http://127.0.0.1:${portX}/`;
  const urlY = `http://127.0.0.1:${portY}/`;
  // X ignores SIGTERM so its stop exercises the full SIGTERM->SIGKILL path,
  // proving the ORIGINAL group is still reachable through its record.
  const commandX = `node -e 'require("fs").writeFileSync("${xPidFile}",""+process.pid);process.on("SIGTERM",function(){});require("http").createServer(function(q,s){s.end("X")}).listen(${portX},"127.0.0.1");setTimeout(function(){},60000)'`;
  const commandY = `node -e 'require("fs").writeFileSync("${yPidFile}",""+process.pid);require("http").createServer(function(q,s){s.end("Y")}).listen(${portY},"127.0.0.1")'`;

  let pgidX = 0;
  let pgidY = 0;
  try {
    await writeConfig(dir, { version: 1, url: urlX, command: commandX });
    const first = await ensureDevServer(urlX, { dir, timeoutMs: 15_000 });
    assert.equal(first.up, true, 'precondition: the X server is up');
    pgidX = (await readServerRecord(dir))!.pgid;

    // The config repoints the project from port X to port Y (the p6 shape)
    // while X is still live and recorded.
    await writeConfig(dir, { version: 1, url: urlY, command: commandY });
    const second = await ensureDevServer(urlY, { dir, timeoutMs: 8_000 });

    assert.equal(second.started, false, 'the second start refused: no new child was spawned');
    assert.equal(second.up, false);
    assert.match(
      second.error ?? '',
      new RegExp(`port ${portX} .* before starting port ${portY}`),
      `the refusal names both ports (got: ${second.error ?? ''})`,
    );

    // No new child: the Y command never ran.
    await assert.rejects(() => readFile(yPidFile), { code: 'ENOENT' }, 'the Y command never ran');

    // The record still names X's group — nothing was overwritten.
    const record = await readServerRecord(dir);
    assert.ok(record, 'the record survives the refused start');
    assert.equal(record!.pgid, pgidX, 'the original record is preserved');
    assert.equal(record!.port, portX, 'the record still names the old port');
    assert.equal(groupGone(pgidX), false, 'the original server is untouched');

    // The original is still stoppable through its record.
    const stop = await stopDevServer(dir);
    assert.equal(stop.stopped, true, 'the original server is still stoppable');
    const goneBy = Date.now() + 5_000;
    while (Date.now() < goneBy && !groupGone(pgidX)) await delay(50);
    assert.equal(groupGone(pgidX), true, 'the original group is gone after its stop');

    // After the explicit stop, starting the new port works.
    const third = await ensureDevServer(urlY, { dir, timeoutMs: 15_000 });
    assert.equal(third.started, true, 'after the explicit stop, the new port starts');
    assert.equal(third.up, true);
    pgidY = (await readServerRecord(dir))!.pgid;
    assert.equal(groupGone(pgidY), false, 'the new server is alive and recorded');
  } finally {
    await killPidFile(xPidFile);
    await killPidFile(yPidFile);
    for (const pgid of [pgidX, pgidY]) {
      if (pgid > 0) {
        try {
          process.kill(-pgid, 'SIGKILL');
        } catch {
          /* already gone */
        }
      }
    }
  }
});

test('a start for a different port refuses to overwrite an UNVERIFIABLE live record', { timeout: 30_000 }, async () => {
  const dir = await tempDir();
  const portTarget = await freePort();
  const portRecorded = await freePort();
  const urlTarget = `http://127.0.0.1:${portTarget}/`;
  await writeConfig(dir, { version: 1, url: urlTarget, command: 'node -e "setTimeout(()=>{},60000)"' });

  // A live group this service cannot verify (hand-written record, no
  // fingerprint) names a different port; overwriting it would make the group
  // unstoppable forever.
  const unrelated = await liveGroupLeader();
  await writeServerRecordFile(dir, unrelated, portRecorded);

  try {
    const result = await ensureDevServer(urlTarget, { dir, timeoutMs: 3_000 });

    assert.equal(result.started, false, 'safety refusal: nothing was spawned');
    assert.equal(result.up, false);
    assert.match(result.error ?? '', /cannot be verified as ours/);
    assert.match(result.error ?? '', /not overwriting its record/);

    const record = await readServerRecord(dir);
    assert.ok(record, 'the unverifiable record is retained');
    assert.equal(record!.pgid, unrelated);
    assert.equal(record!.port, portRecorded);
    assert.equal(groupGone(unrelated), false, 'the live group was never touched');
  } finally {
    try {
      process.kill(-unrelated, 'SIGKILL');
    } catch {
      /* already gone */
    }
  }
});
