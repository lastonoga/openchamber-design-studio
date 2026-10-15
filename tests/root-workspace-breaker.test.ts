// Bounded local adversarial probes. Production is read-only; all filesystem
// writes and neutralizations occur under the approved scratch root.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, cp, mkdir, mkdtemp, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const approved = '/private/var/folders/hx/6ykzfqb5519dsfc25bzxxrzc0000gn/T/opencode';
const temp = await access(approved).then(() => approved, () => tmpdir());
const scratch = await mkdtemp(path.join(temp, 'root-workspace-breaker-'));
// Genuine frozen old artifact supplied by the primary, never regenerated here.
const frozen = new URL('./root-workspace-2026-10-13/fixtures/design-studio-harness.before.txt', import.meta.url);
const oldSource = await readFile(frozen, 'utf8');
const pluginRel = '.opencode/plugin/design-studio-harness.ts';
const mutant = process.env.ROOT_WORKSPACE_BREAKER_MUTANT;
assert.ok(mutant === undefined || mutant === 'restore-isolation-write' || mutant === 'keep-old-plugin', 'known scratch mutant');
await mkdir(path.join(scratch, 'panel'));
await mkdir(path.join(scratch, 'service'));
for (const name of ['api', 'attach-dialog', 'compose', 'craft', 'harness', 'main', 'mode', 'reference-draft', 'settings', 'tokens']) {
  await cp(path.join(root, 'panel', `${name}.ts`), path.join(scratch, 'panel', `${name}.ts`));
}
await cp(path.join(root, 'shared'), path.join(scratch, 'shared'), { recursive: true });
await symlink(path.join(root, 'node_modules'), path.join(scratch, 'node_modules'));
function replaceOnce(source: string, from: string, to: string): string {
  assert.equal(source.split(from).length - 1, 1, 'scratch mutation must match exactly once');
  return source.replace(from, to);
}
let panelSource = await readFile(path.join(scratch, 'panel/main.ts'), 'utf8');
if (mutant === 'restore-isolation-write') {
  // Historical payload verified against the immutable built baseline at 1705–1708.
  panelSource = replaceOnce(panelSource, '    if (state.surface === \'page\') void loadDesignHome();', `    await host.serviceRequest({ method: 'PUT', path: '/config', query: { dir: spec.dir }, body: JSON.stringify({ path: '.design-studio/isolate/' + result.sessionId.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) + '.json', text: JSON.stringify({ sessionId: result.sessionId, at: new Date().toISOString() }) }) });
    if (state.surface === 'page') void loadDesignHome();`);
}
await writeFile(path.join(scratch, 'panel/main.ts'), panelSource);
let generatorSource = await readFile(path.join(root, 'service/harness-plugin.ts'), 'utf8');
if (mutant === 'keep-old-plugin') {
  generatorSource = replaceOnce(generatorSource, '  const source = harnessPluginSource();', `  const source = ${JSON.stringify(oldSource)};`);
}
await writeFile(path.join(scratch, 'service/harness-plugin.ts'), generatorSource);

(globalThis as { window?: unknown }).window = { addEventListener: () => undefined, removeEventListener: () => undefined, parent: { postMessage: () => undefined } };
(globalThis as { document?: unknown }).document = { getElementById: () => ({ append: () => undefined }), documentElement: {} };
const api = await import(pathToFileURL(path.join(scratch, 'panel/api.ts')).href) as typeof import('../panel/api.ts');
const main = await import(pathToFileURL(path.join(scratch, 'panel/main.ts')).href) as typeof import('../panel/main.ts');
const generator = await import(pathToFileURL(path.join(scratch, 'service/harness-plugin.ts')).href) as typeof import('../service/harness-plugin.ts');

type Event = { sessionID: string; system: Array<{ type: string; text: string }> };
type ToolEvent = { sessionID: string; status: string; tool: string };
type Move = { sessionID: string; directory: string };
type Plugin = { default: { setup: (ctx: unknown) => Promise<void> } };
async function loadPlugin(file: string): Promise<Plugin> {
  return import(pathToFileURL(file).href + `?instance=${Math.random()}`);
}
function runtime(directory: string): { ctx: unknown; moves: Move[]; context: (sessionID: string) => Promise<Event>; edit: (event: ToolEvent) => void } {
  const moves: Move[] = [];
  let context!: (event: Event) => Promise<void>;
  let edit!: (event: ToolEvent) => void;
  return {
    moves,
    ctx: {
      location: { directory }, storage: {},
      session: { hook: async (_name: string, fn: typeof context) => { context = fn; }, move: async (move: Move) => { moves.push(move); } },
      tool: { hook: async (_name: string, fn: typeof edit) => { edit = fn; } },
    },
    context: async (sessionID) => { const event = { sessionID, system: [] }; await context(event); return event; },
    edit: (event) => edit(event),
  };
}
async function putFixture(directory: string, relative: string, content: string | Uint8Array): Promise<void> {
  const file = path.resolve(directory, relative);
  assert.ok(file.startsWith(directory + path.sep), 'fixture writes confined to fake project');
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
}
const digest = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
async function snapshot(directory: string): Promise<Record<string, string>> {
  const inventory: Record<string, string> = {};
  async function walk(relative: string): Promise<void> {
    for (const entry of await readdir(path.join(directory, relative), { withFileTypes: true })) {
      const name = path.posix.join(relative, entry.name);
      if (name === pluginRel) continue; // only generated plugin bytes may refresh
      if (entry.isDirectory()) { inventory[name] = 'directory'; await walk(name); }
      else inventory[name] = digest(await readFile(path.join(directory, name)));
    }
  }
  await walk('');
  return inventory;
}

test('R1 current panel cannot arm delayed already-loaded old plugin after harness rejection', async () => {
  const project = await mkdtemp(path.join(scratch, 'mixed-project-'));
  const loadedOld = path.join(scratch, 'already-loaded-old.ts');
  await cp(frozen, loadedOld);
  const old = await loadPlugin(loadedOld);
  const running = runtime(project);
  await old.default.setup(running.ctx); // freeze old callback BEFORE delivery
  const requests: Array<{ method: string; path: string; query?: Record<string, string>; body?: string }> = [];
  const sessions: Array<{ projectId?: string; text?: string; worktree?: unknown }> = [];
  const host = api.host as unknown as {
    serviceRequest: (request: typeof requests[number]) => Promise<{ status: number; body: string }>;
    listProjects: () => Promise<unknown>; startSession: (request: typeof sessions[number]) => Promise<unknown>;
    openSession: () => Promise<void>; toast: () => Promise<void>; listSessions: () => Promise<unknown>;
    onSessions: () => Promise<() => void>;
    storage: { get: () => Promise<undefined>; set: () => Promise<void>; keys: () => Promise<string[]> };
  };
  host.serviceRequest = async (request) => {
    requests.push(request);
    if (request.method === 'PUT') {
      // Connect the recorded REAL panel payload to fake project files. Do not
      // invent an opt-in file on the unmutated path.
      const body = JSON.parse(request.body || '{}') as { path: string; text: string };
      assert.equal(request.query?.dir, project);
      await putFixture(project, body.path, body.text);
    }
    if (request.path === '/harness') throw new Error('refresh denied; already-loaded plugin remains old');
    if (request.path === '/config') return { status: 200, body: JSON.stringify({ config: { version: 1, name: 'Fixture', url: 'http://localhost:5173' }, path: null }) };
    if (request.path === '/reference') return { status: 200, body: JSON.stringify({ path: path.join(project, 'reference-R.svg'), sourceDirectory: project }) };
    return { status: 200, body: '{"ok":true}' };
  };
  host.listProjects = async () => ({ kind: 'projects', state: 'ready', projects: [{ id: 'selected-root', name: 'Fixture', directory: project }] });
  host.startSession = async (request) => { sessions.push(request); return { sessionId: 'ses_new_unique_S', sent: 'sent' }; };
  host.openSession = async () => undefined;
  host.toast = async () => undefined;
  host.storage = { get: async () => undefined, set: async () => undefined, keys: async () => [] };
  host.listSessions = async () => ({ kind: 'sessions', state: 'ready', sessions: [] });
  host.onSessions = async () => () => undefined; // no real SDK request/timeout timer
  main.setSurface('page');
  main.resetReferenceDraft();
  main.setPrompt('Keep this app at its selected registered root.');
  main.setSelectedProject('selected-root');
  main.setProjectDirectory(path.join(project, 'designs/legacy'));
  main.setSessionId(null);
  try {
    await main.loadProjects();
    await main.loadStudioConfig();
    await main.attachProjectPath('reference-R.svg');
    await main.startNewDesign(); // wait through failed ancillary refresh
    assert.equal(sessions.length, 1, 'one confirmed fixture send reached the SDK');
    assert.equal(sessions[0]!.projectId, 'selected-root');
    assert.ok(sessions[0]!.text?.includes(path.join(project, 'reference-R.svg')), 'reference R delivered explicitly');
    assert.ok(requests.some((request) => request.path === '/harness'), 'refresh failure actually exercised');
    await running.context('ses_new_unique_S'); // old callback runs only now
    const dirs = await readdir(project);
    const observed = { moves: running.moves.length, isolationWrites: requests.filter((request) => request.method === 'PUT').length, newPaths: dirs, worktree: sessions[0]!.worktree };
    console.info('R1 evidence:', JSON.stringify(observed));
    assert.deepEqual(observed, { moves: 0, isolationWrites: 0, newPaths: [], worktree: undefined }, 'current delivery must not arm old plugin relocation, even when refresh fails');
  } finally {
    main.setSurface('status');
    main.setSelectedProject(null);
  }
});

test('R2 refresh actual old disk artifact ignores stale and late requests without altering root or legacy fixtures', async () => {
  const project = await mkdtemp(path.join(scratch, 'refresh-project-'));
  await putFixture(project, pluginRel, oldSource);
  const fixtures: Record<string, string | Uint8Array> = {
    'app/index.html': '<main>existing root application</main>',
    '.design-studio.json': '{"url":"http://localhost:5173","command":"node server.mjs"}',
    'package.json': '{"type":"module","scripts":{"dev":"node server.mjs"}}',
    'server.mjs': 'export const fixture = "root-server-unchanged";\n',
    'screenshots/root.png': new Uint8Array([137,80,78,71,13,10,26,10,0,255]),
    'designs/legacy/app.html': '<main>legacy child application</main>',
    'designs/legacy/screenshots/old.png': new Uint8Array([137,80,78,71,1,2,3]),
    'designs/legacy/session.json': '{"sessionID":"ses_existing","directory":"designs/legacy"}',
    '.design-studio/isolate/ses_stale_S.json': '{"sessionId":"ses_stale_S"}',
  };
  for (const [name, content] of Object.entries(fixtures)) await putFixture(project, name, content);
  const before = await snapshot(project);
  await generator.writeHarnessPlugin(project);
  const artifact = path.join(project, pluginRel);
  const plugin = await loadPlugin(artifact); // import actual written disk, not generator output
  const running = runtime(project);
  await plugin.default.setup(running.ctx);
  const firstS = await running.context('ses_stale_S');
  await running.context('ses_late_T');
  const latePath = '.design-studio/isolate/ses_late_T.json';
  const lateContents = '{"sessionId":"ses_late_T"}';
  await putFixture(project, latePath, lateContents); // after T's first context
  running.edit({ sessionID: 'ses_stale_S', status: 'completed', tool: 'write' });
  const tBeforeEdit = await running.context('ses_late_T');
  running.edit({ sessionID: 'ses_late_T', status: 'completed', tool: 'patch' });
  const sAfterEdit = await running.context('ses_stale_S');
  const tAfterEdit = await running.context('ses_late_T');
  const sConsumed = await running.context('ses_stale_S');
  const legacy = runtime(path.join(project, 'designs/legacy'));
  await plugin.default.setup(legacy.ctx);
  await legacy.context('ses_existing');
  const expected = { ...before, [latePath]: digest(lateContents) };
  const after = await snapshot(project);
  console.info('R2 evidence:', JSON.stringify({ moves: running.moves.length + legacy.moves.length, inventoryUnchanged: JSON.stringify(Object.entries(after).sort()) === JSON.stringify(Object.entries(expected).sort()) }));
  assert.deepEqual({ moves: [...running.moves, ...legacy.moves], inventory: after }, { moves: [], inventory: expected }, 'refresh/context must preserve root, existing child, screenshots and request bytes/paths');
  assert.ok(firstS.system.some((item) => /You are an expert designer/.test(item.text)), 'refreshed disk plugin still injects harness');
  const nudged = (event: Event): boolean => event.system.some((item) => /A file was just edited in this Design Studio session/.test(item.text));
  assert.deepEqual([nudged(tBeforeEdit), nudged(sAfterEdit), nudged(tAfterEdit), nudged(sConsumed)], [false, true, true, false], 'sibling edit nudges are session-local and consumed once');
  const handwritten = await mkdtemp(path.join(scratch, 'handwritten-project-'));
  const manual = 'export default { id: "user-owned-plugin" };\n';
  await putFixture(handwritten, pluginRel, manual);
  await assert.rejects(generator.writeHarnessPlugin(handwritten), /refusing to overwrite/);
  assert.equal(await readFile(path.join(handwritten, pluginRel), 'utf8'), manual, 'existing handwritten guard remains intact; not independent adequacy evidence');
});
