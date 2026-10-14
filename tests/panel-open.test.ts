// Panel API + pure helpers. The panel bundle runs in a browser frame; the SDK's
// `connectHost()` needs a `window`, so this file installs a minimal shim before
// importing `panel/api.ts` and stubs `host.serviceRequest` to capture the exact
// request the panel sends. Panel DOM code is not unit-tested beyond the few
// pure helpers, matching the rest of the repo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { DesignChatRow, DesignChatsView, ProjectRow, ProjectsView } from '../panel/api.ts';

type ServiceRequest = { method: string; path: string; query?: Record<string, string>; body?: string };

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
const { NO_DESIGN_WORK_MESSAGE, DESIGN_READY_BADGE, NEEDS_PROJECT_MESSAGE, NO_CONFIG_BADGE, PANEL_SIDEBAR_HINT, allProjectsFromSnapshot, designChatLabel, designChatMeta, designChatRows, designWorkRows, isModeChipData, isDesignWorkspaceDir, modeSessionIdFromKey, pathContains, projectMeta, resolveDesignTarget, sessionShowsDesignMode, NO_PROJECT_CONFIG_MESSAGE, PICK_HINT, designSessionStatus, formatOpenStatus, formatWindowStatus, openLive, closeLive, getState, focusLive, pickHintActive, projectReady, projectRows, referenceText, ServiceUnavailable, startDevServer, contrastRatio, tokenNameFor } = api;
const { loadStudioConfig, setProjectDirectory, surfaceKind, nextOverlayState } = main;
const { modeStorageKey } = await import('../panel/mode.ts');
const { harnessPluginSource } = await import('../service/harness-plugin.ts');

type StubResult = { status: number; body: string };

function stubService(handler: (request: ServiceRequest) => StubResult): ServiceRequest[] {
  const calls: ServiceRequest[] = [];
  (api.host as unknown as { serviceRequest: (r: ServiceRequest) => Promise<StubResult> }).serviceRequest = async (request) => {
    calls.push(request);
    return handler(request);
  };
  return calls;
}

test('openLive posts the url to /open and returns the window result', async () => {
  const calls = stubService(() => ({
    status: 200,
    body: JSON.stringify({ ok: true, url: 'http://localhost:5173/', title: 'App', settled: true }),
  }));

  const result = await openLive('http://localhost:5173');

  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.method, 'POST');
  assert.equal(calls[0]!.path, '/open');
  assert.deepEqual(JSON.parse(calls[0]!.body ?? ''), { url: 'http://localhost:5173' });
  assert.deepEqual(result, { ok: true, url: 'http://localhost:5173/', title: 'App', settled: true });
});

test('openLive sends the project dir alongside the url when given', async () => {
  const calls = stubService(() => ({
    status: 200,
    body: JSON.stringify({ ok: true, url: 'http://localhost:5173/', title: 'App', settled: true, started: true }),
  }));

  const result = await openLive('http://localhost:5173', '/projects/site');

  assert.deepEqual(JSON.parse(calls[0]!.body ?? ''), { url: 'http://localhost:5173', dir: '/projects/site' });
  assert.equal(result.started, true);
});

test('getState reads /state and focusLive posts /focus', async () => {
  const stateBody = { url: 'http://localhost:5173/', title: 'App', lastPick: null, pickSeq: 0, windowOpen: true };
  const calls = stubService((request) =>
    request.path === '/state' ? { status: 200, body: JSON.stringify(stateBody) } : { status: 200, body: JSON.stringify({ ok: true }) },
  );

  const state = await getState();
  assert.deepEqual(state, stateBody);

  const focus = await focusLive();
  assert.deepEqual(focus, { ok: true });
  assert.deepEqual(
    calls.map((call) => call.path),
    ['/state', '/focus'],
  );
  assert.equal(calls[1]!.method, 'POST');
});

test('pickHintActive is active only while the window is open', () => {
  assert.equal(pickHintActive({ windowOpen: true }), true);
  assert.equal(pickHintActive({ windowOpen: false }), false);
  assert.match(PICK_HINT, /^⌘-click an element to add a reference$/);
});

// The row is the ambient mirror: the Design Mode toggle, the session status
// line and the ⌘-click hint — with no brief disclosure, Config or cockpit
// and no Focus action.
test('the status row is two controls, status line and hint, with no brief or Config', async () => {
  const source = await readFile(new URL('../panel/main.ts', import.meta.url), 'utf8');

  const statusFormStart = source.indexOf('function renderModeUi(');
  const buildRowStart = source.indexOf('function buildRow(');
  const buildPageStart = source.indexOf('function buildPage(');
  assert.ok(
    statusFormStart > 0 && buildRowStart > statusFormStart && buildPageStart > buildRowStart,
    'source markers are present',
  );
  const statusForm = source.slice(statusFormStart, buildRowStart);
  const row = source.slice(buildRowStart, buildPageStart);

  // No title, no live-state text, no status dot anywhere.
  assert.doesNotMatch(source, /ds-rotitle/, 'the "Design Studio" title is gone');
  assert.doesNotMatch(source, /ds-live/, 'the live-window state text is gone');
  assert.doesNotMatch(source, /ds-dot/, 'the status dot is gone');

  // The bar is exactly TWO controls: the preview-server Start/Stop icon button
  // and the Design Mode toggle — no "Stop preview" text button, no cockpit, no
  // Focus.
  assert.match(row, /serverBtn = q<HTMLButtonElement>\('button', 'ds-server-control'\)/);
  assert.match(row, /modeToggleBtn = q<HTMLButtonElement>\('button', 'primary'\)/);
  assert.match(row, /bar\.append\(serverBtn, modeToggleBtn\)/);
  assert.doesNotMatch(row, /ds-more|ds-miniform|ds-brief/, 'no compact brief or selectors');
  assert.doesNotMatch(row, /stopPreview/, 'the Stop preview text button is gone');
  assert.doesNotMatch(source, /stopPreviewManually/, 'the removed manual-stop export is gone');
  assert.doesNotMatch(source, /Open cockpit/, 'the cockpit trigger is gone');
  assert.doesNotMatch(source, /ds-action/, 'the Focus action is gone');

  // The old raw-JSON Config overlay is gone, and nothing writes the config.
  assert.doesNotMatch(source, /function configOverlay\(/, 'the Config overlay is removed');
  assert.doesNotMatch(source, /ds-config-btn/, 'no Config button anywhere');
  assert.doesNotMatch(statusForm, /ds-config-btn/, 'Config left the disclosure too');
  assert.doesNotMatch(source, /putConfig/, 'the panel never writes the config');
});

test('surfaceKind maps popover to nothing', () => {
  assert.equal(surfaceKind('popover'), 'none');
});

// The projects snapshot's own loading/error states and the per-project config
// reads decide the list; a failed read must never hide the row. Pure, so the
// wizard and the full-screen page share one rule.
test('projectRows maps the snapshot state and every project row', () => {
  const projects = [
    { id: 'p1', name: 'Site', directory: '/p/site' },
    { id: 'p2', name: 'Deck', directory: '/p/deck' },
  ];
  const configs = {
    '/p/site': { config: { version: 1, name: 'Site', type: 'hi-fi', url: 'http://localhost:5173' }, error: null },
    '/p/deck': { config: null, error: 'service down' },
  };

  const view = projectRows({ state: 'ready', projects }, configs);
  assert.ok(view.kind === 'list', 'ready with projects is a list');
  assert.equal(view.rows.length, 2);
  assert.equal(view.rows[0]!.config?.url, 'http://localhost:5173', 'a readable config marks the project Design ready');
  assert.equal(view.rows[1]!.config, null);
  assert.equal(view.rows[1]!.configError, 'service down', 'a failed read is kept, not swallowed');
});

test('a project with a config is listed as a design project', () => {
  const projects = [
    { id: 'p1', name: 'Site', directory: '/p/site' },
    { id: 'p2', name: 'Deck', directory: '/p/deck' },
  ];
  const configs = {
    '/p/site': { config: { version: 1, name: 'Site', type: 'hi-fi', url: 'http://localhost:5173' }, error: null },
    '/p/deck': { config: { version: 1, name: 'Deck', type: 'deck' }, error: null },
  };

  const view = projectRows({ state: 'ready', projects }, configs);
  assert.ok(view.kind === 'list', 'ready with design-file projects is a list');
  assert.equal(view.rows.length, 2);
  assert.equal(view.rows[0]!.config?.url, 'http://localhost:5173', 'a readable config marks the project Design ready');
  assert.equal(view.rows[1]!.config?.type, 'deck', 'a config without a url is still a design project');
});

test('a project whose config read succeeded with no config is excluded', () => {
  const view = projectRows(
    { state: 'ready', projects: [{ id: 'p1', name: 'Site', directory: '/p/site' }] },
    { '/p/site': { config: null, error: null } },
  );
  assert.equal(view.kind, 'empty', 'a genuine "no design file here" drops the project');
});

test('a project whose config read failed stays listed with a warning', () => {
  const view = projectRows(
    { state: 'ready', projects: [{ id: 'p1', name: 'Site', directory: '/p/site' }] },
    { '/p/site': { config: null, error: 'service down' } },
  );
  assert.ok(view.kind === 'list', 'a failed read keeps the row, it is not dropped');
  assert.equal(view.rows.length, 1);
  assert.equal(view.rows[0]!.config, null);
  assert.equal(view.rows[0]!.configError, 'service down', 'a failed read is kept, not swallowed');
});

test('projectRows drops only the projects with no design file', () => {
  const view = projectRows(
    {
      state: 'ready',
      projects: [
        { id: 'p1', name: 'Site', directory: '/p/site' },
        { id: 'p2', name: 'Deck', directory: '/p/deck' },
        { id: 'p3', name: 'Lib', directory: '/p/lib' },
      ],
    },
    {
      '/p/site': { config: { version: 1, type: 'hi-fi', url: 'http://localhost:5173' }, error: null },
      '/p/deck': { config: null, error: null },
      '/p/lib': { config: null, error: 'service down' },
    },
  );
  assert.ok(view.kind === 'list', 'the design-file and errored projects survive');
  assert.deepEqual(view.rows.map((row) => row.id), ['p1', 'p3'], 'only the design-file projects remain');
});

test('only a ready snapshot with no projects shows the empty state', () => {
  assert.equal(projectRows({ state: 'ready', projects: [] }).kind, 'empty');
  assert.equal(projectRows({ state: 'loading', projects: [] }).kind, 'loading', 'a loading snapshot is not "no projects"');
  assert.equal(projectRows({ state: 'error', projects: [] }).kind, 'error', 'an error snapshot is not "no projects"');
});

test('projectRows handles the loading and error snapshot states', () => {
  assert.deepEqual(projectRows({ state: 'loading', projects: [{ id: 'p1', name: 'Site', directory: '/p/site' }] }), { kind: 'loading' });
  const failed = projectRows({ state: 'error', projects: [] });
  assert.ok(failed.kind === 'error');
  assert.match(failed.message, /\S/, 'an error carries a message');
});

// ---- design projects & design chats ----

test('modeSessionIdFromKey is the inverse of modeStorageKey', () => {
  assert.equal(modeSessionIdFromKey(modeStorageKey('ses_1')!), 'ses_1');
  assert.equal(modeSessionIdFromKey(modeStorageKey('a/b')!), 'a/b', 'the id keeps its own slashes');
  assert.equal(modeSessionIdFromKey('lastUrl//projects/site'), null, 'only mode/ keys name a session');
  assert.equal(modeSessionIdFromKey('mode/'), null, 'a bare prefix names nothing');
});

test('designChatLabel uses the session title, else a short id', () => {
  assert.equal(designChatLabel({ id: 'abcdef123456', title: 'Luxury property' }), 'Luxury property');
  assert.equal(designChatLabel({ id: 'abcdef123456', title: '   ' }), 'abcdef12', 'a blank title falls back to the id');
  assert.equal(designChatLabel({ id: 'abcdef123456' }), 'abcdef12');
});

test('projectMeta shows type and url, or the directory without a config', () => {
  assert.equal(
    projectMeta({ id: 'p', name: 'Site', directory: '/p/site', config: { type: 'hi-fi', url: 'http://localhost:5173' }, configError: null }),
    'hi-fi · http://localhost:5173',
  );
  assert.equal(
    projectMeta({ id: 'p', name: 'Site', directory: '/p/site', config: { type: 'deck' }, configError: null }),
    'deck',
    'a config with no url keeps its type',
  );
  assert.equal(
    projectMeta({ id: 'p', name: 'Site', directory: '/p/site', config: null, configError: 'service down' }),
    '/p/site',
    'no config falls back to the directory',
  );
});

function snapshot(state: 'ready' | 'loading' | 'error', sessions: unknown[]): { kind: 'sessions'; projectId: string; state: string; coverage: never[]; sessions: unknown[] } {
  return { kind: 'sessions', projectId: 'p1', state, coverage: [], sessions };
}

function session(id: string, title: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    title,
    projectId: 'p1',
    directory: '/projects/one',
    parentId: null,
    createdAt: 0,
    updatedAt: 0,
    archivedAt: null,
    worktree: null,
    activity: 'idle',
    outcome: null,
    items: [],
    ...extra,
  };
}

test('designChatRows keeps only the ON sessions and labels them', () => {
  const view = designChatRows(
    [{ projectId: 'p1', projectName: 'Site', snapshot: snapshot('ready', [session('s1', 'Luxury property'), session('s2', '')]) }] as never,
    new Set(['s2']),
  );
  assert.ok(view.kind === 'list', 'a ready snapshot with an ON session is a list');
  assert.equal(view.rows.length, 1, 'the OFF session is filtered out');
  assert.equal(view.rows[0]!.sessionId, 's2');
  assert.equal(view.rows[0]!.projectId, 'p1');
  assert.equal(view.rows[0]!.projectName, 'Site');
  assert.equal(view.rows[0]!.title, 's2', 'a blank title falls back to the short id');
});

test('designChatRows skips archived sessions', () => {
  const view = designChatRows(
    [{ projectId: 'p1', projectName: 'Site', snapshot: snapshot('ready', [session('s1', 'Old', { archivedAt: 123 })]) }] as never,
    new Set(['s1']),
  );
  assert.equal(view.kind, 'empty', 'an archived ON session is not a live design chat');
});

test('designChatRows honours the snapshot states', () => {
  assert.equal(designChatRows([], new Set()).kind, 'empty', 'no projects is the true empty state');
  assert.equal(
    designChatRows([{ projectId: 'p1', projectName: 'Site', snapshot: snapshot('loading', []) }] as never, new Set()).kind,
    'loading',
  );
  const failed = designChatRows([{ projectId: 'p1', projectName: 'Site', snapshot: snapshot('error', []) }] as never, new Set());
  assert.ok(failed.kind === 'error', 'an errored snapshot with no surviving row is an error');
  assert.match(failed.message, /Site/);
});

test('a failed sessions read never hides the rows another project contributes', () => {
  const view = designChatRows(
    [
      { projectId: 'p1', projectName: 'One', snapshot: snapshot('error', []) },
      { projectId: 'p2', projectName: 'Two', snapshot: snapshot('ready', [session('s9', 'Kept')]) },
    ] as never,
    new Set(['s9']),
  );
  assert.ok(view.kind === 'list', 'the readable project still lists its row');
  assert.equal(view.rows.length, 1);
  assert.equal(view.rows[0]!.sessionId, 's9');
});

test('designChatRows is empty for a ready snapshot with no ON session', () => {
  const view = designChatRows([{ projectId: 'p1', projectName: 'Site', snapshot: snapshot('ready', [session('s1', 'Off')]) }] as never, new Set());
  assert.equal(view.kind, 'empty');
});

// FIX 3: detection is the session snapshot's own mode chip (items[].data.mode.on),
// with the per-device storage key only a fallback.
test('a session whose snapshot carries a mode chip is a design chat without any storage key', () => {
  const withChip = session('s1', 'Luxury property', { items: [{ id: 'design-mode-s1', data: { mode: { on: true, type: 'hi-fi' } } }] });
  const view = designChatRows(
    [{ projectId: 'p1', projectName: 'Site', snapshot: snapshot('ready', [withChip]) }] as never,
    new Set(),
  );
  assert.ok(view.kind === 'list', 'the mode chip alone marks the chat');
  assert.equal(view.rows.length, 1);
  assert.equal(view.rows[0]!.sessionId, 's1');
});

test('a session with neither a chip nor a storage key is not a design chat', () => {
  const plain = session('s2', 'Plain chat');
  const view = designChatRows(
    [{ projectId: 'p1', projectName: 'Site', snapshot: snapshot('ready', [plain]) }] as never,
    new Set(),
  );
  assert.equal(view.kind, 'empty', 'no evidence at all means no chat row');
});

test('the mode chip data boundary is read loosely and safely', () => {
  assert.equal(isModeChipData({ mode: { on: true } }), true);
  assert.equal(isModeChipData({ mode: { on: true, type: 'deck', brief: 'x' } }), true, 'extra mode fields do not matter');
  assert.equal(isModeChipData({ mode: { on: false } }), false);
  assert.equal(isModeChipData({ mode: null }), false);
  assert.equal(isModeChipData({ project: { name: 'Site' } }), false);
  assert.equal(isModeChipData({}), false);
  assert.equal(isModeChipData(null), false);
  assert.equal(isModeChipData('mode/on'), false, 'a bare string is not chip data');
  assert.equal(sessionShowsDesignMode({ items: [{ id: 'x', data: { mode: { on: true } } }] }), true);
  assert.equal(sessionShowsDesignMode({ items: [{ id: 'x' }] }), false);
  assert.equal(sessionShowsDesignMode({ items: [] }), false);
});

// FIX 3: chats are listed even when their project has NO `.design-studio.json`;
// the projects list stays config-filtered, the merged list still shows the chats.
test('design chats are listed without a project config', () => {
  const projects = [{ id: 'p1', name: 'No config', directory: '/p/plain' }];
  // The project has no design file, so it drops from the projects list…
  const projectsView = projectRows({ state: 'ready', projects }, { '/p/plain': { config: null, error: null } });
  assert.equal(projectsView.kind, 'empty', 'a config-less project is not a design project');
  // …but the chats scan still spans it (with its directory, for target resolution).
  assert.deepEqual(allProjectsFromSnapshot({ state: 'ready', projects }), [
    { id: 'p1', name: 'No config', directory: '/p/plain' },
  ]);
  assert.deepEqual(allProjectsFromSnapshot({ state: 'loading', projects }), [], 'a loading snapshot spans nothing yet');
  const chatsView = designChatRows(
    [
      {
        projectId: 'p1',
        projectName: 'No config',
        snapshot: snapshot('ready', [session('s1', 'Design chat', { items: [{ id: 'c', data: { mode: { on: true } } }] })]),
      },
    ] as never,
    new Set(),
  );
  const merged = designWorkRows(projectsView, chatsView);
  assert.ok(merged.kind === 'list', 'the merged list survives with chats alone');
  assert.equal(merged.rows.length, 1);
  assert.equal(merged.rows[0]!.kind, 'chat');
});

test('the chats scan spans every project, not just the config-filtered ones', async () => {
  const text = await readFile(new URL('../panel/main.ts', import.meta.url), 'utf8');
  assert.match(text, /allProjects = allProjectsFromSnapshot\(snapshot\)/, 'loadProjects records every project');
  assert.match(text, /chatProjects = allProjects;/, 'the chats scan uses every project');
  assert.doesNotMatch(text, /chatProjects = rows\.map/, 'chats no longer follow the config-filtered rows');
});

// FIX B: the persistent design marker is the third signal — a session whose mode
// was turned ON once stays a design chat even when the live mode key says off and
// the snapshot carries no chip, so it still appears in the merged design-work list.
test('a session with a persistent marker is a design chat and appears in designWorkRows', () => {
  const plain = session('s5', 'Finished design chat');
  const withoutMarker = designChatRows(
    [{ projectId: 'p1', projectName: 'Site', snapshot: snapshot('ready', [plain]) }] as never,
    new Set(),
    new Set(),
  );
  assert.equal(withoutMarker.kind, 'empty', 'no signal at all is not a design chat');

  const chats = designChatRows(
    [{ projectId: 'p1', projectName: 'Site', snapshot: snapshot('ready', [plain]) }] as never,
    new Set(),
    new Set(['s5']),
  );
  assert.ok(chats.kind === 'list', 'the marker alone marks the chat');
  const merged = designWorkRows({ kind: 'empty' }, chats);
  assert.ok(merged.kind === 'list');
  assert.equal(merged.rows.length, 1);
  assert.equal(merged.rows[0]!.kind, 'chat');
  assert.equal(merged.rows[0]!.kind === 'chat' ? merged.rows[0]!.chat.sessionId : null, 's5');
});

// FIX: the mere EXISTENCE of a `mode/<id>` key marks a session as used for
// design, whatever its `on` value. It exists for history that predates the
// persistent marker, so an existing design chat turned OFF is still listed.
test('a session whose mode key exists but says OFF is a design chat', () => {
  const turnedOff = session('s6', 'Turned off');
  const withoutKey = designChatRows(
    [{ projectId: 'p1', projectName: 'Site', snapshot: snapshot('ready', [turnedOff]) }] as never,
    new Set(),
    new Set(),
    new Set(),
  );
  assert.equal(withoutKey.kind, 'empty', 'no mode key, no marker, no chip: not a design chat');

  const chats = designChatRows(
    [{ projectId: 'p1', projectName: 'Site', snapshot: snapshot('ready', [turnedOff]) }] as never,
    new Set(),
    new Set(),
    new Set(['s6']),
  );
  assert.ok(chats.kind === 'list', 'the mode key existence alone marks the chat');
  assert.equal(chats.rows.length, 1);
  assert.equal(chats.rows[0]!.sessionId, 's6');
});

// The panel assembles the "ever had a mode entry" set without ever reading the
// stored value: mere key presence is the signal, so `{on:false}` counts too.
test('the chats scan treats a mere mode key as a design signal', async () => {
  const text = await readFile(new URL('../panel/main.ts', import.meta.url), 'utf8');
  assert.match(text, /async function readDesignModeKeySessionIds\(/, 'a key-existence reader exists');
  assert.match(text, /chatModeKeyIds = await readDesignModeKeySessionIds\(\)/, 'it is wired into the chats scan');
  assert.match(text, /designChatRows\(listings, chatOnIds, chatMarkerIds, chatModeKeyIds\)/, 'the set reaches the pure rule');
  const body = text.slice(
    text.indexOf('async function readDesignModeKeySessionIds('),
    text.indexOf('async function loadDesignChats('),
  );
  assert.match(body, /modeSessionIdFromKey\(key\)/, 'it parses the mode/ keys');
  assert.doesNotMatch(body, /storage\.get/, 'existence alone — the value is never read');
});

// ---- FIX 1: the creation flow's target resolves against REGISTERED projects ----

function registered(id: string, name: string, directory: string): { id: string; name: string; directory: string } {
  return { id, name, directory };
}

test('resolveDesignTarget matches the frame directory exactly', () => {
  const target = resolveDesignTarget({
    directory: '/p/site',
    selectedProjectId: null,
    projects: [registered('p1', 'Site', '/p/site'), registered('p2', 'Deck', '/p/deck')],
    rows: [{ id: 'p1', name: 'Site', directory: '/p/site', config: { type: 'hi-fi', url: 'http://localhost:5173' }, configError: null }],
  });
  assert.deepEqual(target, { kind: 'project', dir: '/p/site', projectId: 'p1', config: { type: 'hi-fi', url: 'http://localhost:5173' } });
});

test('resolveDesignTarget falls back to the containing registered project', () => {
  const target = resolveDesignTarget({
    directory: '/p/site/pages/about', // a subdirectory of the registered project
    selectedProjectId: null,
    projects: [registered('p1', 'Site', '/p/site'), registered('p2', 'Deck', '/p/deck/nested')],
    rows: [{ id: 'p1', name: 'Site', directory: '/p/site', config: { type: 'hi-fi', url: 'http://localhost:5173' }, configError: null }],
  });
  assert.ok(target.kind === 'project');
  assert.equal(target.projectId, 'p1', 'the project that contains the directory wins');
  assert.equal(target.dir, '/p/site');
  // The DEEPEST containing project wins when registered projects nest.
  const nested = resolveDesignTarget({
    directory: '/p/deck/nested/slides',
    selectedProjectId: null,
    projects: [registered('p1', 'Site', '/p/site'), registered('p2', 'Deck', '/p/deck/nested')],
    rows: [],
  });
  assert.ok(nested.kind === 'project');
  assert.equal(nested.projectId, 'p2', 'the deepest containing project wins');
});

test('resolveDesignTarget refuses a directory no registered project covers', () => {
  const target = resolveDesignTarget({
    directory: '/somewhere/else',
    selectedProjectId: null,
    projects: [registered('p1', 'Site', '/p/site')],
    rows: [],
  });
  assert.deepEqual(target, { kind: 'needs-project', dir: '/somewhere/else' });
  // No registered projects at all: the same refusal, even with a directory.
  assert.deepEqual(
    resolveDesignTarget({ directory: '/p/site', selectedProjectId: null, projects: [], rows: [] }),
    { kind: 'needs-project', dir: '/p/site' },
  );
  assert.match(NEEDS_PROJECT_MESSAGE, /Add this folder to OpenChamber as a project first/);
});

test('resolveDesignTarget honours the project picked in the working-directory selector', () => {
  const target = resolveDesignTarget({
    directory: '/p/site',
    selectedProjectId: 'p2',
    projects: [registered('p1', 'Site', '/p/site'), registered('p2', 'Deck', '/p/deck')],
    rows: [{ id: 'p2', name: 'Deck', directory: '/p/deck', config: { type: 'deck' }, configError: null }],
  });
  assert.deepEqual(target, { kind: 'project', dir: '/p/deck', projectId: 'p2', config: { type: 'deck' } });
  // A picked id that is not (any longer) registered falls through to the directory match.
  const stale = resolveDesignTarget({
    directory: '/p/site',
    selectedProjectId: 'gone',
    projects: [registered('p1', 'Site', '/p/site')],
    rows: [],
  });
  assert.ok(stale.kind === 'project');
  assert.equal(stale.projectId, 'p1');
});

test('pathContains is a plain prefix match with a separator', () => {
  assert.equal(pathContains('/p/site', '/p/site'), true, 'the project IS its own root');
  assert.equal(pathContains('/p/site', '/p/site/src'), true);
  assert.equal(pathContains('/p/site', '/p/siteX'), false, 'no separator, no containment');
  assert.equal(pathContains('/p/site', '/p'), false, 'a parent is not inside the project');
});

// The refusal is wired before any scaffold: the composer's main action checks the
// resolved target FIRST, so prepareProject (and /scaffold) can never run against
// an unregistered directory.
test('the composer refuses to scaffold or start in an unregistered directory', async () => {
  const text = await readFile(new URL('../panel/main.ts', import.meta.url), 'utf8');
  const flowStart = text.indexOf('async function scaffoldCurrentProject(');
  const flowEnd = text.indexOf('// ---- references ----');
  const flow = text.slice(flowStart, flowEnd);
  assert.ok(flow.length > 0, 'flow markers are present');
  assert.match(flow, /if \(target\.kind === 'needs-project'\)/, 'both actions resolve the target first');
  assert.equal(flow.match(/NEEDS_PROJECT_MESSAGE/g)?.length, 4, 'the refusal message is the shared constant');
  assert.match(flow, /pageTargetFresh\(\)/, 'the target comes from the shared resolution (refreshed before deciding)');
  // The refusal happens before pageBusy/prepareProject: no request can be in flight.
  const prepare = flow.indexOf('await prepareProject');
  const refuse = flow.indexOf("target.kind === 'needs-project'");
  assert.ok(refuse > 0 && prepare > refuse, 'the refusal precedes any prepareProject call');
  // pageTarget itself routes through the pure rule against allProjects.
  const pageTargetStart = text.indexOf('function pageTarget()');
  const pageTargetBody = text.slice(pageTargetStart, text.indexOf('/** Fill the composer with the micro-brief'));
  assert.match(pageTargetBody, /resolveDesignTarget\(/, 'one shared resolution rule');
  assert.match(pageTargetBody, /projects: allProjects/, 'resolution reads the FULL registered list');
});

// The working-directory menu lists every REGISTERED project (not the
// config-filtered rows), keeps the readiness badge, and no longer offers the
// unregistered current directory as a target.
test('the working-directory menu renders all registered projects', async () => {
  const text = await readFile(new URL('../panel/main.ts', import.meta.url), 'utf8');
  const menuStart = text.indexOf('function renderDirMenu()');
  const menuEnd = text.indexOf('function dirOption(');
  const menu = text.slice(menuStart, menuEnd);
  assert.ok(menu.length > 0, 'menu markers are present');
  assert.match(menu, /for \(const project of allProjects\)/, 'the menu iterates the full registered list');
  assert.doesNotMatch(menu, /dirOption\(fileBaseName\(state\.directory\)/, 'the unregistered current directory is not offered');
  assert.match(menu, /NO_CONFIG_BADGE/, 'a project with no config keeps its badge');
  // The needs-project note explains the refusal in the row itself.
  const rowStart = text.indexOf('function renderDirRow()');
  const row = text.slice(rowStart, menuStart);
  assert.match(row, /ds-dir-note/, 'a note is rendered');
  assert.match(row, /NEEDS_PROJECT_MESSAGE/, 'the note carries the shared refusal copy');
  const style = await readFile(new URL('../panel/styles.css', import.meta.url), 'utf8');
  assert.match(style, /\.ds-dir-note/, 'the note is styled');
  assert.match(style, /\.ds-menu-title/, 'the badge shares the menu row title line');
});

// A successful start refreshes the still-mounted page so the new chat appears.
test('startDesignSession re-runs loadDesignHome when the page is still mounted', async () => {
  const text = await readFile(new URL('../panel/main.ts', import.meta.url), 'utf8');
  const start = text.indexOf('async function startDesignSession(');
  const body = text.slice(start, text.indexOf('/** A resolved creation target'));
  assert.match(body, /if \(state\.surface === 'page'\) void loadDesignHome\(\)/, 'the refresh is gated to the page surface');
});

// ---- the `+` attach sources (FIX 3): drop / paste / project, no file listing ----

test('the + overlay stages pasted paths and never treats dropped names as accessible files', async () => {
  const text = await readFile(new URL('../panel/main.ts', import.meta.url), 'utf8');
  // A hidden control: the + is appended only when a source is attachable.
  assert.match(text, /plus\.disabled = state\.pageBusy \|\| pageTarget\(\)\.kind !== 'project'/, 'a registered source, not its preview URL, gates the +');
  assert.match(text, /ATTACH_NEEDS_URL/, 'the no-url explanation is the shared constant');
  assert.match(text, /plus\.addEventListener\('click', \(\) => toggleMenu\('attach'\)\)/, 'the + opens the attach overlay');
  assert.match(text, /panel: renderAttachPanel\(\)/, 'the attach overlay is passed to the shared helper');
  // The project source stays.
  assert.match(text, /'Reference the project'/, 'the project source');
  assert.match(text, /void attachProjectReference\(\)/, 'the project source attaches a reference');
  // The paste-a-path input replaces the file search-list flow.
  assert.match(text, /ds-attach-paste-input/, 'a mono paste-a-path input exists');
  assert.match(text, /void attachProjectPath\(path\)/, 'the pasted path attaches a reference');
  assert.match(text, /File path/, 'the input is visibly labelled');
  // The path draft survives a background rebuild and failed validation.
  assert.match(text, /input\.value = attachPathDraft/, 'the draft is restored on rebuild');
  // The file search-list flow is gone.
  assert.doesNotMatch(text, /'Reference a file…'/, 'the file source entry is gone');
  assert.doesNotMatch(text, /function renderAttachFiles\(/, 'the file-list step is gone');
  assert.doesNotMatch(text, /function openAttachFiles\(/, 'the file step trigger is gone');
  assert.doesNotMatch(text, /function loadAttachFiles\(/, 'the file listing loader is gone');
  assert.doesNotMatch(text, /listProjectFiles/, 'the panel no longer lists project files');
  assert.doesNotMatch(text, /filterProjectFiles/, 'the panel no longer filters a file listing');
  assert.doesNotMatch(text, /attachView|attachFiles|attachQuery/, 'the file step scratch state is gone');
  // A browser drop cannot identify the accessible filesystem path.
  assert.match(text, /function attachDroppedFiles\(/, 'a drop handler explains pasted paths');
  assert.doesNotMatch(text, /path: file\.name/, 'dropped basenames never become references');
  assert.match(text, /addEventListener\('drop', onPageDrop\)/, 'the page is a drop target');
  assert.match(text, /dragHasFiles\(/, 'only file drags are answered');
  assert.match(text, /ds-drop/, 'the drag-over state is styled');
  // It never fakes an upload — the chips only reference.
  assert.doesNotMatch(text, /FormData|multipart|host\.upload/, 'no upload path is faked anywhere');
  assert.match(text, /Files are referenced, never uploaded/, 'the copy states the reference-not-upload rule');
  const style = await readFile(new URL('../panel/styles.css', import.meta.url), 'utf8');
  assert.match(style, /\.ds-attach-paste-input/, 'the paste input is styled');
  assert.match(style, /\.ds-page-body\.ds-drop/, 'the drop state is styled');
  assert.doesNotMatch(style, /\.ds-attach-back/, 'the removed back button has no dead styles');
});

test('Studio composer renders one removable local reference list between textarea and toolbar', async () => {
  const text = await readFile(new URL('../panel/main.ts', import.meta.url), 'utf8');
  assert.match(text, /box\.append\(area, renderReferenceDraft\(\), bar\)/, 'references belong to this composer, not a detached panel');
  assert.match(text, /q\('ul', 'ds-reference-list'\)/, 'chips use list semantics');
  assert.match(text, /remove\.setAttribute\('aria-label', `Remove \$\{reference\.path\}`\)/, 'each removal is labelled with its full path');
  assert.match(text, /removePageReference\(reference\.id\)/, 'remove mutates the local draft');
  const style = await readFile(new URL('../panel/styles.css', import.meta.url), 'utf8');
  assert.match(style, /\.ds-reference-list \{[^}]*flex-wrap: wrap/);
  assert.match(style, /\.ds-reference-label \{[^}]*text-overflow: ellipsis/);
  assert.match(style, /\.ds-reference-details\[open\] \.ds-reference-label \{[^}]*overflow-wrap: anywhere/);
});

// A minimal DOM recorder exercises the actual composer renderer without a
// generated bundle. It does not claim browser layout, contrast or focus proof.
class ComposerNode {
  tagName: string;
  className = '';
  textContent = '';
  hidden = false;
  disabled = false;
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  children: ComposerNode[] = [];
  attributes = new Map<string, string>();
  listeners = new Map<string, Array<() => void>>();
  constructor(tag: string) { this.tagName = tag.toUpperCase(); }
  classList = {
    add: (...names: string[]) => { this.className = `${this.className} ${names.join(' ')}`.trim(); },
    toggle: (name: string, on: boolean) => {
      const names = this.className.split(' ').filter((candidate) => candidate && candidate !== name);
      if (on) names.push(name);
      this.className = names.join(' ');
    },
  };
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  append(...nodes: ComposerNode[]): void { this.children.push(...nodes); }
  replaceChildren(...nodes: ComposerNode[]): void { this.children = [...nodes]; }
  addEventListener(name: string, callback: () => void): void {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), callback]);
  }
  click(): void { for (const callback of this.listeners.get('click') ?? []) callback(); }
  focus(): void { /* DOM recorder has no browser focus engine. */ }
  find(cls: string): ComposerNode | undefined {
    return this.className.split(' ').includes(cls) ? this : this.children.map((child) => child.find(cls)).find(Boolean);
  }
}

test('actual composer DOM keeps full source-qualified chips across rebuilds and removes only the clicked chip', async () => {
  main.setSurface('page');
  main.resetReferenceDraft();
  main.setSelectedProject(null);
  main.setProjectDirectory('/projects/site');
  (api.host as unknown as { listProjects: () => Promise<unknown> }).listProjects = async () => ({ kind: 'projects', state: 'ready', projects: [{ id: 'p1', name: 'Site', directory: '/projects/site' }] });
  stubService((request) => {
    if (request.path === '/config') return { status: 200, body: JSON.stringify({ config: { name: 'Site' }, path: null }) };
    const body = JSON.parse(request.body || '{}') as { path: string; dir: string };
    return { status: 200, body: JSON.stringify({ path: `${body.dir}/${body.path}`, sourceDirectory: body.dir }) };
  });
  await main.loadProjects();
  await main.attachProjectPath('src/app.ts');
  await main.attachProjectPath('examples/app.ts');
  const originalDocument = globalThis.document;
  (globalThis as { document?: unknown }).document = {
    createElement: (tag: string) => new ComposerNode(tag),
    createElementNS: (_namespace: string, tag: string) => new ComposerNode(tag),
  };
  try {
    const composer = main.renderComposer() as unknown as ComposerNode;
    assert.deepEqual(composer.children.slice(0, 3).map((node) => node.tagName), ['TEXTAREA', 'UL', 'DIV']);
    assert.equal(composer.find('ds-plus')!.disabled, false, 'a registered source needs no preview URL');
    const list = composer.find('ds-reference-list')!;
    assert.equal(list.hidden, false);
    assert.equal(list.children.length, 2);
    assert.equal(list.children[0]!.tagName, 'LI');
    assert.equal(list.children[0]!.find('ds-reference-label')!.textContent, 'site · src/app.ts');
    assert.equal(list.children[0]!.find('ds-reference-path')!.textContent, '/projects/site/src/app.ts');
    assert.equal(list.children[0]!.find('ds-reference-details')!.children[0]!.tagName, 'SUMMARY');
    assert.equal(list.children[0]!.find('ds-reference-source')!.textContent, 'Source: /projects/site');
    const remove = list.children[0]!.find('ds-reference-remove')!;
    assert.equal(remove.attributes.get('aria-label'), 'Remove /projects/site/src/app.ts');
    main.setDesignSystem('apple');
    main.setProjectDirectory('/projects/deck');
    assert.equal((main.renderComposer() as unknown as ComposerNode).find('ds-reference-list')!.children.length, 2, 'rerender/target change does not drop refs');
    remove.click();
    assert.deepEqual(main.getPageDraft().references.map((reference) => reference.path), ['/projects/site/examples/app.ts']);
    const remaining = main.renderReferenceDraft() as unknown as ComposerNode;
    remaining.find('ds-reference-remove')!.click();
    assert.equal((main.renderReferenceDraft() as unknown as ComposerNode).hidden, true);
  } finally {
    (globalThis as { document?: unknown }).document = originalDocument;
    main.setDesignSystem(null);
    main.setSurface('panel');
    main.resetReferenceDraft();
  }
});

test('the list copy is fixed', () => {
  assert.equal(DESIGN_READY_BADGE, 'Design ready');
  assert.equal(NO_CONFIG_BADGE, 'No config yet');
  assert.equal(NO_DESIGN_WORK_MESSAGE, 'No design work yet. Create one above.');
});

// ---- the merged design-work list ----

function projectRow(id: string, name: string): ProjectRow {
  return { id, name, directory: `/p/${id}`, config: { type: 'hi-fi', url: 'http://localhost:5173' }, configError: null };
}

function chatRow(sessionId: string, title: string, updatedAt: number): DesignChatRow {
  return { sessionId, projectId: 'p1', projectName: 'Site', title, directory: '/p/site', config: null, configError: null, updatedAt };
}

test('designWorkRows merges both sources into one array and marks each kind', () => {
  const view = designWorkRows(
    { kind: 'list', rows: [projectRow('p1', 'Site')] },
    { kind: 'list', rows: [chatRow('s1', 'Luxury property', 10)] },
  );
  assert.ok(view.kind === 'list', 'both sources present is a list');
  assert.equal(view.rows.length, 2);
  assert.equal(view.rows[0]!.kind, 'project');
  assert.deepEqual(view.rows[0]!.kind === 'project' ? view.rows[0]!.project.name : null, 'Site');
  assert.equal(view.rows[1]!.kind, 'chat');
  assert.deepEqual(view.rows[1]!.kind === 'chat' ? view.rows[1]!.chat.title : null, 'Luxury property');
});

test('designWorkRows orders projects first, then chats by recency', () => {
  const view = designWorkRows(
    { kind: 'list', rows: [projectRow('p1', 'Site'), projectRow('p2', 'Deck')] },
    {
      kind: 'list',
      rows: [chatRow('s1', 'Older', 10), chatRow('s2', 'Newer', 99), chatRow('s3', 'Middle', 50)],
    },
  );
  assert.ok(view.kind === 'list');
  assert.deepEqual(
    view.rows.map((row) => (row.kind === 'project' ? `project:${row.project.id}` : `chat:${row.chat.sessionId}`)),
    ['project:p1', 'project:p2', 'chat:s2', 'chat:s3', 'chat:s1'],
    'projects keep the workspace order; chats go newest first',
  );
});

test('designWorkRows shows chats alone when there are no projects', () => {
  const view = designWorkRows(
    { kind: 'empty' },
    { kind: 'list', rows: [chatRow('s1', 'Solo', 1)] },
  );
  assert.ok(view.kind === 'list', 'a chat row survives with no project rows');
  assert.equal(view.rows.length, 1);
  assert.equal(view.rows[0]!.kind, 'chat');
});

test('designWorkRows honours the snapshot states', () => {
  assert.equal(designWorkRows({ kind: 'loading' }, { kind: 'loading' }).kind, 'loading');
  assert.equal(designWorkRows({ kind: 'empty' }, { kind: 'empty' }).kind, 'empty', 'both ready and empty is the one empty state');
  const projectError = designWorkRows({ kind: 'error', message: 'Could not load projects.' }, { kind: 'empty' });
  assert.ok(projectError.kind === 'error');
  assert.match(projectError.message, /Could not load projects/);
  const chatError = designWorkRows({ kind: 'empty' }, { kind: 'error', message: 'Could not load design chats for Site.' });
  assert.ok(chatError.kind === 'error');
  assert.match(chatError.message, /Site/);
  assert.equal(
    designWorkRows({ kind: 'list', rows: [projectRow('p1', 'Site')] }, { kind: 'loading' }).kind,
    'loading',
    'a loading chat source keeps the whole merged list loading',
  );
});

test('designWorkRows omits a chat whose project is already listed; an unlisted project keeps its chats', () => {
  const view = designWorkRows(
    { kind: 'list', rows: [projectRow('p1', 'Site')] },
    { kind: 'list', rows: [chatRow('s1', 'Listed chat', 10), { ...chatRow('s2', 'Legacy chat', 5), projectId: 'p2' }] },
    { omitChatProjectIds: new Set(['p1']) },
  );
  assert.ok(view.kind === 'list');
  assert.deepEqual(
    view.rows.map((row) => (row.kind === 'project' ? `project:${row.project.id}` : `chat:${row.chat.sessionId}`)),
    ['project:p1', 'chat:s2'],
    'a listed project hides its own chats; a chat of a project NOT in the rows stays visible',
  );
});

test('designWorkRows keeps every chat with no options, an empty object or an empty set', () => {
  const projects: ProjectsView = { kind: 'list', rows: [projectRow('p1', 'Site')] };
  const chats: DesignChatsView = { kind: 'list', rows: [chatRow('s1', 'Chat', 10)] };
  for (const view of [designWorkRows(projects, chats), designWorkRows(projects, chats, {}), designWorkRows(projects, chats, { omitChatProjectIds: new Set() })]) {
    assert.ok(view.kind === 'list');
    assert.equal(view.rows.length, 2, 'no options, an empty options object and an empty set are all no-ops');
  }
  assert.equal(
    designWorkRows({ kind: 'error', message: 'Could not load projects.' }, chats, { omitChatProjectIds: new Set(['p1']) }).kind,
    'error',
    'an options object never changes the error precedence',
  );
});

test('designWorkRows stays a list with projects alone; empty only when nothing survives', () => {
  const bothListed = designWorkRows(
    { kind: 'list', rows: [projectRow('p1', 'Site'), projectRow('p2', 'Deck')] },
    { kind: 'list', rows: [chatRow('s1', 'One', 10), { ...chatRow('s2', 'Two', 5), projectId: 'p2' }] },
    { omitChatProjectIds: new Set(['p1', 'p2']) },
  );
  assert.ok(bothListed.kind === 'list');
  assert.equal(bothListed.rows.length, 2, 'projects remain when every chat of theirs is omitted');
  const allGone = designWorkRows(
    { kind: 'empty' },
    { kind: 'list', rows: [{ ...chatRow('s1', 'Solo', 10), projectId: 'p9' }] },
    { omitChatProjectIds: new Set(['p9']) },
  );
  assert.equal(allGone.kind, 'empty', 'omitting the last surviving row is the one empty state');
});

test('designWorkRows keeps projects-first order and recency after omission', () => {
  const view = designWorkRows(
    { kind: 'list', rows: [projectRow('p1', 'Site')] },
    {
      kind: 'list',
      rows: [
        { ...chatRow('s-old', 'Old', 10), projectId: 'p2' },
        { ...chatRow('s-mid', 'Mid', 50), projectId: 'p2' },
        chatRow('s-new', 'New', 99),
      ],
    },
    { omitChatProjectIds: new Set(['p1']) },
  );
  assert.ok(view.kind === 'list');
  assert.deepEqual(
    view.rows.map((row) => (row.kind === 'project' ? `project:${row.project.id}` : `chat:${row.chat.sessionId}`)),
    ['project:p1', 'chat:s-mid', 'chat:s-old'],
    'the omitted chat is the newest, and the retained chats stay newest-first',
  );
});

test('designWorkRows never omits a chat with a missing project id', () => {
  const view = designWorkRows(
    { kind: 'list', rows: [projectRow('p1', 'Site')] },
    { kind: 'list', rows: [{ ...chatRow('s1', 'No project', 10), projectId: '' }] },
    { omitChatProjectIds: new Set(['p1']) },
  );
  assert.ok(view.kind === 'list');
  assert.equal(view.rows.length, 2, 'an empty projectId is not collated with a listed id');
});

test('the renderer omits listed-project chats only in the unfiltered view', async () => {
  const text = await readFile(new URL('../panel/main.ts', import.meta.url), 'utf8');
  assert.match(
    text,
    /state\.projectFilter\s*\?\s*undefined\s*:\s*\{\s*omitChatProjectIds/,
    'the omit set is passed only when no project filter is active, so Open sessions keeps its chats',
  );
  assert.match(
    text,
    /omitChatProjectIds:\s*listedIds/,
    'the omit set is derived from the listed project rows, not from every known project',
  );
});

// The merged list replaced the two separate sections: one renderer, one list.
test('the page builds ONE merged design-work list below the composer', async () => {
  const text = await readFile(new URL('../panel/main.ts', import.meta.url), 'utf8');
  assert.match(text, /function renderDesignSection\(/, 'the one merged section is built');
  assert.doesNotMatch(text, /function renderProjectsSection\(/, 'no separate projects section remains');
  assert.doesNotMatch(text, /function renderChatsSection\(/, 'no separate chats section remains');
  assert.match(
    text,
    /renderHero\(\), renderComposer\(\), renderDirRow\(\), renderIdeas\(\), renderDesignSection\(\), renderFooter\(\)/,
    'the one list mounts below the idea cards, closed by the footer',
  );
  assert.match(text, /designWorkRows\(/, 'the section renders the merged view');
  assert.match(text, /row\.kind === 'project' \? renderProjectRow\(row\.project\) : renderChatRow\(row\.chat\)/, 'both row kinds share the one list');
  assert.match(text, /PROJECT_ROW_ICON/, 'a project row leads with its type icon');
  assert.match(text, /CHAT_ROW_ICON/, 'a chat row leads with its type icon');
  assert.match(text, /row\.configError/, 'a failed config read is shown, not swallowed');
  assert.match(text, /await host\.openSession\(row\.sessionId\)/, 'a chat row opens its session');
  assert.match(text, /void loadDesignHome\(\)/, 'a Retry reloads the list');
  assert.match(text, /Loading…/, 'the loading state is shown');
  assert.match(text, /NO_DESIGN_WORK_MESSAGE/, 'the single empty line is shown');
});

test('contrastRatio and tokenNameFor are pure colour helpers', () => {
  assert.equal(contrastRatio('#000000', '#ffffff'), 21);
  assert.equal(contrastRatio('#ffffff', '#ffffff'), 1);
  assert.equal(contrastRatio('rgb(255,255,255)', '#000'), 21);
  assert.equal(contrastRatio('oklch(0.5 0.1 10)', '#fff'), null, 'a colour it cannot parse is null, not a guess');
  assert.equal(tokenNameFor({ backgroundColor: '#fff' }), '--color-surface');
  assert.equal(tokenNameFor({ color: '#111' }), '--color-text');
  assert.equal(tokenNameFor({ borderColor: '#333' }), '--color-border');
  assert.equal(tokenNameFor({ fontSize: '16px' }), null);
});

test('highlightElement posts the selector to /highlight', async () => {
  const calls = stubService(() => ({ status: 200, body: JSON.stringify({ ok: true }) }));
  const result = await api.highlightElement('div.hero');
  assert.deepEqual(result, { ok: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.method, 'POST');
  assert.equal(calls[0]!.path, '/highlight');
  assert.deepEqual(JSON.parse(calls[0]!.body ?? ''), { selector: 'div.hero' });
});



test('loadStudioConfig reads the config for display but never opens a window', async () => {
  const calls = stubService((request) =>
    request.path === '/config'
      ? { status: 200, body: JSON.stringify({ config: { version: 1, name: 'Site', url: 'http://localhost:5173' }, path: '/projects/site/.design-studio.json' }) }
      : { status: 200, body: JSON.stringify({ ok: true }) },
  );
  setProjectDirectory('/projects/site');

  await loadStudioConfig();

  assert.equal(calls.some((call) => call.path === '/config'), true, 'reads the config');
  assert.equal(calls.some((call) => call.path === '/open'), false, 'never opens on read');
});

test('closeLive posts to /close and returns ok', async () => {
  const calls = stubService(() => ({ status: 200, body: JSON.stringify({ ok: true }) }));

  const result = await closeLive();

  assert.deepEqual(result, { ok: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.method, 'POST');
  assert.equal(calls[0]!.path, '/close');
});

test('a non-200 service answer surfaces as ServiceUnavailable', async () => {
  stubService(() => ({ status: 500, body: JSON.stringify({ error: 'window failed to open' }) }));
  await assert.rejects(() => openLive('http://localhost:5173'), (error: unknown) => {
    assert.ok(error instanceof ServiceUnavailable);
    assert.match((error as Error).message, /window failed to open/);
    return true;
  });
});

test('formatWindowStatus reports open/closed with url and title', () => {
  assert.equal(formatWindowStatus({ windowOpen: false, url: '', title: '' }), 'Window closed');
  assert.equal(formatWindowStatus({ windowOpen: true, url: 'about:blank', title: '' }), 'Window open · no page open');
  assert.equal(
    formatWindowStatus({ windowOpen: true, url: 'http://localhost:5173/', title: 'App' }),
    'Window open · http://localhost:5173/ — App',
  );
  assert.equal(formatWindowStatus({ windowOpen: true, url: 'https://x.test/', title: '' }), 'Window open · https://x.test/');
});

test('formatOpenStatus summarizes the open result', () => {
  assert.equal(formatOpenStatus({ ok: true, url: 'u', title: '', settled: true }), 'Window open');
  assert.equal(
    formatOpenStatus({ ok: true, url: 'u', title: '', settled: true, started: true }),
    'Dev server started · window open',
  );
  assert.equal(formatOpenStatus({ ok: false, url: '', title: '', settled: false }), 'Could not open the window');
  const failure = 'the dev server is not running and .design-studio.json has no "command" to start it';
  assert.equal(formatOpenStatus({ ok: false, url: '', title: '', settled: false, error: failure }), failure);
});

// The one-line session status: is this a design session, and does the project
// have a .design-studio.json url? Exactly three strings.
test('designSessionStatus states session kind and config presence', () => {
  assert.equal(
    designSessionStatus({ modeOn: true, configUrl: 'http://localhost:5173' }),
    'Design session · .design-studio.json found · http://localhost:5173',
  );
  assert.equal(
    designSessionStatus({ modeOn: true, configUrl: null }),
    'Design session · no .design-studio.json url yet',
  );
  assert.equal(
    designSessionStatus({ modeOn: false, configUrl: 'http://localhost:5173' }),
    'Design mode is off — start a design session to pick elements',
  );
  assert.equal(
    designSessionStatus({ modeOn: false, configUrl: null }),
    'Design mode is off — start a design session to pick elements',
  );
});

// One source of truth for "the row may offer a control": a `.design-studio.json`
// with a non-empty url. No url → no control, so no "no url" error is possible.
test('projectReady is true only for a config with a non-empty url', () => {
  assert.equal(projectReady(null), false);
  assert.equal(projectReady(undefined), false);
  assert.equal(projectReady({}), false);
  assert.equal(projectReady({ url: '' }), false);
  assert.equal(projectReady({ url: '   ' }), false);
  assert.equal(projectReady({ url: 'http://localhost:5173' }), true);
  assert.equal(projectReady({ url: '  http://localhost:5173  ' }), true);
});

// With no config the section IS the one not-ready line: the toggle, Focus, the
// ⌘-click hint are all hidden, so nothing is clickable
// and no "no url" toast can be produced.
test('the not-ready line is the whole section — no control without a config', async () => {
  assert.equal(NO_PROJECT_CONFIG_MESSAGE, "No .design-studio.json here — Design Studio isn't set up in this project.");

  const source = await readFile(new URL('../panel/main.ts', import.meta.url), 'utf8');
  // The interactive bar and hint are gated on projectReady.
  assert.match(source, /const ready = projectReady\(state\.config\)/);
  assert.match(source, /barEl\.classList\.toggle\('hidden', !ready\)/);
  assert.match(source, /hintEl\.classList\.toggle\('hidden', !ready\)/);
  assert.doesNotMatch(source, /statusFormHost/, 'the removed brief block has no host');
  // The one not-ready line is rendered from the shared constant.
  assert.match(source, /sessionLineEl\.textContent = NO_PROJECT_CONFIG_MESSAGE/);
  // The row's interactive bar — its two controls — is hidden until the project
  // is ready, so nothing is clickable without a config.
  assert.match(source, /bar\.append\(serverBtn, modeToggleBtn\)/);
  assert.doesNotMatch(source, /stopPreview/);
  assert.match(source, /barEl\.classList\.toggle\('hidden', !ready\)/);
});

// The DOM shim here does not build the row (no host `onReady`), so the line is
// asserted at the source level: it sits below the toggle row and is styled.
test('the session line sits in the status section below the toggle row', async () => {
  const source = await readFile(new URL('../panel/main.ts', import.meta.url), 'utf8');
  assert.match(source, /sessionLineEl = q\('div', 'ds-sessionline'\)/);
  assert.match(source, /statusRoot\.append\(bar, sessionLineEl, hintEl, serverAnnounceEl\)/);

  const style = await readFile(new URL('../panel/styles.css', import.meta.url), 'utf8');
  assert.match(style, /\.ds-sessionline/);
  assert.match(style, /\.ds-sessionline\.off/);
});

test('referenceText builds a reference chip for a picked element', () => {
  // PICK_SCRIPT emits camelCase style keys; the chip must read those.
  const text = referenceText(
    {
      selector: 'div.hero',
      tag: 'div',
      classes: 'hero',
      text: 'Hi',
      outerHTML: '<div class="hero">Hi</div>',
      styles: { fontSize: '16px', fontWeight: '700', backgroundColor: '#fff', color: '#123', display: 'normal' },
      rect: { x: 0, y: 0, width: 1, height: 1 },
    },
    'http://localhost:5173/',
  );

  assert.match(text, /^Reference from Design Studio/);
  assert.match(text, /URL: http:\/\/localhost:5173\//);
  assert.match(text, /Selector: div\.hero/);
  assert.match(text, /Tag: div {2}Classes: hero/);
  assert.match(text, /Text: "Hi"/);
  assert.match(text, /fontSize: 16px;/);
  assert.match(text, /fontWeight: 700;/);
  assert.match(text, /backgroundColor: #fff;/);
  assert.match(text, /color: #123;/);
  assert.doesNotMatch(text, /display:/, 'neutral values are filtered out');
  assert.match(text, /<div class="hero">Hi<\/div>/);
  assert.doesNotMatch(text, /Picked at/, 'no moment line without a pickedAt');
});

test('referenceText stamps the local pick time when given a date', () => {
  const pick = {
    selector: 'div.hero',
    tag: 'div',
    classes: 'hero',
    text: 'Hi',
    outerHTML: '<div class="hero">Hi</div>',
    styles: {},
    rect: { x: 0, y: 0, width: 1, height: 1 },
  };
  // Local-time constructor so the expected HH:MM:SS is what the machine shows.
  const pickedAt = new Date(2026, 0, 2, 9, 4, 7);

  const text = referenceText(pick, 'http://localhost:5173/', pickedAt);

  assert.match(text, /^Reference from Design Studio\nPicked at 09:04:07\n/);
  assert.equal((text.match(/Picked at/g) ?? []).length, 1, 'the moment line appears once');
});

// The chat Work Status draws the shared row; the rail panel draws only its
// one-line pointer; the page draws the creation home; anything else nothing.
test('surfaceKind maps status to the row, panel to its note, page to the home', () => {
  assert.equal(surfaceKind('status'), 'row');
  assert.equal(surfaceKind('panel'), 'note');
  assert.equal(surfaceKind('background'), 'none');
  assert.equal(surfaceKind('dialog'), 'none');
  assert.equal(surfaceKind('popover'), 'none');
  assert.equal(surfaceKind('page'), 'page');
  assert.equal(surfaceKind(''), 'none');
});

// FIX 4: the rail panel surface shows nothing but a calm one-line pointer to
// the sidebar page — never an empty frame; `panel.entry` stays only because
// `contributes.page` requires it.
test('the rail panel surface renders only its one-line pointer', async () => {
  const text = await readFile(new URL('../panel/main.ts', import.meta.url), 'utf8');
  assert.equal(PANEL_SIDEBAR_HINT, 'Design Studio opens from the sidebar.');
  assert.match(text, /function buildPanelNote\(/, 'a dedicated panel-note builder');
  assert.match(text, /q\('p', 'ds-panel-note-line', PANEL_SIDEBAR_HINT\)/, 'the one line is the whole panel surface');
  assert.match(text, /kind === 'note'[\s\S]*buildPanelNote\(root\)/, 'the panel surface draws the note');
  const style = await readFile(new URL('../panel/styles.css', import.meta.url), 'utf8');
  assert.match(style, /\.ds-panel-note-line/, 'the line is styled');
});

test('the row surfaces share one builder, the page has its own, and no mount opens a window', async () => {
  const source = await readFile(new URL('../panel/main.ts', import.meta.url), 'utf8');

  const buildStart = source.indexOf('function build(');
  const mainStart = source.indexOf('async function main(');
  assert.ok(buildStart > 0 && mainStart > buildStart, 'source markers are present');
  const dispatch = source.slice(buildStart, mainStart);
  assert.match(dispatch, /kind === 'row'[\s\S]*buildRow\(root\)/, 'the row surfaces draw the shared row');
  assert.match(dispatch, /kind === 'page'[\s\S]*buildPage\(root\)/, 'the page draws its own builder');
  assert.doesNotMatch(dispatch, /cockpit/, 'no popover surface is built');
  assert.doesNotMatch(dispatch, /buildDialog|'wizard'/, 'the attach dialog is gone');

  // The row and the page are built by exactly one function each.
  assert.equal(count(source, 'function buildRow('), 1, 'one shared row builder');
  assert.equal(count(source, 'function buildPage('), 1, 'one page builder');

  // Neither the row/page builders nor the mount path opens a live window.
  const buildersStart = source.indexOf('function buildRow(');
  const builders = source.slice(buildersStart, mainStart);
  const mount = source.slice(mainStart, source.indexOf('export function setProjectDirectory('));
  assert.ok(buildersStart > 0 && builders.length > 0);
  for (const region of [builders, mount]) {
    assert.doesNotMatch(region, /openLive\(/, 'no direct service open in a builder or mount');
    assert.doesNotMatch(region, /openCurrentProjectWindow\(/, 'no project-window open in a builder or mount');
    assert.doesNotMatch(region, /openProjectWindow\(/, 'no window open in a builder or mount');
  }
});

// The full-page creation home: the hero, the composer (with its type chip and
// send), the working-directory selector and the idea cards — plus the removal of
// the old Projects / New-design wizard.
test('the page builds the creation home and the wizard is gone', async () => {
  const text = await readFile(new URL('../panel/main.ts', import.meta.url), 'utf8');

  assert.match(text, /function renderPage\(/, 'the page has its own renderer');
  assert.match(text, /function renderHero\(/, 'the hero is built');
  assert.match(text, /Let's create /, 'the headline reads "Let\'s create"');
  assert.match(text, /Good work starts here/, 'the muted one-liner is there');
  assert.match(text, /function renderComposer\(/, 'the composer is built');
  assert.match(text, /function renderTypeMenu\(/, 'the type dropdown is built');
  assert.match(text, /function renderDirRow\(/, 'the working-directory row is built');
  assert.match(text, /function renderIdeas\(/, 'the idea cards are built');
  assert.match(text, /PAGE_TYPE_LABELS/, 'the type labels drive headline, chip and dropdown');
  assert.match(text, /pageBody\.append\(shell\)/, 'the page mounts the assembled home');

  // The wizard surface and its builders are gone.
  assert.doesNotMatch(text, /function buildDialog\(/);
  assert.doesNotMatch(text, /function renderDialog\(/);
  assert.doesNotMatch(text, /function renderProjects\(/);
  assert.doesNotMatch(text, /function renderNewDesign\(/);
  assert.doesNotMatch(text, /ds-tabs/);
  assert.doesNotMatch(text, /dialogBody/);
});

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

// ---- the design-system picker (composer control + one merged panel) ----

test('the composer carries a design-system control that opens the picker', async () => {
  const text = await readFile(new URL('../panel/main.ts', import.meta.url), 'utf8');
  assert.match(text, /designSystemLabel\(state\.pageDesignSystemId\)/, 'the control names the current choice');
  assert.match(text, /designSystem\.addEventListener\('click', \(\) => toggleMenu\('ds'\)\)/, 'clicking opens the picker');
  assert.match(text, /const dsAnchor = anchoredPopover\(\{/, 'the control opens through the shared anchored-popover helper');
  assert.match(text, /panel: renderDesignSystemPanel\(\)/, 'the panel is the design-system picker, mounted by the helper');
  assert.match(text, /NO_DESIGN_SYSTEM/, 'the default label is the shared constant');
});

test('the picker is one merged panel: search, list, detail and Clear', async () => {
  const text = await readFile(new URL('../panel/main.ts', import.meta.url), 'utf8');
  assert.match(text, /function renderDesignSystemPanel\(/, 'one panel renderer');
  assert.equal(count(text, 'function renderDesignSystemPanel('), 1, 'exactly one picker panel');
  assert.match(text, /placeholder = 'Search design systems'/, 'the search field matches the reference copy');
  assert.match(text, /renderDesignSystemDetail\(detail, dsHighlight\)/, 'the detail pane follows the highlight');
  assert.match(text, /designSystemSwatches\(preset\)/, 'the detail pane shows the token swatch strip');
  assert.match(text, /filterDesignSystems\(dsQuery\)/, 'the search filters the catalog');
  assert.match(text, /designSystemGroups\(shown\)/, 'the list is grouped by category');
  assert.match(text, /ds-ds-group/, 'group labels are rendered');
  assert.match(text, /'Clear'/, 'the Clear action');
  assert.match(text, /applyDesignSystem\(null\)/, 'Clear returns to No design system');
  assert.doesNotMatch(text, /'Use'/, 'the redundant Use action is gone');
  assert.match(text, /ArrowDown/, 'arrow keys move the highlight');
  assert.match(text, /event\.key === 'Escape'/, 'Escape closes the panel');
  assert.match(text, /queueMicrotask\(\(\) => search\.focus\(\)\)/, 'the search field takes focus on open');
  // It is a panel, never a second list or a separate screen.
  assert.doesNotMatch(text, /function renderDesignSystemPage\(/, 'no separate design-system screen');
});

// FIX 1: a picker row is a real target — clicking it (or Enter/Space, which fire
// the same button click) selects AND applies the preset, and closes the picker.
// No second `Use` step.
test('a picker row click applies the preset directly', async () => {
  const text = await readFile(new URL('../panel/main.ts', import.meta.url), 'utf8');
  assert.match(text, /item\.addEventListener\('click', \(\) => applyDesignSystem\(id\)\)/, 'clicking a row applies its preset');
  assert.match(text, /applyDesignSystem\(dsHighlight\)/, 'Enter also applies the highlighted row');
  assert.match(
    text,
    /state\.pageDesignSystemId = findDesignSystem\(id\)\?\.id \?\? null;[\s\S]*closeActiveOverlay\('ds'\);/,
    'apply sets the choice and closes the picker',
  );
  // A row stays a real button, so focus + Enter/Space work natively too.
  assert.match(text, /q<HTMLButtonElement>\('button', `ds-ds-item/, 'each row is a button');
});

// FIX 2: the picker floats; it never expands inside the composer and pushes the
// idea cards / design-work list down. Both pickers share ONE anchored-popover
// pattern (open/close, backdrop, Escape, arrows, aria), never a duplicated one.
test('both pickers share one anchored overlay, not an inline expansion', async () => {
  const text = await readFile(new URL('../panel/main.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(text, /if \(state\.dsMenuOpen\) box\.append\(renderDesignSystemPanel\(\)\)/, 'no inline mount in the composer flow');
  assert.equal(count(text, 'function anchoredPopover('), 1, 'exactly one anchored-popover helper');
  assert.match(text, /const anchor = q\('div', 'ds-ds-anchor'\)/, 'the trigger and its panel share one relative anchor');
  assert.match(text, /anchor\.append\(q\('div', 'ds-ds-backdrop'\)\)/, 'an overlay backdrop catches outside clicks');
  // The same helper mounts the type picker and the design-system picker.
  assert.match(text, /const dsAnchor = anchoredPopover\(\{/, 'the design-system control uses the helper');
  assert.match(text, /const typeAnchor = anchoredPopover\(\{/, 'the type control uses the same helper');
  assert.match(text, /panel: renderDesignSystemPanel\(\)/, 'the picker panel is passed to the helper');
  assert.match(text, /panel: renderTypeMenu\(\)/, 'the type panel is passed to the same helper');
  // One place owns the keyboard contract and the dialog role.
  assert.match(text, /options\.panel\.addEventListener\('keydown'/, 'the helper wires Escape/arrows once');
  assert.match(text, /options\.panel\.setAttribute\('role', 'dialog'\)/, 'the helper labels the panel a dialog');
  assert.match(text, /options\.panel\.setAttribute\('aria-label', options\.label\)/, 'the helper sets the aria-label');
  // The panels no longer duplicate the role or the Escape handling.
  assert.doesNotMatch(text, /panel\.setAttribute\('role', 'dialog'\)\n  panel\.setAttribute\('aria-label', 'Choose a design system'\)/, 'the panel no longer sets its own dialog role');

  const style = await readFile(new URL('../panel/styles.css', import.meta.url), 'utf8');
  assert.match(style, /\.ds-composer \{[^}]*position: relative/, 'the composer is the positioning context');
  assert.match(style, /\.ds-ds-anchor \{[^}]*display: inline-flex/, 'the anchor is a plain flex item, not a second containing block');
  assert.doesNotMatch(style, /\.ds-ds-anchor \{[^}]*position: relative/, 'the anchor must not push the panel off-screen');
  assert.match(style, /\.ds-ds-panel \{[^}]*position: absolute/, 'the picker is absolutely positioned, out of flow');
  assert.match(style, /\.ds-ds-backdrop \{[^}]*position: fixed/, 'the backdrop covers the frame');
  assert.match(style, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.ds-ds-panel \{ animation: none; \}/, 'the reveal honours reduced motion');
});

// FIX A: the type control opens the SAME anchored overlay as the design-system
// picker; the type list is DESIGN_TYPES (label + hint) and a click applies the
// type immediately (headline/chip/ideas) and closes.
test('the type picker is an anchored overlay that applies a type on click', async () => {
  const text = await readFile(new URL('../panel/main.ts', import.meta.url), 'utf8');
  assert.match(text, /chip\.addEventListener\('click', \(\) => toggleMenu\('type'\)\)/, 'the type chip opens the overlay');
  assert.match(text, /function renderTypeMenu\(/, 'one type-panel renderer');
  assert.match(text, /for \(const type of DESIGN_TYPES\)/, 'the list is the extension DESIGN_TYPES');
  assert.match(text, /PAGE_TYPE_LABELS\[type\]/, 'each row names the type');
  assert.match(text, /TYPE_HINT\[type\]/, 'each row carries the type hint');
  assert.match(text, /state\.pageType = type;[\s\S]*closeActiveOverlay\('type'\);/, 'clicking a type applies it and closes');
  assert.match(text, /panel\.append\(list, renderOptions\(\)\)/, 'Direction/Fidelity keep a home in the same overlay');
});

test('the chosen design system reaches the scaffold request', async () => {
  const text = await readFile(new URL('../panel/main.ts', import.meta.url), 'utf8');
  assert.match(text, /designSystemId: spec\.designSystemId \?\? undefined/, 'the scaffold request carries the field only when chosen');
  assert.match(text, /designSystemId: state\.pageDesignSystemId/, 'the page spec carries the choice');
});

test('the picker is styled and stacks on a narrow composer', async () => {
  const style = await readFile(new URL('../panel/styles.css', import.meta.url), 'utf8');
  for (const cls of ['.ds-ds-panel', '.ds-ds-search', '.ds-ds-list', '.ds-ds-detail', '.ds-ds-swatch', '.ds-ds-foot', '.ds-ds-trigger']) {
    assert.ok(style.includes(cls), `${cls} is styled`);
  }
  assert.match(style, /@media \(max-width: 520px\)/, 'the panel stacks on a narrow composer');
});

// ---- the popover interaction contract: one shared path for every overlay ----

test('nextOverlayState toggles, opens and switches with one overlay open at a time', () => {
  // A closed trigger opens its own overlay.
  assert.equal(nextOverlayState(null, 'ds'), 'ds');
  assert.equal(nextOverlayState(null, 'type'), 'type');
  assert.equal(nextOverlayState(null, 'attach'), 'attach');
  assert.equal(nextOverlayState(null, 'dir'), 'dir');
  // Clicking the open overlay's own trigger closes it.
  assert.equal(nextOverlayState('ds', 'ds'), null);
  assert.equal(nextOverlayState('type', 'type'), null);
  assert.equal(nextOverlayState('attach', 'attach'), null);
  assert.equal(nextOverlayState('dir', 'dir'), null);
  // Clicking a different trigger switches: the other opens, the first closes.
  assert.equal(nextOverlayState('ds', 'type'), 'type');
  assert.equal(nextOverlayState('type', 'attach'), 'attach');
  assert.equal(nextOverlayState('attach', 'ds'), 'ds');
  assert.equal(nextOverlayState('dir', 'ds'), 'ds');
});

test('all three composer triggers route through the one shared toggle path', async () => {
  const text = await readFile(new URL('../panel/main.ts', import.meta.url), 'utf8');
  assert.equal(count(text, 'function toggleMenu('), 1, 'there is exactly one toggle path');
  assert.match(text, /function toggleMenu\(which: OverlayId\)/);
  assert.match(text, /const next = nextOverlayState\(currentOverlay\(\), which\)/, 'the toggle is the shared pure rule');
  assert.match(text, /designSystem\.addEventListener\('click', \(\) => toggleMenu\('ds'\)\)/, 'the design-system trigger toggles');
  assert.match(text, /chip\.addEventListener\('click', \(\) => toggleMenu\('type'\)\)/, 'the type trigger toggles');
  assert.match(text, /plus\.addEventListener\('click', \(\) => toggleMenu\('attach'\)\)/, 'the attach trigger toggles');
  // Every trigger carries the id its toggle and focus-return use.
  assert.match(text, /designSystem\.dataset\.overlayTrigger = 'ds'/);
  assert.match(text, /chip\.dataset\.overlayTrigger = 'type'/);
  assert.match(text, /plus\.dataset\.overlayTrigger = 'attach'/);
  assert.match(text, /trigger\.dataset\.overlayTrigger = 'dir'/);
  // Only one overlay is ever left open.
  assert.doesNotMatch(text, /state\.dsMenuOpen = true/, 'opens go through the one rule, never a stray assignment');
});

test('an outside/backdrop click closes the overlay and never counts the backdrop as inside', async () => {
  const text = await readFile(new URL('../panel/main.ts', import.meta.url), 'utf8');
  assert.match(text, /function onPageWindowClick\(event: MouseEvent\)/, 'a frame-level outside-click handler exists');
  // The guard protects the panel and the trigger, but not the backdrop.
  assert.match(text, /target\?\.closest\('\.ds-ds-panel, \.ds-menu, \.ds-menu-trigger'\)/, 'the panel and trigger count as inside');
  assert.doesNotMatch(text, /closest\([^)]*ds-ds-anchor[^)]*\)/, 'the anchor (which holds the backdrop) is no longer treated as inside');
  assert.doesNotMatch(text, /closest\([^)]*ds-ds-backdrop[^)]*\)/, 'the backdrop is never guarded, so its clicks close');
  assert.match(text, /window\.addEventListener\('click', onPageWindowClick\)/, 'the handler is registered once for the frame');
});

test('Escape closes the open overlay and returns focus to its trigger', async () => {
  const text = await readFile(new URL('../panel/main.ts', import.meta.url), 'utf8');
  assert.match(text, /function onPageKeydown\(event: KeyboardEvent\)/, 'a frame-level keydown handler exists');
  assert.match(text, /event\.key !== 'Escape'/, 'it only reacts to Escape');
  assert.match(text, /if \(!currentOverlay\(\)\) return;/, 'it does nothing when no overlay is open');
  assert.match(text, /closeMenus\(true\)/, 'Escape closes through the shared path and refocuses');
  assert.match(text, /window\.addEventListener\('keydown', onPageKeydown\)/, 'the handler is registered');
});

test('a close returns focus to the trigger once the page is rebuilt', async () => {
  const text = await readFile(new URL('../panel/main.ts', import.meta.url), 'utf8');
  assert.match(text, /let refocusOverlayTrigger: OverlayId \| null = null/, 'a pending-focus latch exists');
  assert.match(text, /refocusOverlayTrigger = next === null \? which : null/, 'a trigger close records its trigger');
  assert.match(text, /refocusOverlayTrigger = refocus \? open : null/, 'an Escape close records the open overlay');
  assert.match(text, /function focusPendingTrigger\(\)/, 'a focus restorer exists');
  assert.match(text, /querySelector<HTMLElement>\(`\[data-overlay-trigger="\$\{id\}"\]`\)\?\.focus\(\)/, 'it focuses the trigger element');
  assert.match(text, /updateComposerState\(\);\n  focusPendingTrigger\(\);/, 'renderPage runs it after the rebuild');
});

test('selecting an item closes through the shared path', async () => {
  const text = await readFile(new URL('../panel/main.ts', import.meta.url), 'utf8');
  assert.match(text, /function closeActiveOverlay\(id: OverlayId\)/, 'one selection-close helper');
  assert.match(text, /state\.pageType = type;[\s\S]*closeActiveOverlay\('type'\)/, 'a type row closes through it');
  assert.match(text, /state\.pageDesignSystemId = findDesignSystem\(id\)\?\.id \?\? null;[\s\S]*closeActiveOverlay\('ds'\)/, 'a picker row closes through it');
  assert.match(text, /state\.selectedProjectId = id;[\s\S]*closeActiveOverlay\('dir'\)/, 'a directory row closes through it');
});

test('the composer lifts its triggers over the fixed backdrop while an overlay is open', async () => {
  const style = await readFile(new URL('../panel/styles.css', import.meta.url), 'utf8');
  assert.match(
    style,
    /\.ds-composer\.ds-overlay-open \.ds-menu-trigger \{ position: relative; z-index: 42; \}/,
    'a trigger stays clickable above the backdrop so it can toggle its own overlay shut',
  );
  // The anchor stays unpositioned so the panel keeps resolving against the composer.
  assert.doesNotMatch(style, /\.ds-ds-anchor \{[^}]*position: relative/);
});

// ---- per-chat config resolution (isolated `designs/<chat>` workspaces) ----

test('a design-chat row keeps the session’s own directory', () => {
  const view = designChatRows(
    [
      {
        projectId: 'p1',
        projectName: 'Site',
        snapshot: snapshot('ready', [session('s1', 'Isolated', { directory: '/p/site/designs/s1' })]),
      },
    ] as never,
    new Set(),
    new Set(['s1']),
  );
  assert.ok(view.kind === 'list');
  assert.equal(view.rows[0]!.directory, '/p/site/designs/s1', 'the chat resolves its config from its own directory');
  assert.equal(view.rows[0]!.config, null, 'the pure rule attaches no config; the IO layer reads it');
});

test('designChatMeta shows the chat config type and url, else its directory', () => {
  const base = { sessionId: 's1', projectId: 'p1', projectName: 'Site', title: 'T', updatedAt: 0 };
  assert.equal(
    designChatMeta({ ...base, directory: '/p/site/designs/s1', config: { type: 'hi-fi', url: 'http://localhost:5300' } }),
    'hi-fi · http://localhost:5300',
  );
  assert.equal(designChatMeta({ ...base, directory: '/p/site/designs/s1', config: { type: 'deck' } }), 'deck');
  assert.equal(designChatMeta({ ...base, directory: '/p/site/designs/s1', config: null }), '/p/site/designs/s1');
});

test('isDesignWorkspaceDir recognises a designs/ path segment', () => {
  assert.equal(isDesignWorkspaceDir('/p/site/designs/s1'), true);
  assert.equal(isDesignWorkspaceDir('/p/site/designs'), true);
  assert.equal(isDesignWorkspaceDir('designs'), true);
  assert.equal(isDesignWorkspaceDir('/p/site/designsX'), false, 'a lookalike segment is not a workspace');
  assert.equal(isDesignWorkspaceDir('/p/site'), false);
  assert.equal(isDesignWorkspaceDir(null), false);
});

test('an isolated chat directory resolves to itself as the design target', () => {
  const target = resolveDesignTarget({
    directory: '/p/site/designs/s7',
    selectedProjectId: null,
    projects: [registered('p1', 'Site', '/p/site')],
    rows: [],
  });
  assert.deepEqual(target, { kind: 'project', dir: '/p/site/designs/s7', projectId: 'p1', config: null });
  // When a row recorded the isolated dir's config, the target carries it.
  const withConfig = resolveDesignTarget({
    directory: '/p/site/designs/s7',
    selectedProjectId: null,
    projects: [registered('p1', 'Site', '/p/site')],
    rows: [{ id: 'p1', name: 'Site', directory: '/p/site/designs/s7', config: { type: 'hi-fi', url: 'http://localhost:5400' }, configError: null }],
  });
  assert.ok(withConfig.kind === 'project');
  assert.equal(withConfig.config?.url, 'http://localhost:5400');
  // A plain subdirectory still resolves to the containing project root.
  const nested = resolveDesignTarget({ directory: '/p/site/pages/about', selectedProjectId: null, projects: [registered('p1', 'Site', '/p/site')], rows: [] });
  assert.ok(nested.kind === 'project');
  assert.equal(nested.dir, '/p/site');
});

test('root workspace: retired isolation helpers and generated moves are absent', () => {
  for (const name of ['requestIsolation', 'isolateRequestRelPath', 'sessionToken', 'ISOLATE_REQUEST_DIR', 'DESIGNS_DIR_NAME', 'designWorkspacePath']) {
    assert.equal(name in api, false, `${name} is retired`);
  }
  assert.doesNotMatch(harnessPluginSource(), /session\.move|mkdirSync|\.design-studio\/isolate/);
});

test('the chats list reads each chat config from the chat’s own directory', async () => {
  const text = await readFile(new URL('../panel/main.ts', import.meta.url), 'utf8');
  assert.match(text, /async function withChatConfigs\(/, 'a per-chat config reader exists');
  assert.match(text, /const read = await getConfig\(row\.directory\)/, 'it reads the CHAT directory, not the project root');
  assert.match(text, /state\.designChats = \{ kind: 'list', rows: enriched \}/, 'the enriched rows replace the signal-only view');
});

test('a chat row opens the session and its own live window', async () => {
  const text = await readFile(new URL('../panel/main.ts', import.meta.url), 'utf8');
  assert.match(text, /await host\.openSession\(row\.sessionId\)/, 'the session is opened');
  assert.match(
    text,
    /await openProjectWindow\(\{ url \}, row\.directory \|\| state\.directory, false\)/,
    'the live window roots its dev server at the chat directory, silently',
  );
  assert.match(text, /const ready = projectReady\(row\.config\)/, 'the chat badge follows its own config');
  assert.match(text, /designChatMeta\(row\)/, 'the chat meta follows its own config');
});

// The local list owns only the Studio draft, never unreadable host attachments.
test('the page owns its removable draft without pretending to mirror host attachments', async () => {
  const text = await readFile(new URL('../panel/main.ts', import.meta.url), 'utf8');
  assert.match(text, /function renderReferenceDraft\(/, 'the local draft has one renderer');
  assert.match(text, /state\.references = removeDraftReference\(state\.references, id\)/, 'remove operates on real local references');
  assert.doesNotMatch(text, /chatReferences/, 'no local mirror state');
  assert.doesNotMatch(text, /REFERENCE_ROW_LIMIT/, 'the mirror cap is gone');
  // The attach still confirms success with a transient toast (the page's only
  // reference feedback).
  assert.match(text, /Project reference added to the composer\./, 'a project attach is confirmed by toast');
  assert.match(text, /File reference added to the composer\./, 'a file attach is confirmed by toast');
  const style = await readFile(new URL('../panel/styles.css', import.meta.url), 'utf8');
  assert.match(style, /\.ds-reference-list/, 'the local chip row is styled');
  assert.match(style, /\.ds-reference-remove/, 'the real remove control is styled');
});

// FIX 2: the page keeps its content off the frame edges — generous vertical
// padding plus a calm closing footer line, so scrolling never leaves content
// flush against the top or bottom.
test('the page has vertical padding and a closing footer line', async () => {
  const text = await readFile(new URL('../panel/main.ts', import.meta.url), 'utf8');
  assert.match(text, /function renderFooter\(/, 'a footer renderer exists');
  assert.match(text, /renderDesignSection\(\), renderFooter\(\)/, 'the footer closes the page');
  assert.match(text, /'Design Studio'/, 'the footer names the extension');
  assert.match(text, /ds-footer-hint/, 'the footer carries a one-line hint');
  const style = await readFile(new URL('../panel/styles.css', import.meta.url), 'utf8');
  assert.match(style, /\.ds-page-body \{[^}]*padding: 56px 20px 96px;/, 'generous vertical padding on the page body');
  assert.match(style, /\.ds-footer \{/, 'the footer is styled');
  assert.match(style, /\.ds-footer-name/, 'the footer name is styled');
  assert.match(style, /\.ds-enter \.ds-footer \{ animation:/, 'the footer joins the reveal');
});

// ---- FIX 3: a project row never starts a chat ----

// Clicking a project row selects it as the working target and filters the list
// to its design chats (`Open sessions`); a ready project also offers `Preview`,
// which raises the live window via `POST /open` and opens NO session. A chat row
// keeps `Open` → host.openSession. Nothing in the project-row path may reach the
// composer's start-session flow.
test('a project-row click selects and filters — it never starts a design session', async () => {
  const text = await readFile(new URL('../panel/main.ts', import.meta.url), 'utf8');
  const projectRowStart = text.indexOf('function renderProjectRow(');
  const chatRowStart = text.indexOf('function renderChatRow(');
  assert.ok(projectRowStart > 0 && chatRowStart > projectRowStart, 'row markers are present');

  const projectRow = text.slice(projectRowStart, chatRowStart);
  // The row routes its click to the selection + filter path…
  assert.match(projectRow, /open\.addEventListener\('click', \(\) => openProjectSessions\(row\)\)/, 'the row body opens the project sessions');
  // …and never to the start-session path.
  assert.doesNotMatch(projectRow, /startDesignSession/, 'a project row never starts a session');
  assert.doesNotMatch(projectRow, /startNewDesign/, 'a project row never runs the composer flow');
  assert.doesNotMatch(projectRow, /host\.startSession/, 'a project row never calls the host start-session API');

  // The selection action only sets the working target and the filter.
  const selectStart = text.indexOf('function openProjectSessions(');
  const previewStart = text.indexOf('async function previewProject(');
  const select = text.slice(selectStart, previewStart);
  assert.match(select, /state\.selectedProjectId = row\.id/, 'the project becomes the working target');
  assert.match(select, /state\.projectFilter = row\.id/, 'the list is filtered to its chats');
  assert.doesNotMatch(select, /startDesignSession|startNewDesign|host\.startSession/, 'selection starts nothing');

  // Preview raises the existing window through /open — no new session.
  const preview = text.slice(previewStart, chatRowStart);
  assert.match(preview, /await openProjectWindow\(\{ url \}, row\.directory, true\)/, 'Preview opens the project window');
  assert.doesNotMatch(preview, /startDesignSession|host\.startSession/, 'Preview creates no session');
  // Preview is offered only for a project that can actually do it.
  assert.match(projectRow, /if \(ready\) \{[\s\S]*ds-list-preview/, 'Preview appears only on a ready project');

  // A chat row still opens its session.
  const chatRow = text.slice(chatRowStart, text.indexOf('function openDesignChat('));
  assert.match(chatRow, /open\.addEventListener\('click', \(\) => void openDesignChat\(row\)\)/, 'a chat row opens its chat');
  assert.match(text, /await host\.openSession\(row\.sessionId\)/, 'the chat opens its session via host.openSession');

  // The filter has a plain reset, and the old start-a-session row action is gone.
  assert.match(text, /'Show all'/, 'the filter has a labelled reset');
  assert.match(text, /state\.projectFilter = null;/, 'the reset clears the filter');
  assert.doesNotMatch(text, /function openProjectRow\(/, 'the old start-a-session row action is gone');

  const style = await readFile(new URL('../panel/styles.css', import.meta.url), 'utf8');
  assert.match(style, /\.ds-list-preview/, 'the Preview action is styled');
  assert.match(style, /\.ds-section-reset/, 'the reset is styled');
  assert.match(style, /\.ds-list-open/, 'the row action button is styled');
});

// ---- the dev-server Start/Stop control: focus, stale config, dir captures ----
// The DOM shim here does not build the row, so the interaction wiring is pinned
// at the source level; the behaviour itself is exercised in server-stop.test.ts
// through the panel's test seams.

// U4: hiding the bar or the Start/Stop button while they hold focus must move
// focus to a visible element, never silently drop it to body.
test('hiding the bar or the Start/Stop control moves focus to the visible session line', async () => {
  const source = await readFile(new URL('../panel/main.ts', import.meta.url), 'utf8');
  // The fallback target is the always-visible session line, programmatically focusable.
  assert.match(source, /function focusSessionLine\(\)/, 'a focus fallback exists');
  assert.match(source, /sessionLineEl\.tabIndex = -1/, 'the session line is made focusable');
  assert.match(source, /sessionLineEl\.focus\(\)/, 'the fallback actually takes focus');
  assert.match(source, /function focusInside\(el: HTMLElement \| null\): boolean/, 'a focus-inside check exists');

  // renderRow: the readiness flip hides the interactive row (bar and hint).
  const rowStart = source.indexOf('function renderRow(');
  const row = source.slice(rowStart, source.indexOf('export async function applyState('));
  assert.match(
    row,
    /if \(!ready && \(focusInside\(barEl\) \|\| focusInside\(hintEl\)\)\) focusSessionLine\(\)/,
    'renderRow moves focus out of what it is hiding',
  );

  // renderServerControl: hiding the Start/Stop button itself.
  const controlStart = source.indexOf('function renderServerControl(');
  const control = source.slice(controlStart, source.indexOf('async function onServerControlClick('));
  assert.match(control, /const hadFocus = focusInside\(serverBtn\)/, 'the hidden control checks its own focus');
  assert.match(control, /if \(hadFocus\) focusSessionLine\(\)/, 'a hidden focused control hands focus to the session line');
});

// U8: a directory switch must keep the last config until the fresh read
// resolves — nulling it synchronously flickers the whole row hide→show.
test('a directory switch keeps the last config until the fresh read resolves', async () => {
  const source = await readFile(new URL('../panel/main.ts', import.meta.url), 'utf8');
  const start = source.indexOf('host.onDirectory((directory) => {');
  const end = source.indexOf('void loadStudioConfig();', start);
  assert.ok(start > 0 && end > start, 'the onDirectory handler is present');
  const handler = source.slice(start, end);
  assert.doesNotMatch(handler, /state\.config = null/, 'no synchronous config nulling: the row must not flicker');
  // The stale config is guarded: actions only use it for the CURRENT directory.
  assert.match(source, /function currentConfig\(\): StudioConfig \| null/);
  assert.match(source, /return state\.configDir === state\.directory \? state\.config : null;/);
});

// U3: the Start/Stop actions capture the directory at entry, commit only to
// that directory, and mark ownership with the captured dir — never a
// post-await `state.directory` read.
test('the Start/Stop actions capture the directory and never commit across a switch', async () => {
  const source = await readFile(new URL('../panel/main.ts', import.meta.url), 'utf8');
  const clickStart = source.indexOf('async function onServerControlClick(');
  const stopStart = source.indexOf('async function stopCurrentServer(');
  assert.ok(clickStart > 0 && stopStart > clickStart, 'the control functions are present');
  const clickAndStart = source.slice(clickStart, stopStart);
  // The config a click acts on belongs to the current directory.
  assert.match(clickAndStart, /currentConfig\(\)\?\.url\?\.trim\(\)/, 'the click uses the guarded config');
  // The start is sent for, committed to and owned by the captured dir.
  assert.match(clickAndStart, /const dir = state\.directory;/, 'the directory is captured at entry');
  assert.match(clickAndStart, /startDevServer\(dir, url\)/, 'the start call uses the captured dir');
  assert.match(clickAndStart, /markServerStartedByUs\(dir\)/, 'ownership marks the captured dir, never state.directory');
  assert.match(clickAndStart, /if \(directoryMovedSince\(dir, gen\)\) return;/, 'a mid-flight switch commits nothing');

  const stopEnd = source.indexOf('async function readStudioConfig(');
  const stop = source.slice(stopStart, stopEnd);
  assert.match(stop, /const dir = state\.directory;/, 'the stop path captures the directory too');
  assert.match(stop, /if \(directoryMovedSince\(dir, gen\)\) return;/, 'the stop path commits nothing across a switch');
});

// U1: the click must branch on the RENDERED state, so the amber "error — click
// to retry" icon retries by starting, never stops a healthy server.
test('the Start/Stop click branches on the rendered state, not the raw status bit', async () => {
  const source = await readFile(new URL('../panel/main.ts', import.meta.url), 'utf8');
  const clickStart = source.indexOf('async function onServerControlClick(');
  const clickEnd = source.indexOf('async function startCurrentServer(');
  const click = source.slice(clickStart, clickEnd);
  assert.match(click, /if \(state\.serverStatus && !state\.serverError\)/, 'stop only when running AND error-free');
  assert.doesNotMatch(click, /if \(state\.serverStatus\) \{/, 'the stale raw-status branch is gone');
});

// An unread state must not masquerade as a stopped "Start" affordance: before
// the first status read the control says it is checking. Behavioural coverage
// lives in server-stop.test.ts; the DOM shim here cannot build the row.
test('an unknown server state renders as checking, never as a stopped Start affordance', async () => {
  const source = await readFile(new URL('../panel/main.ts', import.meta.url), 'utf8');
  assert.match(source, /serverStatus: null as boolean \| null/, 'the state can represent unknown');
  const controlStart = source.indexOf('function renderServerControl(');
  const control = source.slice(controlStart, source.indexOf('async function onServerControlClick('));
  assert.match(control, /state\.serverStatus === null/, 'an unread state is its own branch');
  assert.match(control, /Checking the preview dev server…/, 'the affordance says it is checking');
});
