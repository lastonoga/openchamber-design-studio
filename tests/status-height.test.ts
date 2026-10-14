// The compact session status row: brief-free content and measured height.
//
// These tests drive the REAL mount path — a fake host window answers the SDK
// `hello` with a `ready` message through the same postMessage contract the
// browser fixture uses, so `main()` builds the actual status row into a DOM
// recorder. They do not claim browser layout; the parent's fixture checks real
// geometry.
//
// Fail-before evidence (recorded against the pre-change baseline): the first
// two tests exercise only baseline-reachable behavior and FAIL there — the
// baseline builds the Brief & options disclosure and reports the hardcoded
// 84. The later tests use the `buildRow` test seam added with the change.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

type ServiceRequest = { method: string; path: string; query?: Record<string, string>; body?: string };

// ---- DOM recorder (established ComposerNode pattern, plus rects) ----

type Rect = { top: number; left: number; width: number; height: number; bottom: number; right: number };

function makeRect(height: number): Rect {
  return { top: 0, left: 0, width: 390, height, bottom: height, right: 390 };
}

class StatusNode {
  tagName: string;
  className = '';
  textContent = '';
  title = '';
  hidden = false;
  disabled = false;
  value = '';
  tabIndex = 0;
  placeholder = '';
  dataset: Record<string, string> = {};
  style = {
    setProperty: (name: string, value: string) => { (shimDocument.styleStore as Record<string, string>)[name] = value; },
    removeProperty: (name: string) => { delete (shimDocument.styleStore as Record<string, string>)[name]; },
  };
  children: StatusNode[] = [];
  attributes = new Map<string, string>();
  listeners = new Map<string, Array<() => void>>();
  rect: Rect = makeRect(0);
  marginTop = '0px';
  marginBottom = '0px';
  constructor(tag: string) { this.tagName = tag.toUpperCase(); }
  get classList() {
    const self = this;
    return {
      add: (...names: string[]) => { self.className = `${self.className} ${names.join(' ')}`.trim(); },
      remove: (...names: string[]) => {
        self.className = self.className.split(' ').filter((c) => c && !names.includes(c)).join(' ');
      },
      toggle: (name: string, on?: boolean) => {
        const on_ = on ?? !self.className.split(' ').includes(name);
        const names = self.className.split(' ').filter((candidate) => candidate && candidate !== name);
        if (on_) names.push(name);
        self.className = names.join(' ');
        return Boolean(on_);
      },
      contains: (name: string) => self.className.split(' ').includes(name),
    };
  }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  getAttribute(name: string): string | null { return this.attributes.get(name) ?? null; }
  append(...nodes: StatusNode[]): void { for (const node of nodes) if (node) this.children.push(node); }
  replaceChildren(...nodes: StatusNode[]): void { this.children = [...nodes]; }
  addEventListener(name: string, callback: () => void): void {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), callback]);
  }
  removeEventListener(): void { /* recorder: removal tracking is not needed */ }
  focus(): void { /* no browser focus engine */ }
  click(): void { for (const callback of this.listeners.get('click') ?? []) callback(); }
  contains(node: StatusNode | null): boolean {
    if (!node) return false;
    for (const child of this.children) if (child === node || child.contains(node)) return true;
    return false;
  }
  getBoundingClientRect(): Rect { return this.rect; }
  find(cls: string): StatusNode | undefined {
    return this.className.split(' ').includes(cls) ? this : this.children.map((child) => child.find(cls)).find(Boolean);
  }
  findAll(cls: string): StatusNode[] {
    const found: StatusNode[] = [];
    if (this.className.split(' ').includes(cls) || this.tagName === cls.toUpperCase()) found.push(this);
    for (const child of this.children) found.push(...child.findAll(cls));
    return found;
  }
}

// ---- fake ResizeObserver (Node has none; the panel guards `typeof`) ----

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  callback: () => void;
  targets: unknown[] = [];
  disconnected = false;
  constructor(callback: () => void) { this.callback = callback; FakeResizeObserver.instances.push(this); }
  observe(target: unknown): void { this.targets.push(target); }
  unobserve(): void { /* recorder */ }
  disconnect(): void { this.disconnected = true; }
  trigger(): void { if (!this.disconnected) this.callback(); }
}

// ---- fake host window: answers `hello` with `ready` over the real contract ----

type WindowShim = {
  getComputedStyle: (node: StatusNode) => { marginTop: string; marginBottom: string };
  addEventListener: (type: string, listener: (event: unknown) => void) => void;
  removeEventListener: (type: string, listener: (event: unknown) => void) => void;
  parent: { postMessage: (message: unknown, origin: string) => void };
};

const THEME_TOKENS = {
  background: '#17181b', elevated: '#202126', foreground: '#e7e7ea', muted: '#9a9aa2',
  subtle: '#1c1d21', border: '#2c2d33', hover: '#26272c', selection: '#2b3a5c',
  focus: '#4c8dff', primary: '#4c8dff', mutedSurface: '#1c1d21', elevatedForeground: '#e7e7ea',
  active: '#2f3037', selectionForeground: '#eef2ff', primaryForeground: '#ffffff',
  primaryText: '#ffffff', successText: '#e7e7ea', warningText: '#e7e7ea', errorText: '#e7e7ea',
  infoText: '#e7e7ea', success: '#46a758', warning: '#f5a524', error: '#e5484d', info: '#3b82f6',
  font: 'system-ui', mono: 'monospace', radius: '8px',
};

const ROW_DIRECTORY = '/projects/site';
const SESSION_ID = 'height-session-1';

let windowMessageListeners: Array<(event: unknown) => void> = [];
let setHeightCalls: number[] = [];
let setHeightReject = false;
let rejectedHeightCalls = 0;
let nextMeasuredHeight = 98;
const root = new StatusNode('div');
const html = new StatusNode('html');

const shimWindow: WindowShim = {
  getComputedStyle: (node) => ({ marginTop: node.marginTop, marginBottom: node.marginBottom }),
  addEventListener(type, listener) { if (type === 'message') windowMessageListeners.push(listener); },
  removeEventListener(type, listener) { windowMessageListeners = windowMessageListeners.filter((l) => l !== listener); },
  parent: {
    postMessage(message) {
      const data = message as { type?: string };
      if (data?.type !== 'hello') return;
      // Deferred so `main` finishes registering its listeners before the reply.
      setTimeout(() => {
        const ready = {
          channel: 'openchamber.sdk', v: 1, type: 'ready',
          payload: {
            theme: { mode: 'dark', tokens: THEME_TOKENS },
            locale: 'en-US',
            directory: ROW_DIRECTORY,
            session: { id: SESSION_ID, title: 'Height session', busy: false },
            surface: 'status',
            connection: { connected: true, account: 'fixture' },
            settings: {},
            item: null,
          },
        };
        for (const listener of [...windowMessageListeners]) {
          listener(new FakeMessageEvent('message', { data: ready, source: shimWindow.parent }));
        }
      }, 10);
    },
  },
};

const shimDocument = {
  styleStore: {} as Record<string, string>,
  getElementById: (id: string) => (id === 'root' ? root : null),
   createElement: (tag: string) => { const node = new StatusNode(tag); node.rect = makeRect(nextMeasuredHeight); return node; },
  createElementNS: (_ns: string, tag: string) => new StatusNode(tag),
  documentElement: html,
  activeElement: null,
  body: new StatusNode('body'),
  visibilityState: 'hidden',
};

(globalThis as { window?: unknown }).window = shimWindow;
(globalThis as { document?: unknown }).document = shimDocument;
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = FakeResizeObserver;
// The SDK's receive path gates on `event instanceof MessageEvent`; install a
// recorder-friendly class carrying `data` AND `source` before the import.
class FakeMessageEvent {
  data: unknown;
  source: unknown;
  constructor(_type: string, init: { data?: unknown; source?: unknown }) { this.data = init?.data; this.source = init?.source; }
}
(globalThis as { MessageEvent?: unknown }).MessageEvent = FakeMessageEvent;
// main() starts a poll interval once mounted; in tests it must never fire.
(globalThis as { setInterval?: unknown }).setInterval = (() => ({ unref() {} })) as unknown as typeof setInterval;

const api = await import('../panel/api.ts');
const main = await import('../panel/main.ts');

function stubService(handler: (request: ServiceRequest) => { status: number; body: string }): void {
  (api.host as unknown as { serviceRequest: (request: ServiceRequest) => Promise<{ status: number; body: string }> }).serviceRequest = async (request) => handler(request);
}

const hostStub = api.host as unknown as {
  setHeight: (height: number) => Promise<void>;
  storage: { get: (key: string) => Promise<undefined>; set: () => Promise<void>; delete: () => Promise<void>; keys: () => Promise<string[]> };
};

hostStub.setHeight = async (height: number) => {
  setHeightCalls.push(height);
  if (setHeightReject) { rejectedHeightCalls++; throw new Error('HOST_UNAVAILABLE: fixture teardown'); }
};
hostStub.storage = {
  get: async () => undefined,
  set: async () => undefined,
  delete: async () => undefined,
  keys: async () => [],
};

stubService((request) => {
  if (request.path === '/config') return { status: 200, body: JSON.stringify({ config: { version: 1, name: 'Site', type: 'hi-fi', url: 'http://localhost:5173', entry: 'index.html' }, path: `${ROW_DIRECTORY}/.design-studio.json` }) };
  if (request.path === '/state') return { status: 200, body: JSON.stringify({ url: 'http://localhost:5173/', title: 'Site', lastPick: null, pickSeq: 0, windowOpen: false }) };
  if (request.path === '/server/status') return { status: 200, body: JSON.stringify({ up: false, port: null }) };
  return { status: 200, body: JSON.stringify({ ok: true }) };
});

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 15));

async function mounted(): Promise<StatusNode> {
  for (let i = 0; i < 50; i++) {
    const section = root.find('ds-statusmode');
    if (section) return section;
    await tick();
  }
  assert.fail('the status row never mounted');
}

/** Post-implementation only: rebuild the row through the `buildRow` seam. */
function freshMount(measuredHeight: number): void {
  const buildRow = (main as unknown as { buildRow?: (root: StatusNode) => void }).buildRow;
  if (typeof buildRow !== 'function') {
    assert.fail('the buildRow test seam is expected after the change (fail-before is proven by the two tests above)');
  }
  setHeightCalls = [];
  nextMeasuredHeight = measuredHeight;
  FakeResizeObserver.instances = [];
  root.replaceChildren();
  main.setSurface('status');
  setProjectDirectory(ROW_DIRECTORY);
  setStudioConfig({ version: 1, name: 'Site', type: 'hi-fi', url: 'http://localhost:5173', entry: 'index.html' });
  buildRow.call(null, root);
  const section = root.find('ds-statusmode');
  assert.ok(section, 'the rebuilt row is mounted');
  section!.rect = makeRect(measuredHeight);
}

/** The mounted status section, asserted present. */
function statusSection(): StatusNode {
  const section = root.find('ds-statusmode');
  assert.ok(section, 'the status row is mounted');
  return section;
}

const { setProjectDirectory } = main;
const { setSurface } = main;
const { setStudioConfig } = main;

// ---- fail-before (baseline-reachable behavior; both FAIL on the baseline) ----

test('the mounted status row builds no Brief & options block', async () => {
  await mounted();
  assert.equal(root.findAll('ds-more').length, 0, 'the mounted row renders no Brief & options disclosure node');
  assert.equal(root.findAll('ds-miniform').length, 0, 'no micro-brief form node in the mounted row');
  assert.equal(root.findAll('ds-brief').length, 0, 'no brief textarea node in the mounted row');
  const source = await readFile(new URL('../panel/main.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /'ds-more'/, 'no Brief & options disclosure is built');
  assert.doesNotMatch(source, /'ds-miniform'/, 'no micro-brief form is built');
  assert.doesNotMatch(source, /ds-brief/, 'no brief textarea is built');
  assert.doesNotMatch(source, /Fill composer with brief/, 'the fill-composer action is gone with the block');

  const details = root.findAll('ds-more');
  assert.deepEqual(details, [], 'the mounted row renders no Brief & options disclosure node');
  assert.equal(root.findAll('ds-miniform').length, 0, 'no micro-brief form node in the mounted row');
  assert.equal(root.findAll('ds-brief').length, 0, 'no brief textarea node in the mounted row');
});

test('the reported frame height is measured content, never the hardcoded 84/320', async () => {
  await mounted();
  const section = (await mounted())!;
  section.rect = makeRect(98);
  const observer = FakeResizeObserver.instances.at(-1);
  observer?.trigger();
  await tick();
  assert.ok(setHeightCalls.length > 0, 'the row reports a height to the host');
  assert.deepEqual(
    setHeightCalls,
    [98],
    `every report must be the measured content height, got ${JSON.stringify(setHeightCalls)} — hardcoded constants are the bug`,
  );
});

// ---- post-implementation regressions (need the buildRow seam) ----

test('the reported height dedupes and follows growth', async () => {
  freshMount(98);
  const countAfterMount = setHeightCalls.length;
  const observer = FakeResizeObserver.instances.at(-1)!;
  assert.ok(observer, 'the row observes its own content size');
  assert.equal(observer.disconnected, false);
  assert.equal(observer.targets.length, 1, 'the observed root is the status section');

  observer.trigger();
  observer.trigger();
  assert.equal(setHeightCalls.length, countAfterMount, 'no duplicate report for an unchanged size');

  statusSection().rect = makeRect(120);
  observer.trigger();
  assert.deepEqual(setHeightCalls.slice(countAfterMount), [120], 'one report per real size change');

  statusSection().rect = makeRect(120.4);
  observer.trigger();
  assert.equal(setHeightCalls.length, countAfterMount + 1, '±1px integer jitter is not reported');
  statusSection().rect = makeRect(122.1);
  observer.trigger();
  assert.deepEqual(setHeightCalls.slice(countAfterMount), [120, 123], 'fractional growth rounds UP, not down');
});

test('a superseded mount disconnects the previous observer', async () => {
  freshMount(98);
  const first = FakeResizeObserver.instances.at(-1)!;
  const oldRoot = statusSection();
  freshMount(98);
  assert.equal(first.disconnected, true, 'the replaced row no longer observes');
  const second = FakeResizeObserver.instances.at(-1)!;
  assert.notEqual(second, first, 'a fresh observer serves the fresh row');
  assert.equal(second.targets[0], statusSection(), 'the fresh observer captures the new content root');
  oldRoot.rect = makeRect(200);
  statusSection().rect = makeRect(160);
  const beforeStale = setHeightCalls.length;
  first.callback(); // a notification already queued before disconnect
  assert.equal(setHeightCalls.length, beforeStale, 'a stale callback cannot report either old or new content');
  second.trigger();
  assert.deepEqual(setHeightCalls, [98, 160], 'only the live observer reports the live row');
});

test('a host rejection is swallowed, never an unhandled rejection', async () => {
  const rejections: unknown[] = [];
  const onRejection = (reason: unknown) => { rejections.push(reason); };
  process.on('unhandledRejection', onRejection);
  setHeightReject = true;
  rejectedHeightCalls = 0;
  try {
    freshMount(98);
    const observer = FakeResizeObserver.instances.at(-1)!;
    statusSection().rect = makeRect(140);
    observer.trigger();
    await tick();
    assert.equal(rejectedHeightCalls, 2, 'the host REALLY rejected the initial and changed-height reports');
    observer.trigger();
    observer.trigger();
    await tick();
    assert.equal(rejectedHeightCalls, 2, 'a failed unchanged height is not retried eagerly');
    statusSection().rect = makeRect(170);
    observer.trigger();
    await tick();
    assert.equal(rejectedHeightCalls, 3, 'the next actual size change may report again');
    assert.equal(rejections.length, 0, 'setHeight failures are caught, not floated');
  } finally {
    setHeightReject = false;
    process.off('unhandledRejection', onRejection);
  }
});

test('the height report is status-surface only: the rail never reports', async () => {
  freshMount(98);
  const count = setHeightCalls.length;
  main.setSurface('panel');
  const observer = FakeResizeObserver.instances.at(-1)!;
  statusSection().rect = makeRect(150);
  observer.trigger();
  assert.equal(setHeightCalls.length, count, 'a non-status surface never calls setHeight');
  main.setSurface('page');
  observer.trigger();
  assert.equal(setHeightCalls.length, count, 'the creation page never calls setHeight');
  main.setSurface('status');
});

test('measurement includes content border-box and external vertical margins without frame feedback', () => {
  freshMount(100.2);
  const section = statusSection();
  section.marginTop = '2px';
  section.marginBottom = '3px';
  shimDocument.body.marginTop = '6px';
  shimDocument.body.marginBottom = '6px';
  root.rect = makeRect(300);
  shimDocument.body.rect = makeRect(300);
  try {
    FakeResizeObserver.instances.at(-1)!.trigger();
    assert.equal(setHeightCalls.at(-1), 118, '100.2 border-box + 5 root margins + 12 body margins rounds to 118');
    root.rect = makeRect(118);
    shimDocument.body.rect = makeRect(118);
    FakeResizeObserver.instances.at(-1)!.trigger();
    assert.deepEqual(setHeightCalls, [101, 118], 'changing the full-height frame roots cannot feed back into reporting');
  } finally {
    shimDocument.body.marginTop = '0px';
    shimDocument.body.marginBottom = '0px';
  }
});

test('the row keeps exactly two controls and the two text lines', async () => {
  freshMount(98);
  const bar = statusSection().find('ds-rowline');
  assert.ok(bar, 'the control bar exists');
  const buttons = bar!.findAll('button').length;
  assert.equal(buttons, 2, `the bar has exactly two controls, found ${buttons}`);
  assert.ok(statusSection().find('ds-sessionline'), 'the session status line exists');
  assert.ok(statusSection().find('ds-hintline'), 'the ⌘-click hint exists');
  assert.equal(statusSection().find('ds-more'), undefined, 'no disclosure node in the mounted row');
});
