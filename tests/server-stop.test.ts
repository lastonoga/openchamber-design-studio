// The dev-server stop decision and its panel wiring.
//
// The panel bundle runs in a browser frame, so this file installs the same
// minimal shim as mode-open.test.ts and stubs the host (`serviceRequest`,
// `toast`, `storage`, `listProjects`, `listSessions`). It imports `panel/main.ts`
// so the real stop path is exercised; `main()` no-ops without a host `onReady`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { GuestSessionRecord } from '@openchamber/sdk';

type ServiceRequest = { method: string; path: string; query?: Record<string, string>; body?: string };
type StubResult = { status: number; body: string };
type Toast = { kind: string; message: string };

const shim = {
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  parent: { postMessage: () => undefined },
};
(globalThis as { window?: unknown }).window = shim;
(globalThis as { document?: unknown }).document = {
  getElementById: () => ({ append: () => undefined }),
  documentElement: {},
};

const api = await import('../panel/api.ts');
const main = await import('../panel/main.ts');
const { shouldStopDevServer, countOtherActiveDesignSessions } = api;
const {
  setProjectDirectory,
  markServerStartedByUs,
  setSessionBusy,
  resetStopState,
  requestDevServerStop,
  manualStopRefusalMessage,
  applySessionSnapshot,
  handleSessionLifecycle,
  getStopState,
  setStudioConfig,
  getServerControlState,
  getServerAnnouncements,
  resetServerAnnouncements,
  refreshServerStatus,
  clickServerControl,
} = main;

function stubService(handler: (request: ServiceRequest) => StubResult): ServiceRequest[] {
  const calls: ServiceRequest[] = [];
  (api.host as unknown as { serviceRequest: (r: ServiceRequest) => Promise<StubResult> }).serviceRequest = async (request) => {
    calls.push(request);
    return handler(request);
  };
  return calls;
}

function stubToast(): Toast[] {
  const toasts: Toast[] = [];
  (api.host as unknown as { toast: (t: Toast) => Promise<void> }).toast = async (toast) => {
    toasts.push(toast);
  };
  return toasts;
}

/** In-memory host storage; `keys` seeds the design-marker scan. */
function stubStorage(initialKeys: string[] = []): Map<string, unknown> {
  const store = new Map<string, unknown>();
  for (const key of initialKeys) store.set(key, { on: true });
  (api.host as unknown as {
    storage: {
      get: (key: string) => Promise<unknown>;
      set: (key: string, value: unknown) => Promise<void>;
      keys: () => Promise<string[]>;
    };
  }).storage = {
    get: async (key) => store.get(key),
    set: async (key, value) => {
      store.set(key, value);
    },
    keys: async () => [...store.keys()],
  };
  return store;
}

type SessionRecord = {
  id: string;
  title: string;
  projectId: string;
  directory: string;
  parentId: null;
  createdAt: number;
  updatedAt: number;
  archivedAt: null;
  worktree: null;
  activity: string;
  outcome: null;
  items: Array<{ id: string; data?: unknown }>;
};

type WorkspaceOptions = {
  projects?: Array<{ id: string; name: string; directory: string }>;
  sessions?: Record<string, SessionRecord[]>;
};

/** Stub `host.listProjects` and `host.listSessions` for the given projects. */
function stubWorkspace(options: WorkspaceOptions): void {
  const projects = options.projects ?? [];
  (api.host as unknown as { listProjects: () => Promise<unknown> }).listProjects = async () => ({
    kind: 'projects',
    state: 'ready',
    projects,
  });
  (api.host as unknown as { listSessions: (id: string) => Promise<unknown> }).listSessions = async (projectId) => ({
    kind: 'sessions',
    projectId,
    state: 'ready',
    coverage: [],
    sessions: options.sessions?.[projectId] ?? [],
  });
}

const STOP_OK: StubResult = { status: 200, body: JSON.stringify({ ok: true, stopped: true }) };

function stopCalls(calls: ServiceRequest[]): ServiceRequest[] {
  return calls.filter((call) => call.path === '/server/stop');
}

test('shouldStopDevServer stops only when idle, alone and ours', () => {
  assert.equal(shouldStopDevServer({ busy: false, otherActiveDesignSessions: 0, startedByUs: true }), true);
  assert.equal(shouldStopDevServer({ busy: true, otherActiveDesignSessions: 0, startedByUs: true }), false);
  assert.equal(shouldStopDevServer({ busy: false, otherActiveDesignSessions: 1, startedByUs: true }), false);
  assert.equal(shouldStopDevServer({ busy: false, otherActiveDesignSessions: 0, startedByUs: false }), false);
});

test('countOtherActiveDesignSessions counts other active design sessions only', () => {
  const sessions: Array<Pick<GuestSessionRecord, 'id' | 'items' | 'activity'>> = [
    { id: 'a', activity: 'running', items: [{ id: 'i1', data: { mode: { on: true } } }] },
    { id: 'b', activity: 'idle', items: [{ id: 'i2', data: { mode: { on: true } } }] },
    { id: 'c', activity: 'running', items: [] },
    { id: 'd', activity: 'running', items: [] },
  ];
  const markers = new Set(['d']);
  assert.equal(countOtherActiveDesignSessions(sessions, null, markers), 2, 'the chip design session and the marked one');
  assert.equal(countOtherActiveDesignSessions(sessions, 'a', markers), 1, 'our own session is excluded');
  assert.equal(countOtherActiveDesignSessions(sessions, 'a', new Set<string>()), 0, 'no marks and no chips means none');
});

test('an idle, alone, ours session stops the server on the automatic path', async () => {
  resetStopState();
  stubToast();
  stubStorage();
  const calls = stubService((request) => (request.path === '/server/stop' ? STOP_OK : { status: 404, body: '{}' }));
  stubWorkspace({ projects: [{ id: 'p1', name: 'Site', directory: '/projects/site' }] });
  setProjectDirectory('/projects/site');
  markServerStartedByUs('/projects/site');
  setSessionBusy(false);

  await requestDevServerStop();

  const stop = stopCalls(calls);
  assert.equal(stop.length, 1, 'the stop route is called once');
  assert.equal(stop[0]!.method, 'POST');
  assert.deepEqual(JSON.parse(stop[0]!.body ?? ''), { dir: '/projects/site' });
  assert.deepEqual(getStopState().startedServers, [], 'the started flag is cleared after the stop');
});

test('the automatic stop never runs for a dir we did not start', async () => {
  resetStopState();
  stubToast();
  stubStorage();
  const calls = stubService(() => ({ status: 200, body: JSON.stringify({ ok: true }) }));
  stubWorkspace({});
  setProjectDirectory('/projects/other');
  setSessionBusy(false);

  await requestDevServerStop();

  assert.equal(calls.length, 0, 'nothing is sent for a server we did not start');
});

test('a busy session holds the stop and an idle snapshot releases it', async () => {
  resetStopState();
  stubToast();
  stubStorage();
  const calls = stubService((request) => (request.path === '/server/stop' ? STOP_OK : { status: 404, body: '{}' }));
  stubWorkspace({ projects: [{ id: 'p1', name: 'Site', directory: '/projects/site' }] });
  setProjectDirectory('/projects/site');
  markServerStartedByUs('/projects/site');
  setSessionBusy(true);

  await requestDevServerStop();
  assert.equal(stopCalls(calls).length, 0, 'nothing stops while the session is busy');
  assert.equal(getStopState().pendingStop, true, 'a stop is pending');

  await applySessionSnapshot({ id: 'ses_1', busy: false });
  assert.equal(stopCalls(calls).length, 1, 'the pending stop runs once the snapshot goes idle');
  assert.equal(getStopState().pendingStop, false);
});

test('a completed session lifecycle releases a pending stop', async () => {
  resetStopState();
  stubToast();
  stubStorage();
  const calls = stubService((request) => (request.path === '/server/stop' ? STOP_OK : { status: 404, body: '{}' }));
  stubWorkspace({ projects: [{ id: 'p1', name: 'Site', directory: '/projects/site' }] });
  setProjectDirectory('/projects/site');
  markServerStartedByUs('/projects/site');
  setSessionBusy(true);
  await requestDevServerStop();
  assert.equal(getStopState().pendingStop, true);

  // The session goes idle, then its turn completes.
  setSessionBusy(false);
  await handleSessionLifecycle({ phase: 'completed' });

  assert.equal(stopCalls(calls).length, 1, 'the completed turn performs the pending stop');
  assert.equal(getStopState().pendingStop, false);
});

test('a session that starts working again cancels the pending stop', async () => {
  resetStopState();
  stubToast();
  stubStorage();
  const calls = stubService((request) => (request.path === '/server/stop' ? STOP_OK : { status: 404, body: '{}' }));
  stubWorkspace({ projects: [{ id: 'p1', name: 'Site', directory: '/projects/site' }] });
  setProjectDirectory('/projects/site');
  markServerStartedByUs('/projects/site');
  setSessionBusy(true);
  await requestDevServerStop();
  assert.equal(getStopState().pendingStop, true);

  await applySessionSnapshot({ id: 'ses_1', busy: true });
  assert.equal(getStopState().pendingStop, false, 'a busy snapshot cancels the pending stop');
  assert.equal(stopCalls(calls).length, 0, 'nothing was stopped');
});

test('another active design session in the same dir blocks the stop', async () => {
  resetStopState();
  stubToast();
  stubStorage(['design/other']);
  const calls = stubService((request) => (request.path === '/server/stop' ? STOP_OK : { status: 404, body: '{}' }));
  stubWorkspace({
    projects: [{ id: 'p1', name: 'Site', directory: '/projects/site' }],
    sessions: {
      p1: [
        {
          id: 'other',
          title: 'Other design chat',
          projectId: 'p1',
          directory: '/projects/site',
          parentId: null,
          createdAt: 0,
          updatedAt: 0,
          archivedAt: null,
          worktree: null,
          activity: 'running',
          outcome: null,
          items: [],
        },
      ],
    },
  });
  setProjectDirectory('/projects/site');
  markServerStartedByUs('/projects/site');
  setSessionBusy(false);

  await requestDevServerStop();

  assert.equal(stopCalls(calls).length, 0, 'the other active design session keeps the server');
  assert.equal(getStopState().pendingStop, false, 'no pending stop is left for another session');
  assert.equal(getStopState().startedServers.length, 1, 'we keep tracking the server for the other session');
});

// The manual path (the icon button) skips the panel's in-memory ownership set
// but keeps the idle rule: a busy session queues the stop, it does not send it.
test('a manual stop while the session is busy is held (queued), not sent', async () => {
  resetStopState();
  stubToast();
  stubStorage();
  const calls = stubService((request) => (request.path === '/server/stop' ? STOP_OK : { status: 404, body: '{}' }));
  stubWorkspace({});
  setProjectDirectory('/projects/site');
  // No markServerStartedByUs: after a reload the ownership set is empty, and the
  // manual path must still reach the idle rule instead of refusing silently.
  setSessionBusy(true);

  const result = await requestDevServerStop({ manual: true });

  assert.deepEqual(result, { stopped: false, held: true, blocked: false }, 'the manual stop reports held');
  assert.equal(stopCalls(calls).length, 0, 'the idle rule holds for the manual path too: nothing is sent');
  assert.equal(getStopState().pendingStop, true, 'the stop is queued for when the session goes idle');
});

// The service is the real ownership authority: it kills only a group recorded
// in <dir>/.design-studio/server.json. After a page reload, or when the server
// was already running when the user pressed START, the panel's own set is empty
// while the icon shows running — the manual stop must still work.
test('a manual stop works with an empty ownership set because the service decides ownership', async () => {
  resetStopState();
  stubToast();
  stubStorage();
  const calls = stubService((request) => (request.path === '/server/stop' ? STOP_OK : { status: 404, body: '{}' }));
  stubWorkspace({});
  setProjectDirectory('/projects/site');
  setSessionBusy(false);
  // NO markServerStartedByUs here — this IS the reload / already-running case.

  const result = await requestDevServerStop({ manual: true });

  assert.equal(result.stopped, true, 'the manual stop reaches the service without the ownership gate');
  const stop = stopCalls(calls);
  assert.equal(stop.length, 1, 'the stop route is called once');
  assert.deepEqual(JSON.parse(stop[0]!.body ?? ''), { dir: '/projects/site' });
  assert.deepEqual(getStopState().startedServers, [], 'nothing was tracked to begin with, nothing faked');
});

// The AUTOMATIC path keeps the ownership gate: an empty set stays a silent no-op.
test('the automatic stop still refuses when the ownership set is empty', async () => {
  resetStopState();
  stubToast();
  stubStorage();
  const calls = stubService((request) => (request.path === '/server/stop' ? STOP_OK : { status: 404, body: '{}' }));
  stubWorkspace({});
  setProjectDirectory('/projects/site');
  setSessionBusy(false);

  const result = await requestDevServerStop();

  assert.deepEqual(result, { stopped: false, held: false, blocked: false });
  assert.equal(stopCalls(calls).length, 0, 'the automatic path never stops an untracked server');
});

// A manual stop the service answered stopped:false is a truthful no-op: the
// service only kills a group recorded for the dir, so stopped:false means the
// server was not started by Design Studio. Never a fake success.
test('a manual stop the service refuses announces the truthful no-op message', async () => {
  resetStopState();
  stubToast();
  stubStorage();
  const calls = stubService((request) =>
    request.path === '/server/status'
      ? { status: 200, body: JSON.stringify({ up: false, port: null }) }
      : { status: 200, body: JSON.stringify({ ok: true, stopped: false }) },
  );
  stubWorkspace({});
  setProjectDirectory('/projects/site');
  setSessionBusy(false);

  const message = await manualStopRefusalMessage('/projects/site');

  assert.match(message, /did not record this server/, 'the truthful reason: the service keeps no record for this dir');
  assert.match(message, /not started by Design Studio/);
  assert.ok(calls.some((call) => call.path === '/server/status'), 'the status is consulted for the truthful reason');
});

test('a status that still reports a recorded group keeps the plain no-op line', async () => {
  stubService((request) =>
    request.path === '/server/status'
      ? { status: 200, body: JSON.stringify({ up: true, port: 5173, pid: 4242 }) }
      : { status: 200, body: JSON.stringify({ ok: true, stopped: false }) },
  );

  const message = await manualStopRefusalMessage('/projects/site');

  assert.equal(message, 'No preview dev server to stop.', 'a pid in the payload is the defensive fallback branch');
});

test('a failed status read cannot tell, so it keeps the plain no-op line too', async () => {
  stubService(() => ({ status: 500, body: JSON.stringify({ error: 'service down' }) }));

  const message = await manualStopRefusalMessage('/projects/site');

  assert.equal(message, 'No preview dev server to stop.');
});

// The icon button is the manual path: it passes { manual: true } and surfaces
// the truthful refusal message. Pinned at the source level (the shim here has
// no DOM to build the row with).
test('the icon-button stop is wired as the manual path with the truthful refusal message', async () => {
  const source = await readFile(new URL('../panel/main.ts', import.meta.url), 'utf8');
  const stopStart = source.indexOf('async function stopCurrentServer(');
  assert.ok(stopStart > 0, 'stopCurrentServer is present');
  const stopEnd = source.indexOf('async function readStudioConfig(');
  const body = source.slice(stopStart, stopEnd);
  assert.match(body, /requestDevServerStop\(\{ manual: true \}\)/, 'the icon button takes the manual path');
  assert.match(body, /manualStopRefusalMessage\(dir\)/, 'the refusal message is the truthful one, for the captured dir');
  assert.doesNotMatch(body, /state\.serverStatus = false;\s*\n\s*announceServer\('No preview dev server to stop\.'\)/, 'no fake success flip');
});

// ---- the dev-server Start/Stop control: honest bookkeeping, click/affordance ----

const SITE_CONFIG = { version: 1, name: 'Site', type: 'hi-fi' as const, url: 'http://localhost:5173' };

/** A ready project with a loopback url, its status fresh from a successful poll. */
function readySite(): void {
  stubWorkspace({ projects: [{ id: 'p1', name: 'Site', directory: '/projects/site' }] });
  setProjectDirectory('/projects/site');
  setStudioConfig(SITE_CONFIG);
  setSessionBusy(false);
}

test('a stop the service answers ok:false keeps ownership and never fakes success', async () => {
  resetStopState();
  resetServerAnnouncements();
  stubToast();
  stubStorage();
  stubService((request) =>
    request.path === '/server/status'
      ? { status: 200, body: JSON.stringify({ up: true, port: 5173, pid: 7 }) }
      : request.path === '/server/stop'
        ? { status: 200, body: JSON.stringify({ ok: false, error: 'refused' }) }
        : { status: 404, body: '{}' },
  );
  readySite();
  markServerStartedByUs('/projects/site');
  await refreshServerStatus();
  assert.equal(getServerControlState().status, true, 'the poll put the server up first');

  const result = await requestDevServerStop();

  assert.equal(result.stopped, false, 'an ok:false stop is not reported as stopped');
  assert.deepEqual(getStopState().startedServers, ['/projects/site'], 'ownership is retained: nothing was confirmed stopped');
  assert.equal(getStopState().pendingStop, false);

  // The manual surface must not announce a fake success either.
  await clickServerControl();
  const announcements = getServerAnnouncements();
  assert.equal(announcements.includes('Preview dev server stopped.'), false, 'no false "stopped" announcement');
  assert.ok(announcements.some((message) => message !== 'Preview dev server stopped.' && message.length > 0), 'the click announced the truth');
  assert.deepEqual(getStopState().startedServers, ['/projects/site'], 'still ours after the failed stop');
  assert.equal(getServerControlState().status, true, 'no fake flip to stopped');
});

test('a manual stop the service answers stopped:false reaches the refusal branch with its message', async () => {
  resetStopState();
  resetServerAnnouncements();
  stubToast();
  stubStorage();
  stubService((request) =>
    request.path === '/server/status'
      ? { status: 200, body: JSON.stringify({ up: true, port: 5173, pid: 4242 }) }
      : request.path === '/server/stop'
        ? { status: 200, body: JSON.stringify({ ok: true, stopped: false }) }
        : { status: 404, body: '{}' },
  );
  readySite();
  markServerStartedByUs('/projects/site');
  await refreshServerStatus();
  assert.equal(getServerControlState().status, true, 'the icon shows running');
  resetServerAnnouncements();

  await clickServerControl();

  assert.deepEqual(
    getServerAnnouncements(),
    ['No preview dev server to stop.'],
    'the truthful refusal is announced — no fake "stopped" success, and the still-running poll makes no transition',
  );
  assert.deepEqual(getStopState().startedServers, ['/projects/site'], 'ownership is only dropped on a CONFIRMED stop');
  assert.equal(getServerControlState().status, true, 'the icon was not flipped to stopped by the refusal');
});

test('after a poll error the icon click retries by STARTING, never stopping the healthy server', async () => {
  resetStopState();
  resetServerAnnouncements();
  stubToast();
  stubStorage();
  let fail = false;
  const calls = stubService((request) => {
    if (request.path === '/server/status') {
      return fail ? { status: 500, body: JSON.stringify({ error: 'status down' }) } : { status: 200, body: JSON.stringify({ up: true, port: 5173 }) };
    }
    if (request.path === '/server/start') return { status: 200, body: JSON.stringify({ ok: true, started: true, up: true }) };
    return { status: 404, body: '{}' };
  });
  stubWorkspace({});
  setProjectDirectory('/projects/site');
  setStudioConfig(SITE_CONFIG);
  setSessionBusy(false);

  await refreshServerStatus();
  assert.equal(getServerControlState().status, true);
  fail = true;
  await refreshServerStatus();
  assert.ok(getServerControlState().error, 'the poll error is on the icon: "error — click to retry"');
  fail = false;

  await clickServerControl();

  assert.equal(calls.some((call) => call.path === '/server/start'), true, 'the click matches the affordance: it retries by starting');
  assert.equal(calls.some((call) => call.path === '/server/stop'), false, 'the click never stops the healthy server behind the stale status');
});

test('a successful poll clears the error so a stopped server returns to is-stopped', async () => {
  resetStopState();
  resetServerAnnouncements();
  stubToast();
  stubStorage();
  let fail = false;
  let up = true;
  stubService((request) =>
    request.path === '/server/status'
      ? fail
        ? { status: 500, body: JSON.stringify({ error: 'status down' }) }
        : { status: 200, body: JSON.stringify({ up, port: up ? 5173 : null }) }
      : { status: 404, body: '{}' },
  );
  stubWorkspace({});
  setProjectDirectory('/projects/site');
  setStudioConfig(SITE_CONFIG);
  setSessionBusy(false);

  await refreshServerStatus();
  fail = true;
  await refreshServerStatus();
  assert.ok(getServerControlState().error, 'a transient poll failure shows the error state');
  fail = false;
  up = false;
  await refreshServerStatus();

  const control = getServerControlState();
  assert.equal(control.error, null, 'a successful read clears the error whatever `up` says');
  assert.equal(control.status, false, 'the confirmed-stopped server reads as stopped again (is-stopped, not is-error)');
});

test('a directory switch during an in-flight start commits nothing to the new directory', async () => {
  resetStopState();
  resetServerAnnouncements();
  stubToast();
  stubStorage();
  let resolveStart!: (result: StubResult) => void;
  const calls = stubService((request) => {
    if (request.path === '/server/start') {
      return new Promise<StubResult>((resolve) => {
        resolveStart = resolve;
      }) as unknown as StubResult;
    }
    if (request.path === '/server/status') return { status: 200, body: JSON.stringify({ up: false, port: null }) };
    return { status: 404, body: '{}' };
  });
  stubWorkspace({});
  setProjectDirectory('/projects/a');
  setStudioConfig(SITE_CONFIG);

  const click = clickServerControl();
  setProjectDirectory('/projects/b');
  resolveStart({ status: 200, body: JSON.stringify({ ok: true, started: true, up: true }) });
  await click;

  const start = calls.find((call) => call.path === '/server/start')!;
  assert.deepEqual(JSON.parse(start.body ?? ''), { dir: '/projects/a', url: SITE_CONFIG.url }, 'the start was sent for the directory the click captured');
  assert.deepEqual(getStopState().startedServers, ['/projects/a'], 'only the truly started dir is marked ours');
  const control = getServerControlState();
  assert.equal(control.status, false, 'the new directory is not poisoned with the old start result');
  assert.equal(control.error, null, 'the new directory carries no old error');
});

test('a stale in-flight status read never commits over a newer read', async () => {
  resetStopState();
  resetServerAnnouncements();
  stubToast();
  stubStorage();
  const statusResolvers: Array<(result: StubResult) => void> = [];
  stubService((request) => {
    if (request.path === '/server/status') {
      return new Promise<StubResult>((resolve) => {
        statusResolvers.push(resolve);
      }) as unknown as StubResult;
    }
    return { status: 404, body: '{}' };
  });
  stubWorkspace({});
  setProjectDirectory('/projects/site');
  setStudioConfig(SITE_CONFIG);
  setSessionBusy(false);

  const stale = refreshServerStatus();
  const fresh = refreshServerStatus();
  statusResolvers[1]!({ status: 200, body: JSON.stringify({ up: true, port: 5173 }) });
  await fresh;
  assert.equal(getServerControlState().status, true, 'the newer read committed');

  statusResolvers[0]!({ status: 200, body: JSON.stringify({ up: false, port: null }) });
  await stale;
  assert.equal(getServerControlState().status, true, 'the older in-flight read must not overwrite the newer committed state');
  assert.equal(getServerControlState().error, null);
});

test('a stale status read does not commit while a manual action is in flight', async () => {
  resetStopState();
  resetServerAnnouncements();
  stubToast();
  stubStorage();
  const statusResolvers: Array<(result: StubResult) => void> = [];
  let resolveStart!: (result: StubResult) => void;
  stubService((request) => {
    if (request.path === '/server/status') {
      return new Promise<StubResult>((resolve) => {
        statusResolvers.push(resolve);
      }) as unknown as StubResult;
    }
    if (request.path === '/server/start') {
      return new Promise<StubResult>((resolve) => {
        resolveStart = resolve;
      }) as unknown as StubResult;
    }
    return { status: 404, body: '{}' };
  });
  stubWorkspace({});
  setProjectDirectory('/projects/site');
  setStudioConfig(SITE_CONFIG);
  setSessionBusy(false);

  const stale = refreshServerStatus();
  const click = clickServerControl();
  assert.equal(getServerControlState().pending, true, 'the manual start is in flight');
  statusResolvers[0]!({ status: 500, body: JSON.stringify({ error: 'status down' }) });
  await stale;

  assert.equal(getServerControlState().error, null, 'the stale read must not poison the in-flight action');

  resolveStart({ status: 200, body: JSON.stringify({ ok: true, started: true, up: true }) });
  await click;
  assert.equal(getServerControlState().status, true, 'the action still commits its own result');
});

test('a poll-driven running→stopped flip announces, and an unchanged state does not', async () => {
  resetStopState();
  resetServerAnnouncements();
  stubToast();
  stubStorage();
  let up = true;
  stubService((request) =>
    request.path === '/server/status'
      ? { status: 200, body: JSON.stringify({ up, port: up ? 5173 : null }) }
      : { status: 404, body: '{}' },
  );
  stubWorkspace({});
  setProjectDirectory('/projects/site');
  setStudioConfig(SITE_CONFIG);
  setSessionBusy(false);

  await refreshServerStatus();
  await refreshServerStatus();
  up = false;
  await refreshServerStatus();

  assert.deepEqual(
    getServerAnnouncements(),
    ['Preview dev server is running.', 'Preview dev server stopped.'],
    'each rendered-state change is announced exactly once; the unchanged read is silent',
  );
});

test('an honoured queued stop announces the outcome (idle snapshot path)', async () => {
  resetStopState();
  resetServerAnnouncements();
  stubToast();
  stubStorage();
  stubService((request) => (request.path === '/server/stop' ? STOP_OK : { status: 404, body: '{}' }));
  readySite();
  markServerStartedByUs('/projects/site');
  setSessionBusy(true);
  await requestDevServerStop({ manual: true });
  assert.equal(getStopState().pendingStop, true, 'the stop is queued');
  assert.deepEqual(getServerAnnouncements(), [], 'queued alone announces nothing here');

  setSessionBusy(false);
  await applySessionSnapshot({ id: 'ses_1', busy: false });

  assert.equal(getStopState().pendingStop, false, 'the queued stop ran');
  assert.ok(getServerAnnouncements().includes('Preview dev server stopped.'), '"queued" is followed by an outcome announcement');
});

test('an honoured queued stop announces the outcome (completed lifecycle path)', async () => {
  resetStopState();
  resetServerAnnouncements();
  stubToast();
  stubStorage();
  stubService((request) => (request.path === '/server/stop' ? STOP_OK : { status: 404, body: '{}' }));
  readySite();
  markServerStartedByUs('/projects/site');
  setSessionBusy(true);
  await requestDevServerStop({ manual: true });
  assert.equal(getStopState().pendingStop, true);

  setSessionBusy(false);
  await handleSessionLifecycle({ phase: 'completed' });

  assert.equal(getStopState().pendingStop, false, 'the completed turn performed the stop');
  assert.ok(getServerAnnouncements().includes('Preview dev server stopped.'), 'the outcome is announced');
});

// ---- fail-closed safety verification ----
// The stop may run only when the "no other active design session in this dir"
// check was VERIFIED. An unreadable projects/sessions answer is never "none".

test('an unverifiable safety check fails closed: no stop is sent', async () => {
  resetStopState();
  resetServerAnnouncements();
  stubToast();
  stubStorage();
  const calls = stubService((request) => (request.path === '/server/stop' ? STOP_OK : { status: 404, body: '{}' }));
  stubWorkspace({});
  (api.host as unknown as { listProjects: () => Promise<unknown> }).listProjects = async () => {
    throw new Error('host down');
  };
  setProjectDirectory('/projects/site');
  markServerStartedByUs('/projects/site');
  setSessionBusy(false);

  const result = await requestDevServerStop();

  assert.equal(result.stopped, false, 'an unverifiable check is never a stop');
  assert.equal(result.unknown, true, 'the outcome names the unverifiable check');
  assert.equal(result.blocked, false);
  assert.equal(stopCalls(calls).length, 0, 'no destructive IPC when the safety check cannot be verified');
  assert.deepEqual(getStopState().startedServers, ['/projects/site'], 'ownership is retained');
});

test('a failed or still-loading sessions read also fails closed', async () => {
  resetStopState();
  resetServerAnnouncements();
  stubToast();
  stubStorage();
  const calls = stubService((request) => (request.path === '/server/stop' ? STOP_OK : { status: 404, body: '{}' }));
  stubWorkspace({ projects: [{ id: 'p1', name: 'Site', directory: '/projects/site' }] });
  const hostStub = api.host as unknown as { listSessions: (id: string) => Promise<unknown> };
  setProjectDirectory('/projects/site');
  markServerStartedByUs('/projects/site');
  setSessionBusy(false);

  hostStub.listSessions = async () => {
    throw new Error('sessions down');
  };
  const failed = await requestDevServerStop();
  assert.equal(failed.unknown, true, 'a thrown sessions read cannot verify');
  assert.equal(stopCalls(calls).length, 0);

  hostStub.listSessions = async () => ({ kind: 'sessions', projectId: 'p1', state: 'loading', coverage: [], sessions: [] });
  const loading = await requestDevServerStop();
  assert.equal(loading.unknown, true, 'a still-loading snapshot cannot verify');
  assert.equal(stopCalls(calls).length, 0);
});

test('a manual stop with an unverifiable safety check announces the truthful refusal', async () => {
  resetStopState();
  resetServerAnnouncements();
  stubToast();
  stubStorage();
  const calls = stubService((request) =>
    request.path === '/server/status'
      ? { status: 200, body: JSON.stringify({ up: true, port: 5173, pid: 7 }) }
      : { status: 404, body: '{}' });
  stubWorkspace({});
  (api.host as unknown as { listProjects: () => Promise<unknown> }).listProjects = async () => {
    throw new Error('host down');
  };
  setProjectDirectory('/projects/site');
  setStudioConfig(SITE_CONFIG);
  setSessionBusy(false);
  await refreshServerStatus();
  assert.equal(getServerControlState().status, true);
  resetServerAnnouncements();

  await clickServerControl();

  assert.equal(stopCalls(calls).length, 0, 'nothing was stopped');
  assert.deepEqual(
    getServerAnnouncements(),
    ['Could not verify other design sessions — the preview server was left running.'],
    'the refusal is truthful about WHY: the check could not be verified',
  );
});

// ---- the recheck between the safety lookup and the destructive call ----

test('a directory switch during the safety lookup aborts before the destructive call', async () => {
  resetStopState();
  resetServerAnnouncements();
  stubToast();
  stubStorage();
  const calls = stubService((request) => (request.path === '/server/stop' ? STOP_OK : { status: 404, body: '{}' }));
  stubWorkspace({ projects: [{ id: 'p1', name: 'Site', directory: '/projects/a' }] });
  let resolveSessions!: (value: unknown) => void;
  (api.host as unknown as { listSessions: (id: string) => Promise<unknown> }).listSessions = () =>
    new Promise((resolve) => {
      resolveSessions = resolve;
    });
  setProjectDirectory('/projects/a');
  markServerStartedByUs('/projects/a');
  setSessionBusy(false);

  const pending = requestDevServerStop();
  await new Promise((resolve) => setTimeout(resolve, 0));
  setProjectDirectory('/projects/b');
  resolveSessions({ kind: 'sessions', projectId: 'p1', state: 'ready', coverage: [], sessions: [] });
  const result = await pending;

  assert.equal(result.stopped, false, 'the user left the directory: no stop');
  assert.equal(stopCalls(calls).length, 0, 'the destructive IPC is re-checked against the directory after the lookup');
});

// ---- generation guard: a result that outlives A→B→A ----

test('a start resolving after A→B→A commits no rendered state', async () => {
  resetStopState();
  resetServerAnnouncements();
  stubToast();
  stubStorage();
  let resolveStart!: (result: StubResult) => void;
  const calls = stubService((request) => {
    if (request.path === '/server/start') {
      return new Promise<StubResult>((resolve) => {
        resolveStart = resolve;
      }) as unknown as StubResult;
    }
    // Keep the status read pending: only the ACTION's commit is under test.
    if (request.path === '/server/status') return new Promise<StubResult>(() => undefined) as unknown as StubResult;
    return { status: 404, body: '{}' };
  });
  stubWorkspace({});
  setProjectDirectory('/projects/a');
  setStudioConfig(SITE_CONFIG);
  const click = clickServerControl();
  setProjectDirectory('/projects/b');
  setProjectDirectory('/projects/a');
  resetServerAnnouncements();
  resolveStart({ status: 200, body: JSON.stringify({ ok: true, started: true, up: true }) });
  await click;

  const start = calls.find((call) => call.path === '/server/start')!;
  assert.deepEqual(JSON.parse(start.body ?? ''), { dir: '/projects/a', url: SITE_CONFIG.url }, 'the start was sent for the captured dir');
  assert.deepEqual(getStopState().startedServers, ['/projects/a'], 'ownership marks the truly started dir');
  assert.equal(getServerControlState().status, null, 'the round-trip result never committed a rendered state');
  assert.deepEqual(getServerAnnouncements(), [], 'no announcement for a result the user context left behind');
  assert.equal(getServerControlState().pending, false, 'the action still cleared its own in-flight marker');
});

test('an older action resolving across a switch never clears the newer action in flight', async () => {
  resetStopState();
  resetServerAnnouncements();
  stubToast();
  stubStorage();
  const resolvers = new Map<string, (result: StubResult) => void>();
  stubService((request) => {
    if (request.path === '/server/start') {
      const dir = (JSON.parse(request.body ?? '{}') as { dir: string }).dir;
      return new Promise<StubResult>((resolve) => {
        resolvers.set(dir, resolve);
      }) as unknown as StubResult;
    }
    if (request.path === '/server/status') return { status: 200, body: JSON.stringify({ up: false, port: null }) };
    return { status: 404, body: '{}' };
  });
  stubWorkspace({});
  setProjectDirectory('/projects/a');
  setStudioConfig(SITE_CONFIG);

  const clickA = clickServerControl();
  setProjectDirectory('/projects/b');
  setStudioConfig(SITE_CONFIG);
  const clickB = clickServerControl();
  assert.equal(getServerControlState().pending, true, 'the newer action is in flight');

  resolvers.get('/projects/a')!({ status: 200, body: JSON.stringify({ ok: true, started: true, up: true }) });
  await clickA;

  assert.equal(
    getServerControlState().pending,
    true,
    'the older action’s finally must not clear the newer action’s in-flight marker',
  );

  resolvers.get('/projects/b')!({ status: 200, body: JSON.stringify({ ok: true, started: true, up: true }) });
  await clickB;
  assert.equal(getServerControlState().pending, false, 'the newest action clears its own marker');
});

// ---- status errors from the service ----

test('a service-reported status error is surfaced, never a green Start', async () => {
  resetStopState();
  resetServerAnnouncements();
  stubToast();
  stubStorage();
  let error: string | null = 'Another dev-server identity is recorded for this directory.';
  stubService((request) =>
    request.path === '/server/status'
      ? { status: 200, body: JSON.stringify(error ? { up: true, port: 5173, error } : { up: false, port: null }) }
      : { status: 404, body: '{}' });
  stubWorkspace({});
  setProjectDirectory('/projects/site');
  setStudioConfig(SITE_CONFIG);
  setSessionBusy(false);

  await refreshServerStatus();
  assert.equal(getServerControlState().error, error, 'the service condition is surfaced verbatim');
  assert.equal(getServerControlState().status, null, 'the untrustworthy up bit is not committed as running');

  error = null;
  await refreshServerStatus();
  assert.equal(getServerControlState().error, null, 'a clean read clears it');
  assert.equal(getServerControlState().status, false, 'the clean read commits the real reachability');
});

test('an unknown server state is never masqueraded as stopped', async () => {
  resetStopState();
  assert.equal(getServerControlState().status, null, 'before any read the state is unknown, not "stopped"');
});

test('a start answer without an up confirmation leaves the state unknown', async () => {
  resetStopState();
  resetServerAnnouncements();
  stubToast();
  stubStorage();
  stubService((request) =>
    request.path === '/server/start'
      ? { status: 200, body: JSON.stringify({ ok: true, started: true }) }
      : { status: 404, body: '{}' });
  stubWorkspace({});
  setProjectDirectory('/projects/site');
  setStudioConfig(SITE_CONFIG);
  setSessionBusy(false);

  await clickServerControl();

  assert.equal(getServerControlState().status, null, 'no up confirmation — unknown, not stopped');
  assert.deepEqual(
    getServerAnnouncements().filter((message) => message.includes('started')),
    ['Preview dev server started.'],
    'a confirmed spawn is announced as started, never as a failure',
  );
});

// ---- the queued request keeps its mode and directory ----

test('a queued stop keeps its directory and manual mode', async () => {
  resetStopState();
  resetServerAnnouncements();
  stubToast();
  stubStorage();
  stubService((request) => (request.path === '/server/stop' ? STOP_OK : { status: 404, body: '{}' }));
  stubWorkspace({});
  setProjectDirectory('/projects/site');
  setSessionBusy(true);

  const held = await requestDevServerStop({ manual: true });

  assert.equal(held.held, true);
  assert.deepEqual(getStopState().pendingRequest, { dir: '/projects/site', manual: true }, 'the queued request preserves mode and directory');
  assert.equal(getStopState().pendingStop, true);
});

test('the honoured queued manual stop reaches the service despite an empty ownership set', async () => {
  resetStopState();
  resetServerAnnouncements();
  stubToast();
  stubStorage();
  const calls = stubService((request) => (request.path === '/server/stop' ? STOP_OK : { status: 404, body: '{}' }));
  stubWorkspace({});
  setProjectDirectory('/projects/site');
  setSessionBusy(true);
  await requestDevServerStop({ manual: true });
  assert.equal(getStopState().pendingStop, true);

  setSessionBusy(false);
  await applySessionSnapshot({ id: 'ses_1', busy: false });

  assert.equal(stopCalls(calls).length, 1, 'the manual flag survived the queue: the ownership gate is skipped');
  assert.equal(getStopState().pendingStop, false);
  assert.ok(getServerAnnouncements().includes('Preview dev server stopped.'));
});

test('the honoured queued stop targets the directory it was queued for', async () => {
  resetStopState();
  resetServerAnnouncements();
  stubToast();
  stubStorage();
  const calls = stubService((request) => (request.path === '/server/stop' ? STOP_OK : { status: 404, body: '{}' }));
  stubWorkspace({
    projects: [
      { id: 'p1', name: 'A', directory: '/projects/a' },
      { id: 'p2', name: 'B', directory: '/projects/b' },
    ],
  });
  setProjectDirectory('/projects/a');
  setSessionBusy(true);
  await requestDevServerStop({ manual: true });
  setProjectDirectory('/projects/b');
  setSessionBusy(false);
  await applySessionSnapshot({ id: 'ses_1', busy: false });

  const stop = stopCalls(calls);
  assert.equal(stop.length, 1, 'exactly one stop was sent');
  assert.deepEqual(JSON.parse(stop[0]!.body ?? ''), { dir: '/projects/a' }, 'the queued stop targets its own directory, not the current one');
});

// Honouring dir A's queued stop while the user is on dir B must not flip B's
// OWN running state to stopped: the shared serverStatus commit is guarded by
// the honoured request's directory. The outcome announcement is not guarded —
// it is truthful about the stop itself.
test('honouring a queued stop for another directory leaves the current one running', async () => {
  resetStopState();
  resetServerAnnouncements();
  stubToast();
  stubStorage();
  const calls = stubService((request) => {
    if (request.path === '/server/stop') return STOP_OK;
    if (request.path === '/server/status') {
      const dir = request.query?.dir ?? '';
      return {
        status: 200,
        body: JSON.stringify(dir === '/projects/b' ? { up: true, port: 5173, pid: 9 } : { up: false, port: null }),
      };
    }
    return { status: 404, body: '{}' };
  });
  stubWorkspace({
    projects: [
      { id: 'p1', name: 'A', directory: '/projects/a' },
      { id: 'p2', name: 'B', directory: '/projects/b' },
    ],
  });
  setProjectDirectory('/projects/a');
  setSessionBusy(true);
  await requestDevServerStop({ manual: true });
  assert.equal(getStopState().pendingStop, true, 'the stop is queued for A');

  // The user moves to B, whose dev server is running (its own status read).
  setProjectDirectory('/projects/b');
  await refreshServerStatus();
  assert.equal(getServerControlState().status, true, 'B shows running before the honour');
  resetServerAnnouncements();

  setSessionBusy(false);
  await applySessionSnapshot({ id: 'ses_1', busy: false });

  const stop = stopCalls(calls);
  assert.equal(stop.length, 1, 'the queued stop was honoured');
  assert.deepEqual(JSON.parse(stop[0]!.body ?? ''), { dir: '/projects/a' }, 'the service stop still targets dir A');
  assert.equal(getStopState().pendingStop, false, 'the request is cleared');
  assert.equal(getServerControlState().status, true, "B's running state is untouched by A's stop");
  assert.ok(getServerAnnouncements().includes('Preview dev server stopped.'), 'the outcome is still announced (unguarded, P8)');
});

test('a resumed busy session cancels the queued stop and says so', async () => {
  resetStopState();
  resetServerAnnouncements();
  stubToast();
  stubStorage();
  const calls = stubService((request) => (request.path === '/server/stop' ? STOP_OK : { status: 404, body: '{}' }));
  stubWorkspace({});
  setProjectDirectory('/projects/site');
  setSessionBusy(true);
  await requestDevServerStop({ manual: true });
  assert.equal(getStopState().pendingStop, true);
  resetServerAnnouncements();

  await applySessionSnapshot({ id: 'ses_1', busy: true });

  assert.equal(getStopState().pendingStop, false, 'the documented cancellation is retained');
  assert.equal(stopCalls(calls).length, 0);
  assert.deepEqual(
    getServerAnnouncements().filter((message) => message.includes('cancel')),
    ['Session is busy again — the queued stop was cancelled.'],
    'the cancellation is announced instead of leaving the queued promise standing',
  );
});

test('an honoured queued stop survives an unverifiable check and runs when verification returns', async () => {
  resetStopState();
  resetServerAnnouncements();
  stubToast();
  stubStorage();
  const calls = stubService((request) => (request.path === '/server/stop' ? STOP_OK : { status: 404, body: '{}' }));
  stubWorkspace({ projects: [{ id: 'p1', name: 'Site', directory: '/projects/site' }] });
  let sessionsDown = true;
  const readySessions = (api.host as unknown as { listSessions: (id: string) => Promise<unknown> }).listSessions;
  (api.host as unknown as { listSessions: (id: string) => Promise<unknown> }).listSessions = async (id: string) => {
    if (sessionsDown) throw new Error('sessions down');
    return readySessions(id);
  };
  setProjectDirectory('/projects/site');
  markServerStartedByUs('/projects/site');
  setSessionBusy(true);
  await requestDevServerStop({ manual: true });
  assert.equal(getStopState().pendingStop, true);

  setSessionBusy(false);
  await applySessionSnapshot({ id: 'ses_1', busy: false });

  assert.equal(stopCalls(calls).length, 0, 'the unverifiable check refused the stop');
  assert.equal(getStopState().pendingStop, true, 'the queued request is held for a verifiable retry');
  assert.ok(getServerAnnouncements().some((message) => message.includes('stays pending')));

  sessionsDown = false;
  await handleSessionLifecycle({ phase: 'completed' });

  assert.equal(stopCalls(calls).length, 1, 'the queued stop runs once verification returns');
  assert.equal(getStopState().pendingStop, false);
  assert.ok(getServerAnnouncements().includes('Preview dev server stopped.'));
});

// ---- the service's refusal detail ----

test('a manual stop surfaces the service refusal reason verbatim', async () => {
  resetStopState();
  resetServerAnnouncements();
  stubToast();
  stubStorage();
  const refusal = 'A dev server group from an earlier session is still alive for this directory.';
  stubService((request) =>
    request.path === '/server/status'
      ? { status: 200, body: JSON.stringify({ up: true, port: 5173, pid: 4242 }) }
      : request.path === '/server/stop'
        ? { status: 200, body: JSON.stringify({ ok: false, error: refusal }) }
        : { status: 404, body: '{}' });
  stubWorkspace({});
  setProjectDirectory('/projects/site');
  setStudioConfig(SITE_CONFIG);
  setSessionBusy(false);
  await refreshServerStatus();
  resetServerAnnouncements();

  await clickServerControl();

  assert.deepEqual(
    getServerAnnouncements(),
    [refusal],
    'the actionable service error is announced, not the generic not-recorded line',
  );
});

test('manualStopRefusalMessage passes a status error through', async () => {
  stubService((request) =>
    request.path === '/server/status'
      ? { status: 200, body: JSON.stringify({ up: false, port: null, error: 'Port 5173 is occupied by another process.' }) }
      : { status: 200, body: JSON.stringify({ ok: true, stopped: false }) });

  const message = await manualStopRefusalMessage('/projects/site');

  assert.equal(message, 'Port 5173 is occupied by another process.', 'the service condition is the truthful reason');
});
