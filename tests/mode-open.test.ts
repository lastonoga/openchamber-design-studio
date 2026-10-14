// Design Mode ON must bring up the project's live Chrome window.
//
// The panel bundle runs in a browser frame, so this file installs the same
// minimal shim as panel-open.test.ts and stubs `host.serviceRequest` (and
// `host.toast`) to capture what the panel sends. It imports `panel/main.ts` so
// the real `toggleMode` path is exercised; `main()` no-ops without a host
// `onReady`, so nothing renders and no real Chrome is driven here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

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
const { decideProjectOpen, NEEDS_PROJECT_MESSAGE, NO_PROJECT_URL_MESSAGE, ATTACH_NEEDS_URL } = api;
const { toggleMode, setProjectDirectory, applyState, getModeState, getPendingOpen, loadStudioConfig, loadProjects, getAllProjects, resolveDesignCommand, allowResolve, startNewDesign, setDesignSystem, setSessionId, setSelectedProject, attachProjectReference, attachProjectPath, attachDroppedFiles } = main;
const { designMarkerKey, modeStorageKey } = await import('../panel/mode.ts');

type StartSession = {
  providerId?: string;
  id?: string;
  projectId?: string;
  text?: string;
  navigation?: string;
  data?: unknown;
};

/** Stub `host.startSession` and capture every request. */
function stubStartSession(): StartSession[] {
  const sessions: StartSession[] = [];
  (api.host as unknown as { startSession: (r: StartSession) => Promise<{ sessionId: string; sent: string }> }).startSession = async (request) => {
    sessions.push(request);
    return { sessionId: `s${sessions.length}`, sent: 'sent' };
  };
  (api.host as unknown as { openSession: (id: string) => Promise<void> }).openSession = async () => undefined;
  return sessions;
}

type SnapshotProject = { id: string; name: string; directory: string };

/**
 * Stub `host.listProjects` with a ready snapshot, so target resolution sees the
 * REGISTERED projects (the composer refuses an unregistered directory).
 */
function stubListProjects(projects: SnapshotProject[]): SnapshotProject[] {
  (api.host as unknown as { listProjects: () => Promise<unknown> }).listProjects = async () => ({
    kind: 'projects',
    state: 'ready',
    projects,
  });
  return projects;
}

/** `/config` for a project with no `.design-studio.json` yet. */
const NO_CONFIG_BODY = JSON.stringify({ config: null, path: null });

// `/config` for a project that has a url, as the service answers it.
const CONFIG_BODY = JSON.stringify({
  config: { version: 1, name: 'Site', url: 'http://localhost:5173' },
  path: '/projects/site/.design-studio.json',
});

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

/** In-memory host storage so saveMode/loadMode have somewhere to go. */
function stubStorage(): Map<string, unknown> {
  const store = new Map<string, unknown>();
  (api.host as unknown as { storage: { get: (key: string) => Promise<unknown>; set: (key: string, value: unknown) => Promise<void> } }).storage = {
    get: async (key) => store.get(key),
    set: async (key, value) => {
      store.set(key, value);
    },
  };
  return store;
}

type AttachChip = { providerId?: string; id?: string; title?: string; url?: string; text?: string };

/** Capture every `host.attach` this panel sends. */
function stubAttach(): AttachChip[] {
  const chips: AttachChip[] = [];
  (api.host as unknown as { attach: (r: AttachChip) => Promise<void> }).attach = async (request) => {
    chips.push(request);
  };
  return chips;
}

/**
 * Known starting point: the window is closed. A poll with `windowOpen:false`
 * while the mode is ON flips it OFF (persisted; no session id in tests, so no
 * storage is touched); while OFF it is a no-op. Either way `windowOpen` is false
 * afterward, so an explicit `toggleMode(true)` must open.
 */
async function resetToClosedWindow(): Promise<void> {
  await applyState({ url: '', title: '', lastPick: null, pickSeq: 0, windowOpen: false });
}

test('decideProjectOpen resolves the open target for a project url', () => {
  assert.deepEqual(decideProjectOpen({ url: 'http://localhost:5173' }, '/projects/site'), {
    kind: 'open',
    url: 'http://localhost:5173',
    dir: '/projects/site',
  });
  // A non-loopback URL is opened as-is: no dev-server dir is sent.
  assert.deepEqual(decideProjectOpen({ url: 'https://example.com' }, '/projects/site'), {
    kind: 'open',
    url: 'https://example.com',
  });
  // Without a project dir there is nothing for the service to start.
  assert.deepEqual(decideProjectOpen({ url: 'http://localhost:5173' }, null), {
    kind: 'open',
    url: 'http://localhost:5173',
  });
});

test('decideProjectOpen reports an actionable message without a url', () => {
  assert.deepEqual(decideProjectOpen(null, '/projects/site'), { kind: 'message', message: NO_PROJECT_URL_MESSAGE });
  assert.deepEqual(decideProjectOpen({ type: 'hi-fi' }, '/projects/site'), { kind: 'message', message: NO_PROJECT_URL_MESSAGE });
  assert.deepEqual(decideProjectOpen({ url: '   ' }, '/projects/site'), { kind: 'message', message: NO_PROJECT_URL_MESSAGE });
  assert.match(NO_PROJECT_URL_MESSAGE, /No \.design-studio\.json url/);
});

test('loadStudioConfig reads the config for display but never opens a window', async () => {
  const calls = stubService((request) =>
    request.path === '/config'
      ? { status: 200, body: CONFIG_BODY }
      : { status: 200, body: JSON.stringify({ ok: true, url: 'http://localhost:5173/', title: 'Site', settled: true }) },
  );
  stubToast();
  setProjectDirectory('/projects/site');

  await loadStudioConfig();

  const config = calls.find((call) => call.path === '/config');
  assert.ok(config, 'still reads .design-studio.json');
  assert.equal(
    calls.some((call) => call.path === '/open'),
    false,
    'mounting/reading the config must not open a window',
  );
});

test('the status widget mount no longer carries an auto-open path', async () => {
  const source = await readFile(new URL('../panel/main.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /maybeOpenOnStatusMount/, 'the mount auto-open function is gone');
  assert.doesNotMatch(source, /statusMountOpened/, 'the per-mount auto-open latch is gone');
  assert.doesNotMatch(source, /autoOpened/, 'the config auto-open latch is gone');
});

test('toggleMode(true) reads the config and opens the live window', async () => {
  const calls = stubService((request) => {
    if (request.path === '/config') return { status: 200, body: CONFIG_BODY };
    if (request.path === '/open') {
      return { status: 200, body: JSON.stringify({ ok: true, url: 'http://localhost:5173/', title: 'Site', settled: true }) };
    }
    return { status: 404, body: '{}' };
  });
  stubToast();
  stubStorage(); // the open persists the last URL; no real host here
  setProjectDirectory('/projects/site');

  await resetToClosedWindow();
  await toggleMode(true);

  const config = calls.find((call) => call.path === '/config');
  assert.ok(config, 'reads .design-studio.json for the current project dir');
  assert.deepEqual(config!.query, { dir: '/projects/site' });

  const open = calls.find((call) => call.path === '/open');
  assert.ok(open, 'turning Design Mode ON opens the live window');
  assert.equal(open!.method, 'POST');
  assert.deepEqual(JSON.parse(open!.body ?? ''), { url: 'http://localhost:5173', dir: '/projects/site' });
});

test('toggleMode(true) with the window already open focuses it and never opens a second', async () => {
  const calls = stubService((request) => {
    if (request.path === '/focus') return { status: 200, body: JSON.stringify({ ok: true }) };
    if (request.path === '/open') return { status: 200, body: JSON.stringify({ ok: true, url: 'http://localhost:5173/', title: 'Site', settled: true }) };
    return { status: 404, body: '{}' };
  });
  stubToast();
  setProjectDirectory('/projects/site');

  // The poll reports a live window: a click on an already-ON mode raises it.
  await applyState({ url: 'http://localhost:5173/', title: 'Site', lastPick: null, pickSeq: 0, windowOpen: true });
  await toggleMode(true);

  assert.equal(calls.some((call) => call.path === '/focus'), true, 'an open window is focused');
  assert.equal(calls.some((call) => call.path === '/open'), false, 'no second window is spawned');
});

test('toggleMode(false) never opens a window', async () => {
  const calls = stubService(() => ({ status: 200, body: JSON.stringify({ ok: true }) }));
  stubToast();
  setProjectDirectory('/projects/site');

  await toggleMode(false);

  assert.equal(calls.some((call) => call.path === '/open'), false);
});

test('toggleMode(true) without a url opens nothing and stays silent (the UI no longer offers it)', async () => {
  const calls = stubService((request) =>
    request.path === '/config'
      ? { status: 200, body: JSON.stringify({ config: null, path: null }) }
      : { status: 200, body: JSON.stringify({ ok: true }) },
  );
  const toasts = stubToast();
  stubStorage(); // empty: no persisted last URL to fall back to
  setProjectDirectory('/projects/site');
  // A read makes the project explicitly not ready (config null) before the call.
  await loadStudioConfig();

  await resetToClosedWindow();
  await toggleMode(true);

  assert.equal(calls.some((call) => call.path === '/open'), false, 'no url: nothing opens');
  assert.equal(toasts.length, 0, 'no error toast — there is no control to fail');
});

test('toggleMode(true) with no live config falls back to the persisted last URL', async () => {
  const calls = stubService((request) => {
    if (request.path === '/config') return { status: 200, body: JSON.stringify({ config: null, path: null }) };
    if (request.path === '/open') {
      return { status: 200, body: JSON.stringify({ ok: true, url: 'http://localhost:6000/', title: 'Restored', settled: true }) };
    }
    return { status: 404, body: '{}' };
  });
  stubToast();
  const store = stubStorage();
  // The project's `.design-studio.json` is gone, but its last URL is remembered
  // under the dir-scoped key.
  store.set('lastUrl//projects/site', 'http://localhost:6000');
  setProjectDirectory('/projects/site');

  await resetToClosedWindow();
  await toggleMode(true);

  const open = calls.find((call) => call.path === '/open');
  assert.ok(open, 'ON opens the window from the persisted URL');
  assert.equal(open!.method, 'POST');
  assert.deepEqual(JSON.parse(open!.body ?? ''), { url: 'http://localhost:6000', dir: '/projects/site' });
});

test('a failed open still goes through the open path (error is surfaced, not swallowed)', async () => {
  const calls = stubService((request) => {
    if (request.path === '/config') return { status: 200, body: CONFIG_BODY };
    if (request.path === '/open') {
      return {
        status: 200,
        body: JSON.stringify({
          ok: false,
          error: 'the dev server is not running and .design-studio.json has no "command" to start it',
        }),
      };
    }
    return { status: 404, body: '{}' };
  });
  stubToast();
  setProjectDirectory('/projects/site');

  await resetToClosedWindow();
  await toggleMode(true);

  assert.equal(calls.some((call) => call.path === '/open'), true, 'the open was attempted');
});

test('toggleMode(false) closes the live window via /close and opens nothing', async () => {
  const calls = stubService((request) => {
    if (request.path === '/close') return { status: 200, body: JSON.stringify({ ok: true }) };
    return { status: 404, body: '{}' };
  });
  stubToast();
  stubStorage();
  setProjectDirectory('/projects/site');

  await toggleMode(false);

  const close = calls.find((call) => call.path === '/close');
  assert.ok(close, 'turning Design Mode OFF closes the live window');
  assert.equal(close!.method, 'POST');
  assert.equal(calls.some((call) => call.path === '/open'), false, 'OFF does not open a window');
});

test('a /state poll showing windowOpen:false while Design Mode is ON flips the mode OFF', async () => {
  const calls = stubService((request) => {
    if (request.path === '/config') return { status: 200, body: CONFIG_BODY };
    if (request.path === '/open') {
      return { status: 200, body: JSON.stringify({ ok: true, url: 'http://localhost:5173/', title: 'Site', settled: true }) };
    }
    if (request.path === '/close') return { status: 200, body: JSON.stringify({ ok: true }) };
    return { status: 404, body: '{}' };
  });
  stubToast();
  stubStorage();
  setProjectDirectory('/projects/site');

  await resetToClosedWindow();
  await toggleMode(true);
  assert.equal(getModeState().on, true, 'mode is on after a successful open');

  // The poll sees the open window.
  await applyState({ url: 'http://localhost:5173/', title: 'Site', lastPick: null, pickSeq: 0, windowOpen: true });
  assert.equal(getModeState().on, true, 'a live window keeps the mode on');

  const opensBefore = calls.filter((call) => call.path === '/open').length;
  // The user closes the window by hand; the next poll reports it gone.
  await applyState({ url: '', title: '', lastPick: null, pickSeq: 0, windowOpen: false });

  assert.equal(getModeState().on, false, 'windowOpen:false while ON turns Design Mode OFF');
  assert.equal(
    calls.filter((call) => call.path === '/open').length,
    opensBefore,
    'the close is not answered with an auto-reopen',
  );
});

// A stale `/state` snapshot — windowOpen:false, sampled BEFORE the window is up
// — can land inside the ON transition's awaits (the persist, the marker write).
// The pending-open guard used to be raised only once the open itself started, so
// the snapshot read the just-flipped ON as "the user closed the window" and the
// toggle self-OFFed immediately (reproduced 2/2 in the real-runtime fixture).
// Deterministic here: the mode persist's storage RPC is withheld, parking the
// transition exactly where the stale poll lands.
test('a stale windowOpen:false poll inside the ON transition cannot self-OFF the toggle', async () => {
  const calls = stubService((request) => {
    if (request.path === '/config') return { status: 200, body: CONFIG_BODY };
    if (request.path === '/open') return { status: 200, body: JSON.stringify({ ok: true, url: 'http://localhost:5173/', title: 'Site', settled: true }) };
    return { status: 404, body: '{}' };
  });
  stubToast();
  stubStorage();
  setProjectDirectory('/projects/site');
  setSessionId('ses_stale'); // the mode persist needs a session key to park on
  await resetToClosedWindow();

  // Withhold the FIRST storage write (the mode persist): the ON transition is
  // parked inside `saveMode`, before the marker and before any open.
  const hostStub = api.host as unknown as { storage: { set: (key: string, value: unknown) => Promise<void> } };
  const realSet = hostStub.storage.set;
  let first = true;
  let release!: () => void;
  hostStub.storage.set = (key: string, value: unknown) => {
    if (!first) return realSet(key, value);
    first = false;
    return new Promise<void>((resolve) => {
      release = () => {
        void realSet(key, value);
        resolve();
      };
    });
  };

  const toggling = toggleMode(true);

  // The stale poll arrives while the transition is still awaiting: mode.on is
  // already true, the window is not up yet.
  await applyState({ url: '', title: '', lastPick: null, pickSeq: 0, windowOpen: false });

  assert.equal(getModeState().on, true, 'the stale pre-open snapshot must not flip the ON transition OFF');
  assert.equal(getPendingOpen(), true, 'the pending-open guard spans the whole ON transition');
  assert.equal(calls.some((call) => call.path === '/close'), false, 'the stale snapshot must not close anything either');

  release();
  await toggling;

  assert.equal(getModeState().on, true, 'the ON transition completes normally');
  assert.equal(getPendingOpen(), false, 'the guard is cleaned up after the transition');
  assert.ok(calls.some((call) => call.path === '/open'), 'the open still proceeds (unchanged behaviour)');
  assert.equal(calls.some((call) => call.path === '/close'), false, 'no close on the honourable path either');
});

test('the Design Mode widget has no two-step confirm arm', async () => {
  const source = await readFile(new URL('../panel/main.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /click to confirm/i, 'no "click to confirm" copy remains');
  assert.doesNotMatch(source, /modeOffArm/, 'the confirm-arm state is gone');
});

test('the row toggle is a plain ON/OFF label with no separate live-window action', async () => {
  const source = await readFile(new URL('../panel/main.ts', import.meta.url), 'utf8');
  // The toggle flips the mode on click; its label states ON or OFF.
  assert.match(source, /void toggleMode\(!state\.mode\.on\)/, 'the toggle flips the mode');
  assert.match(source, /Design Mode: ON/);
  assert.match(source, /Design Mode: OFF/);
  // The Focus action is gone with the cockpit.
  assert.doesNotMatch(source, /ds-action/, 'the Focus action is gone');
  assert.doesNotMatch(source, /onWindowAction/, 'the separate Open/Focus dispatcher is gone');
});

// `/design` toggles Design Mode ON/OFF only: empty or "on…" turns it ON, "off"
// turns it OFF. Nothing else opens.
test('/design toggles Design Mode and opens nothing else', async () => {
  const source = await readFile(new URL('../panel/main.ts', import.meta.url), 'utf8');
  const resolverStart = source.indexOf('async function resolveDesignCommand(');
  const startSessionStart = source.indexOf('type DesignSessionSpec =');
  assert.ok(resolverStart > 0 && startSessionStart > resolverStart, 'resolver markers are present');
  const resolver = source.slice(resolverStart, startSessionStart);

  assert.match(resolver, /const parsed = parseDesignArgs\(args\)/);
  assert.match(resolver, /await toggleMode\(false\)/);
  assert.match(resolver, /await toggleMode\(true, parsed\.type, parsed\.brief \|\| undefined\)/);
  assert.match(resolver, /return buildModeChip\(state\.sessionId, state\.mode, state\.config\)/);
  assert.doesNotMatch(resolver, /openCockpit/, 'no popover is opened');
});

// Immediate initialization: `/design <desc>` in a REGISTERED no-config project
// scaffolds it, then starts a session under that project (with its id, so the
// session is listed).
test('/design <desc> in a no-config project scaffolds then starts a session', async () => {
  const calls = stubService((request) => {
    if (request.path === '/config') return { status: 200, body: NO_CONFIG_BODY };
    if (request.path === '/scaffold') return { status: 200, body: JSON.stringify({ ok: true, url: 'http://localhost:5173/', files: ['index.html'] }) };
    return { status: 200, body: JSON.stringify({ ok: true }) };
  });
  const toasts = stubToast();
  stubStorage();
  const sessions = stubStartSession();
  stubListProjects([{ id: 'p1', name: 'Site', directory: '/projects/site' }]);
  setProjectDirectory('/projects/site');
  await loadProjects();
  await loadStudioConfig();
  allowResolve(true);

  const chip = await resolveDesignCommand('hi-fi landing page');

  const scaffold = calls.find((call) => call.path === '/scaffold');
  assert.ok(scaffold, 'the description triggers /scaffold');
  assert.equal(scaffold!.method, 'POST');
  assert.deepEqual(JSON.parse(scaffold!.body ?? ''), {
    dir: '/projects/site',
    type: 'hi-fi',
    direction: 'auto',
    fidelity: 'hi-fi',
    brief: 'landing page',
  });
  assert.equal(sessions.length, 1, 'a session is started for the scaffolded project');
  assert.equal(sessions[0]?.projectId, 'p1', 'the session is registered under the target project');
  assert.match(sessions[0]?.text ?? '', /Design brief/, 'the session carries the design prompt');
  assert.ok(chip === null, 'the command starts a session instead of attaching a chip');
  assert.ok(toasts.some((toast) => toast.kind === 'success' && /http:\/\/localhost:5173\//.test(toast.message)), 'the scaffold URL is toasted');
});

// FIX 1: an UNREGISTERED directory is refused outright — no scaffold, no session,
// the actionable message instead.
test('/design <desc> in an unregistered directory is refused', async () => {
  const calls = stubService((request) => {
    if (request.path === '/config') return { status: 200, body: NO_CONFIG_BODY };
    return { status: 200, body: JSON.stringify({ ok: true }) };
  });
  const toasts = stubToast();
  stubStorage();
  const sessions = stubStartSession();
  stubListProjects([]); // nothing registered
  setProjectDirectory('/projects/site');
  await loadProjects();
  await loadStudioConfig();
  allowResolve(true);

  const chip = await resolveDesignCommand('hi-fi landing page');

  assert.equal(calls.some((call) => call.path === '/scaffold'), false, 'no scaffold runs against an unregistered directory');
  assert.equal(sessions.length, 0, 'no session starts');
  assert.equal(chip, null, 'no chip either');
  assert.ok(toasts.some((toast) => toast.kind === 'error' && toast.message === NEEDS_PROJECT_MESSAGE), 'the refusal says what to do');
});

test('/design <desc> scaffold failure falls back to the agent flow and surfaces the error', async () => {
  const calls = stubService((request) => {
    if (request.path === '/config') return { status: 200, body: NO_CONFIG_BODY };
    if (request.path === '/scaffold') return { status: 200, body: JSON.stringify({ ok: false, error: 'no template for type "xyz"' }) };
    if (request.path === '/open') return { status: 200, body: JSON.stringify({ ok: true }) };
    return { status: 200, body: JSON.stringify({ ok: true }) };
  });
  const toasts = stubToast();
  stubStorage();
  const sessions = stubStartSession();
  stubListProjects([{ id: 'p1', name: 'Site', directory: '/projects/site' }]);
  setProjectDirectory('/projects/site');
  await loadProjects();
  await loadStudioConfig();
  await resetToClosedWindow();
  allowResolve(true);

  const chip = await resolveDesignCommand('hi-fi landing page');

  assert.equal(calls.some((call) => call.path === '/scaffold'), true, 'the scaffold was attempted');
  assert.ok(
    toasts.some((toast) => toast.kind === 'error' && /no template for type/.test(toast.message)),
    'the scaffold error is surfaced, not swallowed',
  );
  assert.equal(sessions.length, 0, 'no session is started for a failed scaffold');
  assert.ok(chip, 'the command still returns a Design Mode chip (the agent-scaffolds fallback)');
});

// The New-design flow scaffolds a REGISTERED no-config project and starts the
// session under it (the session carries the project's id).
test('root workspace: new session preserves selected registered root without isolate PUT', async () => {
  main.setSurface('page');
  main.resetReferenceDraft();
  main.setPrompt('Edit the existing root app.');
  setProjectDirectory('/projects/site/designs/legacy');
  setSelectedProject('p1');
  setSessionId(null);
  stubListProjects([{ id: 'p1', name: 'Site', directory: '/projects/site' }]);
  const calls = stubService((request) => request.path === '/config'
    ? { status: 200, body: CONFIG_BODY }
    : { status: 200, body: JSON.stringify({ ok: true }) });
  stubToast();
  stubStorage();
  (api.host as unknown as { listSessions: () => Promise<unknown> }).listSessions = async () => ({ kind: 'sessions', state: 'ready', sessions: [] });
  (api.host.storage as unknown as { keys: () => Promise<string[]> }).keys = async () => [];
  const sessions = stubStartSession();
  await loadProjects();
  await loadStudioConfig();
  await startNewDesign();
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]?.projectId, 'p1', 'registered root explicitly selected even from a legacy child');
  assert.equal('worktree' in sessions[0]!, false, 'no new worktree is requested');
  assert.ok(calls.some((call) => call.path === '/harness' && JSON.parse(call.body ?? '{}').dir === '/projects/site'), 'root harness remains installed');
  assert.equal(calls.some((call) => call.method === 'PUT'), false, 'no automatic isolation request is written');
  assert.equal(calls.some((call) => call.path === '/scaffold'), false, 'existing configured root is not scaffolded again');
  main.setSurface('status');
  setSelectedProject(null);
});

test('the New design flow scaffolds a no-config project then starts the session', async () => {
  const calls = stubService((request) => {
    if (request.path === '/config') return { status: 200, body: NO_CONFIG_BODY };
    if (request.path === '/scaffold') return { status: 200, body: JSON.stringify({ ok: true, url: 'http://localhost:5173/', files: ['index.html'] }) };
    return { status: 200, body: JSON.stringify({ ok: true }) };
  });
  stubToast();
  stubStorage();
  const sessions = stubStartSession();
  stubListProjects([{ id: 'p1', name: 'Site', directory: '/projects/site' }]);
  setProjectDirectory('/projects/site');
  await loadProjects();
  await loadStudioConfig();

  await startNewDesign();

  const scaffold = calls.find((call) => call.path === '/scaffold');
  assert.ok(scaffold, 'the New design flow scaffolds the project');
  assert.deepEqual(JSON.parse(scaffold!.body ?? ''), {
    dir: '/projects/site',
    type: 'hi-fi',
    direction: 'auto',
    fidelity: 'hi-fi',
    brief: '',
  });
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]?.projectId, 'p1', 'the session is registered under the target project');
});

// The started session carries the mode chip's data, so the snapshot itself marks
// it a design chat — independent of the storage writes that can lose the race
// against the frame teardown.
test('the started session payload carries the design-mode data chip', async () => {
  stubService((request) => {
    if (request.path === '/config') return { status: 200, body: NO_CONFIG_BODY };
    if (request.path === '/scaffold') return { status: 200, body: JSON.stringify({ ok: true, url: 'http://localhost:5173/', files: [] }) };
    return { status: 200, body: JSON.stringify({ ok: true }) };
  });
  stubToast();
  stubStorage();
  const sessions = stubStartSession();
  stubListProjects([{ id: 'p1', name: 'Site', directory: '/projects/site' }]);
  setProjectDirectory('/projects/site');
  await loadProjects();
  await loadStudioConfig();

  await startNewDesign();

  assert.equal(sessions.length, 1);
  const data = sessions[0]?.data as { mode?: { on?: unknown; type?: unknown; brief?: unknown } } | undefined;
  assert.ok(data && typeof data === 'object', 'the payload carries data');
  assert.equal(data.mode?.on, true, 'data.mode.on is the load-bearing bit sessionShowsDesignMode reads');
  assert.equal(data.mode?.type, 'hi-fi');
  assert.equal(data.mode?.brief, '');
});

// The working-directory selector's choice wins even when the frame's directory
// is unregistered — and the flow itself waits for the projects load (no explicit
// loadProjects here), so a fast send is never refused on the loading race.
test('a picked working directory targets that project even from an unregistered frame dir', async () => {
  const calls = stubService((request) => {
    if (request.path === '/config') return { status: 200, body: NO_CONFIG_BODY };
    if (request.path === '/scaffold') return { status: 200, body: JSON.stringify({ ok: true, url: 'http://localhost:5173/', files: [] }) };
    return { status: 200, body: JSON.stringify({ ok: true }) };
  });
  stubToast();
  stubStorage();
  const sessions = stubStartSession();
  stubListProjects([
    { id: 'p1', name: 'Site', directory: '/projects/site' },
    { id: 'p2', name: 'Deck', directory: '/projects/deck' },
  ]);
  setProjectDirectory('/elsewhere/unregistered'); // covered by NO registered project
  setSelectedProject('p2');
  try {
    await startNewDesign();

    assert.equal(sessions.length, 1, 'the session starts for the picked project');
    assert.equal(sessions[0]?.projectId, 'p2', 'the session carries the picked project id');
    const scaffold = calls.find((call) => call.path === '/scaffold');
    assert.ok(scaffold, 'the picked project is scaffolded (it has no config)');
    assert.equal(
      (JSON.parse(scaffold!.body ?? '') as { dir: string }).dir,
      '/projects/deck',
      'the scaffold writes into the PICKED project, never the unregistered frame dir',
    );
  } finally {
    setSelectedProject(null);
  }
});

// FIX 1: with no registered project covering the directory, the page composer
// refuses — no scaffold, no session, the actionable message instead.
test('the New design flow refuses an unregistered directory', async () => {  const calls = stubService((request) => {
    if (request.path === '/config') return { status: 200, body: NO_CONFIG_BODY };
    return { status: 200, body: JSON.stringify({ ok: true }) };
  });
  const toasts = stubToast();
  stubStorage();
  const sessions = stubStartSession();
  stubListProjects([]);
  setProjectDirectory('/projects/site');
  await loadProjects();
  await loadStudioConfig();

  await startNewDesign();

  assert.equal(calls.some((call) => call.path === '/scaffold'), false, 'no scaffold runs against an unregistered directory');
  assert.equal(sessions.length, 0, 'no session starts');
  assert.ok(toasts.some((toast) => toast.kind === 'error' && toast.message === NEEDS_PROJECT_MESSAGE), 'the refusal says what to do');
  assert.equal(getAllProjects().length, 0, 'nothing was registered by the flow');
});

// A chosen design system travels into /scaffold and names itself in the prompt.
test('a chosen design system is sent to /scaffold and named in the session prompt', async () => {
  const calls = stubService((request) => {
    if (request.path === '/config') return { status: 200, body: NO_CONFIG_BODY };
    if (request.path === '/scaffold') return { status: 200, body: JSON.stringify({ ok: true, url: 'http://localhost:5173/', files: [] }) };
    return { status: 200, body: JSON.stringify({ ok: true }) };
  });
  stubToast();
  stubStorage();
  const sessions = stubStartSession();
  stubListProjects([{ id: 'p1', name: 'Site', directory: '/projects/site' }]);
  setProjectDirectory('/projects/site');
  await loadProjects();
  await loadStudioConfig();
  setDesignSystem('apple');
  try {
    await startNewDesign();
  } finally {
    setDesignSystem(null);
  }

  const scaffold = calls.find((call) => call.path === '/scaffold');
  assert.ok(scaffold, 'the scaffold was requested');
  assert.deepEqual(JSON.parse(scaffold!.body ?? ''), {
    dir: '/projects/site',
    type: 'hi-fi',
    direction: 'auto',
    fidelity: 'hi-fi',
    brief: '',
    designSystemId: 'apple',
  });
  assert.match(sessions[0]?.text ?? '', /Design system: Apple \(Media & Consumer\)/, 'the prompt names the chosen system');
});

test('with no design system chosen, /scaffold omits the field', async () => {
  const calls = stubService((request) => {
    if (request.path === '/config') return { status: 200, body: NO_CONFIG_BODY };
    if (request.path === '/scaffold') return { status: 200, body: JSON.stringify({ ok: true, url: 'http://localhost:5173/', files: [] }) };
    return { status: 200, body: JSON.stringify({ ok: true }) };
  });
  stubToast();
  stubStorage();
  stubStartSession();
  stubListProjects([{ id: 'p1', name: 'Site', directory: '/projects/site' }]);
  setProjectDirectory('/projects/site');
  await loadProjects();
  await loadStudioConfig();

  await startNewDesign();

  const scaffold = calls.find((call) => call.path === '/scaffold');
  assert.ok(scaffold, 'the scaffold was requested');
  assert.equal('designSystemId' in JSON.parse(scaffold!.body ?? ''), false, 'no field for the default');
});

// ---- the persistent design marker (FIX B): written once on ON, never cleared ----

test('toggleMode(true) writes the persistent marker exactly on the ON transition', async () => {
  stubService((request) => {
    if (request.path === '/config') return { status: 200, body: CONFIG_BODY };
    if (request.path === '/open') return { status: 200, body: JSON.stringify({ ok: true, url: 'http://localhost:5173/', title: 'Site', settled: true }) };
    if (request.path === '/close') return { status: 200, body: JSON.stringify({ ok: true }) };
    return { status: 404, body: '{}' };
  });
  stubToast();
  const store = stubStorage();
  setProjectDirectory('/projects/site');
  setSessionId('ses_1');

  assert.equal([...store.keys()].filter((key) => key.startsWith('design/')).length, 0, 'no marker before any ON');

  await resetToClosedWindow();
  await toggleMode(true);

  const marker = store.get(designMarkerKey('ses_1')!) as { on?: unknown; at?: unknown } | undefined;
  assert.ok(marker, 'the ON transition writes the marker');
  assert.equal(marker!.on, true);
  assert.equal(typeof marker!.at, 'string', 'the ON moment is recorded');
  assert.match(marker!.at as string, /^\d{4}-\d{2}-\d{2}T/, 'the moment is an ISO timestamp');
  const at = marker!.at;

  // A second ON while the mode is already on is not a transition: no rewrite.
  await toggleMode(true);
  assert.equal((store.get(designMarkerKey('ses_1')!) as { at?: unknown }).at, at, 'a repeat ON never rewrites the marker');
});

test('the design marker is never cleared on OFF or on a window close', async () => {
  stubService((request) => {
    if (request.path === '/config') return { status: 200, body: CONFIG_BODY };
    if (request.path === '/open') return { status: 200, body: JSON.stringify({ ok: true, url: 'http://localhost:5173/', title: 'Site', settled: true }) };
    if (request.path === '/close') return { status: 200, body: JSON.stringify({ ok: true }) };
    return { status: 404, body: '{}' };
  });
  stubToast();
  const store = stubStorage();
  setProjectDirectory('/projects/site');
  setSessionId('ses_2');

  await resetToClosedWindow();
  await toggleMode(true);
  assert.ok(store.has(designMarkerKey('ses_2')!), 'ON writes the marker');

  await toggleMode(false);
  assert.ok(store.has(designMarkerKey('ses_2')!), 'OFF does NOT clear the marker');
  assert.ok(store.has(modeStorageKey('ses_2')!), 'the mode key itself stays (its mere existence is a design signal)');
  assert.equal((store.get(modeStorageKey('ses_2')!) as { on?: unknown }).on, false, 'while the live mode key says off');

  // A window close while the mode is ON flips it off too; the marker still stays.
  await toggleMode(true);
  await applyState({ url: 'http://localhost:5173/', title: 'Site', lastPick: null, pickSeq: 0, windowOpen: true });
  await applyState({ url: '', title: '', lastPick: null, pickSeq: 0, windowOpen: false });
  assert.equal(getModeState().on, false, 'the window close turns the mode off');
  assert.ok(store.has(designMarkerKey('ses_2')!), 'the marker survives the window close');
});

test('a newly started design session is marked permanently from birth', async () => {
  stubService((request) => {
    if (request.path === '/config') return { status: 200, body: NO_CONFIG_BODY };
    if (request.path === '/scaffold') return { status: 200, body: JSON.stringify({ ok: true, url: 'http://localhost:5173/', files: [] }) };
    return { status: 200, body: JSON.stringify({ ok: true }) };
  });
  stubToast();
  const store = stubStorage();
  stubStartSession();
  stubListProjects([{ id: 'p1', name: 'Site', directory: '/projects/site' }]);
  setProjectDirectory('/projects/site');
  await loadProjects();
  await loadStudioConfig();

  await startNewDesign();

  assert.ok(store.has(designMarkerKey('s1')!), 'the new session carries a design marker');
});

// ---- the `+` attach sources (FIX 3): the chips they send ----

test('attachProjectReference attaches the project chip', async () => {
  main.setSurface?.('status');
  stubService((request) => (request.path === '/config' ? { status: 200, body: CONFIG_BODY } : { status: 200, body: JSON.stringify({ ok: true }) }));
  stubToast();
  stubStorage();
  const chips = stubAttach();
  stubListProjects([{ id: 'p1', name: 'Site', directory: '/projects/site' }]);
  setProjectDirectory('/projects/site');
  await loadProjects();
  await loadStudioConfig();

  await attachProjectReference();

  assert.equal(chips.length, 1, 'one project chip is attached');
  assert.deepEqual(chips[0], {
    providerId: 'design-studio',
    // The registered project id (p1) is preferred over the dir basename now that
    // the flow knows the registered project.
    id: 'project-p1',
    title: 'Site',
    url: 'http://localhost:5173',
    text: 'Project reference: /projects/site',
  });
});

// FIX 3: a pasted path builds the file chip from the path alone — basename id
// and title, the project url, a `File reference:` text.
test('a pasted path attaches the file chip referenced under the project url', async () => {
  main.setSurface?.('status');
  stubService((request) => (request.path === '/config' ? { status: 200, body: CONFIG_BODY } : { status: 200, body: JSON.stringify({ ok: true }) }));
  stubToast();
  stubStorage();
  const chips = stubAttach();
  stubListProjects([{ id: 'p1', name: 'Site', directory: '/projects/site' }]);
  setProjectDirectory('/projects/site');
  setSessionId(null);
  await loadProjects();
  await loadStudioConfig();

  await attachProjectPath('src/app.ts');

  assert.equal(chips.length, 1, 'one file chip is attached');
  assert.deepEqual(chips[0], {
    providerId: 'design-studio',
    id: 'file-app.ts',
    title: 'app.ts',
    url: 'http://localhost:5173',
    text: 'File reference: src/app.ts',
  });
});

// FIX 3: a DROPPED file (the guest frame gets no path — only the File's name)
// references by name, and several dropped files become several chips.
test('a dropped file asks for an accessible pasted path, without creating filename chips', async () => {
  stubService((request) => (request.path === '/config' ? { status: 200, body: CONFIG_BODY } : { status: 200, body: JSON.stringify({ ok: true }) }));
  const toasts = stubToast();
  stubStorage();
  const chips = stubAttach();
  stubListProjects([{ id: 'p1', name: 'Site', directory: '/projects/site' }]);
  setProjectDirectory('/projects/site');
  setSessionId(null);
  await loadProjects();
  await loadStudioConfig();

  const file = (name: string) => ({ name }) as File;
  await attachDroppedFiles({ dataTransfer: { files: [file('hero.png'), file('index.html')] } } as unknown as DragEvent);

  assert.equal(chips.length, 0, 'File.name is not an accessible path');
  assert.ok(toasts.some((toast) => /paste.*path/i.test(toast.message)), 'the drop explains the keyboard alternative');
});

test('the attach sources refuse with the http(s) explanation when the project has no url', async () => {
  main.setSurface?.('status');
  stubService((request) =>
    request.path === '/config'
      ? { status: 200, body: JSON.stringify({ config: { version: 1, name: 'Site' }, path: null }) }
      : { status: 200, body: JSON.stringify({ ok: true }) },
  );
  const toasts = stubToast();
  stubStorage();
  const chips = stubAttach();
  stubListProjects([{ id: 'p1', name: 'Site', directory: '/projects/site' }]);
  setProjectDirectory('/projects/site');
  setSessionId(null);
  await loadProjects();
  await loadStudioConfig();

  await attachProjectReference();
  await attachProjectPath('src/app.ts');
  await attachDroppedFiles({ dataTransfer: { files: [{ name: 'a.png' } as File] } } as unknown as DragEvent);

  assert.equal(chips.length, 0, 'a chip is never sent without an http(s) url — the host would reject it');
  assert.equal(toasts.length, 3, 'each source gives feedback');
  for (const toast of toasts.slice(0, 2)) assert.equal(toast.message, ATTACH_NEEDS_URL);
  assert.match(toasts[2]!.message, /paste.*path/i);
  assert.match(ATTACH_NEEDS_URL, /http\(s\)/);
});

test('a drop with no files is a no-op', async () => {
  stubService((request) => (request.path === '/config' ? { status: 200, body: CONFIG_BODY } : { status: 200, body: JSON.stringify({ ok: true }) }));
  const toasts = stubToast();
  stubStorage();
  const chips = stubAttach();
  stubListProjects([{ id: 'p1', name: 'Site', directory: '/projects/site' }]);
  setProjectDirectory('/projects/site');
  setSessionId(null);
  await loadProjects();
  await loadStudioConfig();

  await attachDroppedFiles({ dataTransfer: { files: [] } } as unknown as DragEvent);

  assert.equal(chips.length, 0, 'no chips for an empty drop');
  assert.equal(toasts.length, 0, 'and no noise about it');
});

// Local Studio draft regressions: the service is mocked, not the reference logic
// or the real startNewDesign flow. These checks deliberately fault host delivery.
async function referencePage(noUrl = false): Promise<{ chips: AttachChip[]; toasts: Toast[] }> {
  main.setSurface?.('page');
  main.resetReferenceDraft?.();
  main.setPrompt?.('Use these files to design the settings screen.');
  setSelectedProject(null);
  setProjectDirectory('/projects/site');
  setSessionId(null);
  stubListProjects([
    { id: 'p1', name: 'Site', directory: '/projects/site' },
    { id: 'p2', name: 'Deck', directory: '/projects/deck' },
  ]);
  stubService((request) => {
    if (request.path === '/config') return { status: 200, body: noUrl ? JSON.stringify({ config: { name: 'Site' }, path: null }) : CONFIG_BODY };
    const body = JSON.parse(request.body || '{}') as { path?: string; dir?: string };
    return { status: 200, body: JSON.stringify({ ok: true, path: body.path?.startsWith('/') ? body.path : `${body.dir}/${body.path}`, sourceDirectory: body.dir }) };
  });
  const toasts = stubToast();
  stubStorage();
  const chips = stubAttach();
  await loadProjects();
  await loadStudioConfig();
  return { chips, toasts };
}

test('Studio stages validated paths without preview URL or host composer attachment', async () => {
  const { chips } = await referencePage(true);
  await attachProjectPath('src/app.ts');
  assert.equal(chips.length, 0, 'page references must not leak into the original host composer');
  assert.deepEqual(main.getPageDraft().references.map((ref) => ref.path), ['/projects/site/src/app.ts']);
});

test('Studio removes only the chosen full-path reference and delivers retained source after target changes', async () => {
  await referencePage();
  await attachProjectPath('src/app.ts');
  await attachProjectPath('examples/app.ts');
  const first = main.getPageDraft().references[0]!;
  main.removePageReference(first.id);
  setSelectedProject('p2');
  const sessions = stubStartSession();
  await startNewDesign();
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]!.projectId, 'p2');
  assert.match(sessions[0]!.text!, /\/projects\/site\/examples\/app\.ts/);
  assert.doesNotMatch(sessions[0]!.text!, /\/projects\/site\/src\/app\.ts/);
  assert.match(JSON.stringify(sessions[0]!.data), /\/projects\/site\/examples\/app\.ts/);
  assert.equal(sessions[0]!.navigation, 'preserve');
  assert.equal(main.getPageDraft().references.length, 0, 'only a confirmed send clears refs');
  setSelectedProject(null);
});

test('a session id with failed or no-model sending must not navigate, mark success, or clear the draft', async () => {
  for (const sent of ['failed', 'no-model']) {
    const { toasts } = await referencePage();
    await attachProjectPath('src/app.ts');
    const opens: string[] = [];
    (api.host as unknown as { openSession: (id: string) => Promise<void> }).openSession = async (id) => { opens.push(id); };
    (api.host as unknown as { startSession: (request: StartSession) => Promise<unknown> }).startSession = async () => ({ sessionId: 'created-but-unsent', sent });
    await startNewDesign();
    assert.equal(toasts.some((toast) => toast.kind === 'success' && /session started/i.test(toast.message)), false, 'a created session is not proof the brief was sent');
    assert.deepEqual(opens, []);
    assert.equal(main.getPageDraft().prompt, 'Use these files to design the settings screen.');
    assert.equal(main.getPageDraft().references.length, 1);
    assert.match(main.getPageDraft().error, sent === 'no-model' ? /model/i : /not sent|failed/i);
  }
});

test('repeated send during a delayed target refresh starts only one session', async () => {
  await referencePage();
  const sessions = stubStartSession();
  setSelectedProject('unknown');
  const releases: Array<(snapshot: unknown) => void> = [];
  (api.host as unknown as { listProjects: () => Promise<unknown> }).listProjects = () => new Promise((resolve) => { releases.push(resolve); });
  const first = startNewDesign();
  const second = startNewDesign();
  for (const release of releases) release({ kind: 'projects', state: 'ready', projects: [{ id: 'p1', name: 'Site', directory: '/projects/site' }] });
  await Promise.all([first, second]);
  assert.equal(sessions.length, 1);
  setSelectedProject(null);
});

test('validation failure keeps the pasted path and a late validation cannot mutate a reset draft', async () => {
  const { chips } = await referencePage();
  stubService(() => ({ status: 400, body: JSON.stringify({ error: 'File not found. Paste an accessible file path.' }) }));
  await attachProjectPath('missing.ts');
  assert.equal(main.getPageDraft().path, 'missing.ts');
  assert.match(main.getPageDraft().referenceError, /File not found/);
  assert.equal(main.getPageDraft().references.length, 0);
  let release!: (result: StubResult) => void;
  (api.host as unknown as { serviceRequest: (r: ServiceRequest) => Promise<StubResult> }).serviceRequest = () => new Promise((resolve) => { release = resolve; });
  const pending = attachProjectPath('src/app.ts');
  main.resetReferenceDraft();
  release({ status: 200, body: JSON.stringify({ path: '/projects/site/src/app.ts', sourceDirectory: '/projects/site' }) });
  await pending;
  assert.equal(main.getPageDraft().references.length, 0);
  assert.equal(chips.length, 0);
});
