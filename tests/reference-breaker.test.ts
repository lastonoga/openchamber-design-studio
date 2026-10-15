// Local adversarial reference-draft regression probes; all five run by default.
// REFERENCE_BREAKER_MUTANT selects a bounded scratch-only adequacy fault.
// Production is never edited: even test-only private exports/mutants live in a
// bounded scratch copy. See tests/reference-repair-2026-10-13/ for evidence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, cp, mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { clampStartSessionRequest } from '@openchamber/sdk';

class FixtureNode {
  className = '';
  textContent = '';
  disabled = false;
  children: FixtureNode[] = [];
  handlers = new Map<string, () => void>();
  append(...nodes: FixtureNode[]): void { this.children.push(...nodes); }
  setAttribute(): void {}
  addEventListener(event: string, callback: () => void): void { this.handlers.set(event, callback); }
  click(): void { if (!this.disabled) this.handlers.get('click')?.(); }
}

(globalThis as { window?: unknown }).window = {
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  parent: { postMessage: () => undefined },
};
(globalThis as { document?: unknown }).document = {
  getElementById: () => ({ append: () => undefined }),
  documentElement: {},
  createElement: () => new FixtureNode(),
  createElementNS: () => new FixtureNode(),
};

const root = fileURLToPath(new URL('../', import.meta.url));
const approvedTemp = '/private/var/folders/hx/6ykzfqb5519dsfc25bzxxrzc0000gn/T/opencode';
const tempRoot = await access(approvedTemp).then(() => approvedTemp, () => tmpdir());
const scratch = await mkdtemp(join(tempRoot, 'reference-breaker-'));
await mkdir(join(scratch, 'panel'));
for (const name of ['api', 'attach-dialog', 'compose', 'craft', 'harness', 'main', 'mode', 'reference-draft', 'settings', 'tokens']) {
  await cp(join(root, 'panel', `${name}.ts`), join(scratch, 'panel', `${name}.ts`));
}
await cp(join(root, 'shared'), join(scratch, 'shared'), { recursive: true });
await symlink(join(root, 'node_modules'), join(scratch, 'node_modules'));
let source = await readFile(join(scratch, 'panel/main.ts'), 'utf8');
// Export-only seam: execute the real Ideas renderer/click handler, not a replica.
source += '\nexport { renderIdeas };\n';
const mutant = process.env.REFERENCE_BREAKER_MUTANT;
function replaceExactlyOnce(from: string, to: string): void {
  assert.equal(source.split(from).length - 1, 1, 'scratch mutant must match exactly once');
  source = source.replace(from, to);
}
if (mutant === 'stale-result') {
  replaceExactlyOnce("if (request !== referenceRequest || state.surface !== 'page') return;", "if (state.surface !== 'page') return;");
} else if (mutant === 'source-at-completion') {
  replaceExactlyOnce('sourceDirectory: resolved.sourceDirectory, label: fileBaseName(resolved.path)', 'sourceDirectory: attachProject().dir, label: fileBaseName(resolved.path)');
} else if (mutant === 'ideas-while-busy') {
  replaceExactlyOnce('    card.disabled = state.pageBusy;', '    card.disabled = false;');
  replaceExactlyOnce('      if (state.pageBusy) return;\n      state.prompt = idea.prompt;', '      state.prompt = idea.prompt;');
} else if (mutant === 'unconsumed-delivery') {
  replaceExactlyOnce("    if (spec.references !== undefined) {\n      cancelReferenceValidation();\n      state.references = [];\n      state.prompt = '';\n      attachPathDraft = '';\n      referenceError = '';\n    }", '    // Scratch fault: confirmed delivery does not consume its draft.');
} else if (mutant === 'unhandled-success-toast') {
  replaceExactlyOnce("    try {\n      await host.toast({ kind: 'success', message: 'Design session started — the brief widget is in its Work Status panel.' });\n    } catch {\n      /* Notification transport is not session-delivery failure. */\n    }", "    await host.toast({ kind: 'success', message: 'Design session started — the brief widget is in its Work Status panel.' });");
} else if (mutant === 'empty-reference-preflight') {
  replaceExactlyOnce('const submission = spec.references !== undefined', 'const submission = spec.references?.length');
} else {
  assert.equal(mutant, undefined, 'unknown scratch mutant');
}
await writeFile(join(scratch, 'panel/main.ts'), source);
const api = await import(pathToFileURL(join(scratch, 'panel/api.ts')).href) as typeof import('../panel/api.ts');
const main = await import(pathToFileURL(join(scratch, 'panel/main.ts')).href) as typeof import('../panel/main.ts') & { renderIdeas: () => FixtureNode };

type Request = { path: string; body?: string; query?: Record<string, string> };
type Result = { status: number; body: string };
type Session = Parameters<typeof clampStartSessionRequest>[0];
type Delivery = { sessionId: string; sent: string };
type Toast = { kind: string; message: string };
const host = api.host as unknown as {
  serviceRequest: (request: Request) => Promise<Result>;
  listProjects: () => Promise<unknown>;
  startSession: (request: Session) => Promise<Delivery>;
  openSession: (id: string) => Promise<void>;
  listSessions: () => Promise<unknown>;
  onSessions: () => () => void;
  toast: (toast: Toast) => Promise<void>;
  storage: { get: () => Promise<undefined>; set: () => Promise<void>; keys: () => Promise<string[]> };
};

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function valid(path: string, sourceDirectory = '/projects/site'): Result {
  return { status: 200, body: JSON.stringify({ ok: true, path, sourceDirectory }) };
}
async function page(): Promise<Session[]> {
  main.setSurface('page');
  main.resetReferenceDraft();
  main.setPrompt('Draft A: settings screen');
  main.setSelectedProject(null);
  main.setProjectDirectory('/projects/site');
  main.setSessionId(null);
  const sessions: Session[] = [];
  host.listProjects = async () => ({ kind: 'projects', state: 'ready', projects: [
    { id: 'p1', name: 'Site', directory: '/projects/site' },
    { id: 'p2', name: 'Deck', directory: '/projects/deck' },
  ] });
  host.serviceRequest = async (request) => {
    if (request.path === '/config') return { status: 200, body: JSON.stringify({ config: { version: 1, name: 'Site', url: 'http://localhost:5173' }, path: null }) };
    if (request.path === '/reference') {
      const body = JSON.parse(request.body || '{}') as { dir: string; path: string };
      return valid(`${body.dir}/${body.path}`, body.dir);
    }
    return { status: 200, body: JSON.stringify({ ok: true }) };
  };
  host.startSession = async (request) => {
    sessions.push(request);
    return { sessionId: `delivered-${sessions.length}`, sent: 'sent' };
  };
  host.openSession = async () => undefined;
  host.toast = async () => undefined;
  host.storage = { get: async () => undefined, set: async () => undefined, keys: async () => [] };
  host.listSessions = async () => ({ kind: 'sessions', state: 'ready', sessions: [] });
  host.onSessions = () => () => undefined;
  await main.loadProjects();
  await main.loadStudioConfig();
  return sessions;
}

test('A1 canceled validation A cannot corrupt replacement validation B', async () => {
  await page();
  const a = deferred<Result>();
  const b = deferred<Result>();
  host.serviceRequest = (request) => JSON.parse(request.body || '{}').path === 'a.ts' ? a.promise : b.promise;
  const pendingA = main.attachProjectPath('a.ts');
  main.resetReferenceDraft(); // same invalidation used by closing the Add overlay
  const pendingB = main.attachProjectPath('b.ts');
  let observed: unknown;
  try {
    a.resolve(valid('/projects/site/a.ts'));
    await pendingA;
    const draft = main.getPageDraft();
    observed = { pending: draft.pending, path: draft.path, error: draft.referenceError, paths: draft.references.map((ref) => ref.path) };
  } finally {
    b.resolve({ status: 400, body: JSON.stringify({ error: 'B does not exist' }) });
    await pendingB;
  }
  assert.deepEqual(observed, { pending: true, path: 'b.ts', error: '', paths: [] }, 'late A must leave B pending and untouched');
});

test('A2 pending source p1 survives target switch and submits to p2', async () => {
  const sessions = await page();
  const checked = deferred<Result>();
  const service = host.serviceRequest;
  host.serviceRequest = (request) => request.path === '/reference' ? checked.promise : service(request);
  const pending = main.attachProjectPath('src/app.ts');
  main.setSelectedProject('p2');
  checked.resolve(valid('/projects/site/src/app.ts'));
  await pending;
  await main.startNewDesign();
  const data = sessions[0]?.data as { references?: Array<{ path: string; sourceDirectory: string }> } | undefined;
  assert.deepEqual({ target: sessions[0]?.projectId, references: data?.references?.map(({ path, sourceDirectory }) => ({ path, sourceDirectory })) }, {
    target: 'p2', references: [{ path: '/projects/site/src/app.ts', sourceDirectory: '/projects/site' }],
  }, 'reference source must not become the delivery target');
});

test('A3 delivered A must not erase a newer Ideas draft B', async () => {
  await page();
  await main.attachProjectPath('src/app.ts');
  const delivery = deferred<Delivery>();
  const started = deferred<undefined>();
  host.startSession = async () => { started.resolve(undefined); return delivery.promise; };
  const sendingA = main.startNewDesign();
  await started.promise;
  const ideas = main.renderIdeas();
  const card = ideas.children[1]!.children[0]!;
  card.click(); // exact production click handler; FixtureNode respects disabled
  const newerPrompt = main.getPageDraft().prompt;
  delivery.resolve({ sessionId: 'sent-A', sent: 'sent' });
  await sendingA;
  const expected = newerPrompt === 'Draft A: settings screen' ? '' : newerPrompt;
  console.info('A3 evidence:', JSON.stringify({ ideaDisabled: card.disabled, newerPrompt, retainedPrompt: main.getPageDraft().prompt }));
  assert.equal(main.getPageDraft().prompt, expected, 'successful A may clear its own draft, never the newer clickable Ideas draft');
});

test('A4 toast rejection after delivery must not make the same references resendable', async () => {
  const sessions = await page();
  await main.attachProjectPath('src/app.ts');
  host.toast = async (toast) => { if (toast.kind === 'success') throw new Error('toast transport unavailable'); };
  await main.startNewDesign();
  const firstDraft = main.getPageDraft();
  host.toast = async () => undefined;
  await main.startNewDesign(); // retry the apparent failed attempt, without edits
  const referenceDeliveries = sessions.filter((session) => session.text?.includes('/projects/site/src/app.ts'));
  console.info('A4 evidence:', JSON.stringify({ retainedAfterDelivery: firstDraft.references.map((ref) => ref.path), firstError: firstDraft.error, referenceDeliveries: referenceDeliveries.length }));
  assert.deepEqual({ referenceDeliveries: referenceDeliveries.length, reportedDeliveryFailure: firstDraft.error }, { referenceDeliveries: 1, reportedDeliveryFailure: '' }, 'toast failure cannot make confirmed delivery failed or retryable');
});

test('B1 empty-reference page must reject 16001-character brief before SDK clamp', async () => {
  await page();
  const received: Session[] = [];
  host.startSession = async (request) => {
    received.push(clampStartSessionRequest(request)); // installed SDK behavior
    return { sessionId: 'silently-clamped', sent: 'sent' };
  };
  main.setPrompt('x'.repeat(16001));
  await main.startNewDesign();
  console.info('B1 evidence:', JSON.stringify({ hostCalls: received.length, sdkTextLength: received[0]?.text?.length, sdkHasMetadata: received[0]?.data !== undefined, retainedPromptLength: main.getPageDraft().prompt.length }));
  assert.equal(received.length, 0, 'oversized empty-reference draft must be rejected before host.startSession');
});
