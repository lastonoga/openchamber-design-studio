// Start a project's dev server on demand, so opening the live window does not
// land on a dead page.
//
// When the panel asks the service to open a project's URL and that URL is not
// answering yet, this module reads the project's `.design-studio.json`, runs its
// `command` detached from the service, and waits for the URL to come up. The
// service (and its Chrome window) is the only thing the panel controls; the dev
// server is the project's own process and outlives a single open call.
//
// Loopback only: Design Studio drives local dev servers, never remote hosts.
//
// Lifetime: a started server is spawned `detached`, so its pid is also its
// process-GROUP id. Killing the positive pid would only kill the shell, leaving
// the real `npm`/`vite` child behind; a reliable stop therefore targets the
// whole group (`process.kill(-pgid, …)`) and is recorded per project dir in
// `<dir>/.design-studio/server.json` so a restarted service can still stop a
// server it started. The record carries a fingerprint of the group leader (its
// `ps -o lstart=` line at spawn time) that is re-checked before any signal, so
// a pid/pgid the OS handed to an unrelated process is never killed. The
// service NEVER kills a pid/PGID it cannot verify as its own.
//
// Determinism note: a scaffolded `command` should bind all interfaces (Vite
// `--host`, Next `-H 0.0.0.0`) because the in-app Chrome resolves `localhost`
// to IPv4 while the dev server may bind IPv6 (`[::1]`) only. The panel already
// surfaces that scaffold guidance, and the reachability probe here checks both
// loopback literals so a server that came up on either one is still seen.
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { promisify } from 'node:util';

import { otherLoopback } from './browser.ts';
import { readStudioConfig } from './studio-config.ts';

/** How long a single reachability probe may take before it counts as down. */
const PROBE_TIMEOUT_MS = 1500;
/** How often to re-probe while waiting for a just-started server. */
const POLL_INTERVAL_MS = 300;
/** A command that exits this soon after spawn never started serving. */
const EARLY_EXIT_MS = 2000;
/** Default time to wait for a freshly started server to answer. */
const DEFAULT_TIMEOUT_MS = 60_000;

/** How long a stopped group may take to die after SIGTERM before SIGKILL. */
const STOP_TERM_WAIT_MS = 500;
/** How long to wait for the group to die after SIGKILL. */
const STOP_KILL_WAIT_MS = 2_000;
/** How long to wait for the port to be released after the group is gone. */
const PORT_FREE_WAIT_MS = 2_000;
/** Poll interval while waiting for a group to die or a port to free. */
const STOP_POLL_MS = 50;

/**
 * Per-project dev-server state directory. Kept beside the project's config so a
 * restarted service finds the same record; the file holds only the pgid, pid,
 * port, start time and the leader's identity fingerprint — nothing the project
 * itself depends on.
 */
export const SERVER_STATE_DIR = '.design-studio';
export const SERVER_STATE_FILE = 'server.json';

/** A started dev server as it is recorded, in memory and on disk. */
export type DevServerRecord = {
  /** Process-group id (the detached child's pid, the group leader). */
  pgid: number;
  /** The group leader's pid (equal to `pgid` for a detached spawn). */
  pid: number;
  /** The loopback port the URL names, or null when the URL had none. */
  port: number | null;
  /** Epoch ms the server was spawned. */
  startedAt: number;
  /**
   * Fingerprint of the group leader taken at spawn time (its `ps -o lstart=`
   * line). Before signalling the group — or reporting it as up — this is
   * re-checked against the live process, so a pid/pgid the OS later handed to
   * an unrelated process can never be killed or trusted. A record without it
   * cannot be verified as ours and is refused.
   */
  identity?: string;
};

/** What `stopDevServer` reports: whether the recorded server was stopped. */
export type StopDevServerResult = { stopped: boolean; error?: string };

/** What `getDevServerStatus` reports: reachability, port and group leader. */
export type DevServerStatus = { up: boolean; port: number | null; pid?: number; error?: string };

/** What `ensureDevServer` accepts. */
export type EnsureDevServerOptions = {
  /** Project dir whose `.design-studio.json` names the command to spawn. */
  dir?: string;
  /** How long to wait for a freshly spawned server to answer. */
  timeoutMs?: number;
  /**
   * Manual-start strictness (the /server/start route): an answering URL is
   * claimed as "running" only when a live, identity-verified record of THIS
   * service covers the same port; otherwise the call refuses with the
   * port-in-use error instead of announcing a foreign process as ours.
   * Without this flag (the /open path) any HTTP answer still counts as up, so
   * an externally served preview keeps working.
   */
  ownedOnly?: boolean;
};

export type EnsureDevServerResult = {
  /** True when THIS call spawned the dev-server command (false = already up). */
  started: boolean;
  /** True when the URL answers after this call. */
  up: boolean;
  /** Actionable reason when `up` is false. */
  error?: string;
};

/**
 * In-flight starts keyed by the RESOLVED project dir: a second click while a
 * start is still polling joins the first attempt instead of spawning a second
 * server. The claim is taken synchronously before any await inside
 * `ensureDevServer`, so identical directories under different spellings share
 * one claim.
 */
const activeSpawns = new Map<string, Promise<EnsureDevServerResult>>();
/**
 * Last server started per project dir, mirrored on disk. The group id is the
 * detached child's pid; keeping it in memory makes a stop in the same process
 * fast, while the on-disk record lets a restarted service stop it too.
 */
const serverRecords = new Map<string, DevServerRecord>();

function serverStatePath(dir: string): string {
  return path.join(dir, SERVER_STATE_DIR, SERVER_STATE_FILE);
}

/** Read a project's persisted server record, or null when there is none. */
export async function readServerRecord(dir: string): Promise<DevServerRecord | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(serverStatePath(dir), 'utf8')) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const record = parsed as {
      pgid?: unknown;
      pid?: unknown;
      port?: unknown;
      startedAt?: unknown;
      identity?: unknown;
    };
    if (typeof record.pgid !== 'number' || !Number.isFinite(record.pgid) || record.pgid <= 0) return null;
    return {
      pgid: record.pgid,
      pid: typeof record.pid === 'number' && record.pid > 0 ? record.pid : record.pgid,
      port: typeof record.port === 'number' && Number.isFinite(record.port) ? record.port : null,
      startedAt: typeof record.startedAt === 'number' ? record.startedAt : 0,
      identity:
        typeof record.identity === 'string' && record.identity.trim() !== '' ? record.identity : undefined,
    };
  } catch {
    return null;
  }
}

/** Persist a server record. Best effort: the in-memory map still tracks it. */
async function writeServerRecord(dir: string, record: DevServerRecord): Promise<void> {
  serverRecords.set(dir, record);
  try {
    await fs.mkdir(path.join(dir, SERVER_STATE_DIR), { recursive: true });
    await fs.writeFile(serverStatePath(dir), JSON.stringify(record), 'utf8');
  } catch {
    /* a project dir we cannot write still stops within this service instance */
  }
}

/** Drop a project's server record (memory and disk). */
async function clearServerRecord(dir: string): Promise<void> {
  serverRecords.delete(dir);
  try {
    await fs.rm(serverStatePath(dir), { force: true });
  } catch {
    /* already gone */
  }
}

/**
 * Clear a project's record only while it still names `pgid`: a concurrent start
 * may have written a newer record while this cleanup was running, and the newer
 * record must survive.
 */
async function clearRecordIfSame(dir: string, pgid: number): Promise<void> {
  const current = serverRecords.get(dir);
  if (current) {
    if (current.pgid === pgid) await clearServerRecord(dir);
  } else if ((await readServerRecord(dir))?.pgid === pgid) {
    await clearServerRecord(dir);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host === '::1') return true;
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
}

/** True when the URL's host is a loopback literal; false for anything else. */
export function isLoopbackUrl(rawUrl: string): boolean {
  try {
    return isLoopbackHost(new URL(rawUrl).hostname);
  } catch {
    return false;
  }
}

async function probeOnce(url: string): Promise<boolean> {
  try {
    // Any HTTP response (even 4xx/5xx) means something is serving; only a
    // refused connection or a timeout counts as down.
    await fetch(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    return true;
  } catch {
    return false;
  }
}

/**
 * Reachable if either loopback literal answers. macOS dev servers commonly bind
 * IPv6 while `localhost` resolves to IPv4, so a single-literal probe would call
 * a running server down.
 */
export async function isReachable(url: string): Promise<boolean> {
  if (await probeOnce(url)) return true;
  const sibling = otherLoopback(url);
  if (sibling && sibling !== url) return probeOnce(sibling);
  return false;
}

/** True when a TCP port can be bound on loopback right now (the free check). */
export function canBindPort(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once('error', () => resolve(false));
    probe.listen(port, host, () => {
      probe.close(() => resolve(true));
    });
  });
}

/** The port a URL names, or null for an invalid URL or the scheme default. */
function portFromUrl(url: string): number | null {
  try {
    const raw = new URL(url).port;
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
}

/** True while the process group still has a live member. */
function groupAlive(pgid: number): boolean {
  try {
    process.kill(-pgid, 0);
    return true;
  } catch (error) {
    // ESRCH means no such group; EPERM means it exists but is not ours — alive.
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

const execFileAsync = promisify(execFile);

/**
 * Fingerprint of a live process: the `ps -o lstart=` line the OS reports for
 * it. Taken once when the service spawns a dev server and re-checked before
 * the recorded group is signalled or trusted, so a pid the OS later handed to
 * an unrelated process is never mistaken for ours. Returns null when the pid
 * cannot be found (the process is gone) or `ps` fails.
 */
export async function readProcessIdentity(pid: number): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('ps', ['-p', String(pid), '-o', 'lstart=']);
    const line = stdout.trim();
    return line === '' ? null : line;
  } catch {
    return null;
  }
}

/** The record's identity, re-checked against the live leader. */
type IdentityCheck = { verified: boolean; reason?: string };

async function verifyRecordIdentity(record: DevServerRecord): Promise<IdentityCheck> {
  if (!record.identity) {
    return { verified: false, reason: `the recorded server (pid ${record.pid}) cannot be verified as ours` };
  }
  const identity = await readProcessIdentity(record.pid);
  if (identity === null || identity !== record.identity) {
    return { verified: false, reason: `the recorded server (pid ${record.pid}) cannot be verified as ours` };
  }
  return { verified: true };
}

/** Send a signal to a whole process group; false when it is already gone. */
function signalGroup(pgid: number, signal: NodeJS.Signals): boolean {
  try {
    process.kill(-pgid, signal);
    return true;
  } catch {
    // ESRCH (gone) and EPERM (not ours) both mean "do not retry".
    return false;
  }
}

/** Poll until the group is gone, or the budget runs out. */
async function waitForGroupGone(pgid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!groupAlive(pgid)) return true;
    await delay(STOP_POLL_MS);
  }
  return !groupAlive(pgid);
}

/** Poll until the port can be bound again, or the budget runs out. */
async function waitForPortFree(port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await canBindPort(port)) return true;
    await delay(STOP_POLL_MS);
  }
  return canBindPort(port);
}

/**
 * Stop the dev server the service started for `dir`.
 *
 * The service ONLY kills a process group it recorded for this dir; an unknown
 * dir is a no-op (`stopped:false`). Before signalling anything the recorded
 * group leader's identity is re-checked (`ps -o lstart=` against the fingerprint
 * taken at spawn time): a pid/pgid the OS handed to an unrelated process must
 * never be killed, so a mismatch — or a record that cannot be verified (no
 * fingerprint) — refuses with
 * `stopped:false` and leaves the group and the record untouched.
 *
 * A verified group gets SIGTERM, a brief wait, then SIGKILL. `stopped:true` is
 * reported only when the group is verifiably gone AND (there was no port or the
 * port was freed); otherwise the record is KEPT and `stopped:false` names the
 * problem. An already-gone group (ESRCH) is still a successful stop — no signal
 * is sent at all in that case, and a process-group id is only reusable once its
 * group is empty, so nothing live can hold it. The record is cleared only when
 * it still names the group that was just stopped, so a concurrent start's newer
 * record survives the cleanup.
 */
export async function stopDevServer(dir: string): Promise<StopDevServerResult> {
  const key = path.resolve(dir);
  const record = serverRecords.get(key) ?? (await readServerRecord(key));
  if (!record) return { stopped: false };

  const stoppedPgid = record.pgid;

  if (groupAlive(stoppedPgid)) {
    // The group exists — make sure it is still the one this service started
    // before sending it any signal.
    const check = await verifyRecordIdentity(record);
    if (!check.verified) return { stopped: false, error: `${check.reason}; not stopping it` };

    signalGroup(stoppedPgid, 'SIGTERM');
    if (!(await waitForGroupGone(stoppedPgid, STOP_TERM_WAIT_MS))) {
      signalGroup(stoppedPgid, 'SIGKILL');
      if (!(await waitForGroupGone(stoppedPgid, STOP_KILL_WAIT_MS))) {
        // The group survived both signals: keep the record so a later stop can
        // retry, and report the failure instead of a clean bill of health.
        return {
          stopped: false,
          error: `the dev server process group (pgid ${stoppedPgid}) is still alive after SIGTERM and SIGKILL`,
        };
      }
    }
  }

  // The group is gone (or never was). A stop is only honest when it also freed
  // the port: if something still holds it, keep the record and say so.
  if (record.port !== null && !(await waitForPortFree(record.port, PORT_FREE_WAIT_MS))) {
    return {
      stopped: false,
      error: `port ${record.port} remains in use after the dev server stopped`,
    };
  }

  // Clear only when the record still names the group that was stopped: a
  // concurrent start may have written a newer record while we were killing.
  await clearRecordIfSame(key, stoppedPgid);
  return { stopped: true };
}

/**
 * Status of the dev server recorded for `dir`: whether the recorded port answers
 * and the group leader's pid. With no record the status stays silent
 * (`{ up:false, port:null }`) — unless the project's configured URL port is
 * currently occupied, which is reported with a not-ours error instead: the
 * panel must learn that the preview port is held by a foreign process, not
 * just that nothing is running.
 *
 * A stale record is cleared, not reported: when the recorded group is dead the
 * service no longer owns whatever answers the port, so the `pid` must vanish
 * (the panel reads a `pid` as "the service records this server"). The record is
 * cleared only while it still names that dead group, so a concurrent start's
 * newer record survives the cleanup. If the port is still bound the status
 * names it with a not-ours error; if the port is free there is nothing to
 * report at all. A live recorded group is reported as up only after its
 * leader's identity verifies against the spawn-time fingerprint; an
 * unverifiable live group (no fingerprint, or a reused pid) is reported down
 * with the same not-ours error and the record is kept.
 */
export async function getDevServerStatus(dir: string): Promise<DevServerStatus> {
  const key = path.resolve(dir);
  const record = serverRecords.get(key) ?? (await readServerRecord(key));
  if (!record) {
    // No record: still name an occupied configured port instead of staying
    // silent — an unowned holder on the configured preview port is actionable.
    const { config } = await readStudioConfig(key);
    const configuredPort = portFromUrl(typeof config?.url === 'string' ? config.url : '');
    if (configuredPort !== null && !(await canBindPort(configuredPort))) {
      return {
        up: false,
        port: configuredPort,
        error: `port ${configuredPort} is answered by a process this service did not start`,
      };
    }
    return { up: false, port: null };
  }
  if (!groupAlive(record.pgid)) {
    // Clear only while the record still names this dead group: a concurrent
    // start may have written a newer record while this status ran.
    await clearRecordIfSame(key, record.pgid);
    if (record.port !== null && !(await canBindPort(record.port))) {
      return {
        up: false,
        port: record.port,
        error: `port ${record.port} is answered by a process this service did not start`,
      };
    }
    return { up: false, port: null };
  }
  // The group is alive: confirm it is still the one this service started
  // before reporting anything as up.
  const check = await verifyRecordIdentity(record);
  if (!check.verified) {
    return {
      up: false,
      port: record.port,
      error: `${check.reason} — not reporting it as running`,
    };
  }
  const up = record.port !== null ? await isReachable(`http://127.0.0.1:${record.port}/`) : false;
  const status: DevServerStatus = { up, port: record.port };
  if (record.pgid > 0) status.pid = record.pgid;
  return status;
}

/**
 * Ensure a local dev server is up.
 *
 * Decision tree:
 *  · reachable already            → `{ started:false, up:true }`
 *    (with `ownedOnly`: only when a live identity-verified record covers the
 *     same port; otherwise `{ started:false, up:false, error }` — port in use)
 *  · down, no dir                 → `{ started:false, up:false, error }` (nothing to start)
 *  · down, dir with a live, identity-verified record naming the URL's port
 *    while that port is bound
 *                                 → `{ started:false, up:true }` (it is ours)
 *  · down, dir with no `command`  → `{ started:false, up:false, error }` (mentions "command")
 *  · down, dir, URL port occupied → `{ started:false, up:false, error }` (port in use)
 *  · down, dir with a `command`   → spawn detached, poll:
 *      · answers within timeout    → `{ started:true, up:true }`
 *      · exits within ~2s          → `{ started:true, up:false, error }`
 *      · never answers in timeout  → `{ started:true, up:false, error }`
 *
 * Concurrency: the in-flight claim below is taken SYNCHRONOUSLY for the
 * resolved dir — no await sits between resolving the key and claiming — so two
 * calls for the same directory, however spelled, can never both miss the map
 * and both spawn. A joiner awaits the original attempt and reports its outcome
 * with `started:false`: it did not spawn anything.
 */
export async function ensureDevServer(
  url: string,
  options: EnsureDevServerOptions = {},
): Promise<EnsureDevServerResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { started: false, up: false, error: `invalid URL: ${url}` };
  }
  if (!isLoopbackHost(parsed.hostname)) {
    return {
      started: false,
      up: false,
      error: `refusing to start a dev server for a non-loopback host: ${parsed.hostname}`,
    };
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const dir = options.dir;
  if (!dir) {
    if (await isReachable(url)) return { started: false, up: true };
    return {
      started: false,
      up: false,
      error: 'the dev server is not running and no project directory was provided to start it',
    };
  }

  // Synchronously claim the spawn slot for the resolved dir. Everything async
  // (reachability, config read, port check, spawn) happens INSIDE the claimed
  // region, so joiners see the claim no matter how early they arrive.
  const key = path.resolve(dir);
  const inFlight = activeSpawns.get(key);
  if (inFlight) {
    // A joiner did not spawn anything: report the original attempt's outcome,
    // but never claim its `started:true`.
    const joined = await inFlight;
    return { started: false, up: joined.up, ...(joined.error ? { error: joined.error } : {}) };
  }

  let settle: (result: EnsureDevServerResult) => void = () => {};
  const claimed = new Promise<EnsureDevServerResult>((resolve) => {
    settle = resolve;
  });
  activeSpawns.set(key, claimed);
  const finish = (result: EnsureDevServerResult): EnsureDevServerResult => {
    settle(result);
    return result;
  };

  try {
    if (await isReachable(url)) {
      if (options.ownedOnly !== true) {
        // Externally-served preview compatibility (/open): any HTTP answer
        // counts as up, even from a server this service did not start.
        return finish({ started: false, up: true });
      }
      // Manual start (/server/start): the answer may be claimed as "running"
      // only when a live, identity-verified record of this service covers the
      // SAME port. Otherwise the answerer is foreign — refuse instead of
      // announcing someone else's process as our running server.
      const pinnedPort = portFromUrl(url);
      const existing = serverRecords.get(key) ?? (await readServerRecord(key));
      if (
        existing &&
        pinnedPort !== null &&
        existing.port === pinnedPort &&
        groupAlive(existing.pgid)
      ) {
        const check = await verifyRecordIdentity(existing);
        if (check.verified) return finish({ started: false, up: true });
      }
      return finish({
        started: false,
        up: false,
        error:
          pinnedPort === null
            ? 'the URL answers, but no server recorded for this project can be verified as ours'
            : `port ${pinnedPort} is already in use by another process — stop it or change the port in .design-studio.json`,
      });
    }

    // The URL is down. Before considering a spawn: a LIVE group is still
    // recorded for this dir. When its port differs from the URL's port,
    // spawning here would overwrite the only record that can stop that live
    // server — refuse and keep the record. No automatic stop, never a kill of
    // a group this service cannot verify as its own.
    const pinnedPort = portFromUrl(url);
    const existing = serverRecords.get(key) ?? (await readServerRecord(key));
    if (
      existing &&
      pinnedPort !== null &&
      existing.port !== null &&
      existing.port !== pinnedPort &&
      groupAlive(existing.pgid)
    ) {
      const check = await verifyRecordIdentity(existing);
      if (check.verified) {
        return finish({
          started: false,
          up: false,
          error: `the recorded dev server is still running on port ${existing.port} — stop it before starting port ${pinnedPort}`,
        });
      }
      // A live group this service cannot verify: overwriting its record would
      // leave it unstoppable forever. Safety refusal — the record is retained.
      return finish({
        started: false,
        up: false,
        error: `${check.reason} — not overwriting its record`,
      });
    }

    // A live record that still verifies as ours and names the SAME port means
    // this service's own server is registered here: if that port is bound, the
    // probe just lost a race with our own server — report it as ours instead
    // of refusing or spawning a duplicate.
    if (
      existing &&
      pinnedPort !== null &&
      existing.port === pinnedPort &&
      !(await canBindPort(pinnedPort)) &&
      groupAlive(existing.pgid)
    ) {
      const check = await verifyRecordIdentity(existing);
      if (check.verified) return finish({ started: false, up: true });
    }

    const { config } = await readStudioConfig(key);
    const command = typeof config?.command === 'string' ? config.command.trim() : '';
    if (!command) {
      return finish({
        started: false,
        up: false,
        error: 'the dev server is not running and .design-studio.json has no "command" to start it',
      });
    }

    // The URL is down and no verified record of ours covers it: if its port is
    // still bound, that holder is someone else's (or a crashed leftover), and
    // spawning would make vite either fail or silently drift to another port,
    // leaving the pinned URL dead — refuse with an actionable error instead.
    if (pinnedPort !== null && !(await canBindPort(pinnedPort))) {
      return finish({
        started: false,
        up: false,
        error: `port ${pinnedPort} is already in use by another process — stop it or change the port in .design-studio.json`,
      });
    }

    return finish(await startAndWait(command, key, url, timeoutMs));
  } finally {
    activeSpawns.delete(key);
  }
}

async function startAndWait(
  command: string,
  dir: string,
  url: string,
  timeoutMs: number,
): Promise<EnsureDevServerResult> {
  const startedAt = Date.now();
  let failure: string | null = null;
  // Set once the URL was seen up: after that, a later exit is a server that
  // served and died, not a failed start — its exit must not erase the record.
  let sawUp = false;
  let leader: number | null = null;

  let child: ChildProcess;
  try {
    child = spawn(command, { cwd: dir, shell: true, detached: true, stdio: 'ignore' });
  } catch (error) {
    return {
      started: false,
      up: false,
      error: `could not start "${command}": ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  // Detach so the dev server keeps serving after the service exits; a single
  // open attempt must not tie its lifetime to the panel.
  child.unref();
  leader = typeof child.pid === 'number' ? child.pid : null;
  const pid = child.pid;
  if (typeof pid === 'number') {
    // A detached child is its own process-group leader, so its pid IS the group
    // id. Record pid, pgid, the URL's port and a fingerprint of the leader, so
    // a later stop can verify the group is still ours before killing it.
    let identity = await readProcessIdentity(pid);
    if (identity === null) {
      // A just-spawned child is visible to ps; retry once in case of a race.
      await delay(50);
      identity = await readProcessIdentity(pid);
    }
    await writeServerRecord(path.resolve(dir), {
      pgid: pid,
      pid,
      port: portFromUrl(url),
      startedAt: Date.now(),
      ...(identity ? { identity } : {}),
    });
  }

  child.on('error', (error) => {
    if (failure === null) failure = `could not start "${command}": ${error.message}`;
  });
  child.on('exit', (code, signal) => {
    // An exit within a couple of seconds means the command never served; report
    // it at once rather than waiting the whole timeout for a dead process.
    if (failure === null && !sawUp && Date.now() - startedAt <= EARLY_EXIT_MS) {
      const how = code !== null ? `exit code ${code}` : `signal ${signal}`;
      failure = `the command "${command}" exited right after starting (${how})`;
      // Drop the record only while it still names THIS spawn's group: a record
      // from a newer spawn (a concurrent restart after a stop) must survive —
      // the exit event of a long-finished start must not erase it.
      if (leader !== null) void clearRecordIfSame(dir, leader);
    }
  });

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (failure !== null) return { started: true, up: false, error: failure };
    if (await isReachable(url)) {
      sawUp = true;
      return { started: true, up: true };
    }
    await delay(POLL_INTERVAL_MS);
  }
  return {
    started: true,
    up: false,
    error: `the command started but ${url} never came up within ${Math.round(timeoutMs / 1000)}s`,
  };
}
