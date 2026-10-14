// The generated OpenCode v2 harness plugin. Chrome-free: these tests only write
// into temp project dirs and inspect the bytes. The plugin shape itself was
// verified against the OpenChamber-bundled OpenCode v2.0.27 binary (see the
// recon note at the top of service/harness-plugin.ts); here we pin that the
// generator emits that shape, is idempotent, and refuses to clobber user files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  HARNESS_MARKER,
  HARNESS_PLUGIN_ID,
  HARNESS_PLUGIN_REL,
  harnessPluginSource,
  writeHarnessPlugin,
} from '../service/harness-plugin.ts';
import { CRAFT_RULES, DESIGN_WORKSPACE_NOTE, VERIFY_PROTOCOL, defaultCraft, harnessRulesText } from '../shared/harness-text.ts';
import { VERIFY_PROTOCOL as PANEL_VERIFY_PROTOCOL } from '../panel/mode.ts';
import { CRAFT_RULES as PANEL_CRAFT_RULES, defaultCraft as panelDefaultCraft } from '../panel/craft.ts';

// Historical request path exists only in fixtures: production must ignore it.
const ISOLATE_REQUEST_DIR = '.design-studio/isolate';

async function tempProject(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'ds-harness-'));
}

test('the generated plugin has the confirmed v2 shape and the harness sections', () => {
  const source = harnessPluginSource();
  // Banner / marker, so re-runs recognise their own output.
  assert.match(source, new RegExp(HARNESS_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  // Default export with id + async setup(ctx) — the verified v2 plugin shape.
  assert.match(source, /export default \{/);
  assert.match(source, new RegExp(`id: "${HARNESS_PLUGIN_ID}"`));
  assert.match(source, /async setup\(ctx\) \{/);
  // The confirmed hooks: context injection + post-edit verification nudge.
  assert.match(source, /ctx\.session\.hook\("context", async \(event\) => \{/);
  assert.match(source, /event\.system\.push\(\{ type: "text", text: HARNESS_RULES \}\)/);
  assert.match(source, /ctx\.tool\.hook\("execute\.after", \(event\) => \{/);
  assert.match(source, /event\.status !== "completed"/);
  // The harness text is inlined verbatim, JSON-encoded (no template-literal hazard).
  assert.ok(source.includes(`const HARNESS_RULES = ${JSON.stringify(harnessRulesText())}`), 'inlined harness rules match the shared source');
});

test('the inlined rules carry identity, authority, craft, protocol and mandate', () => {
  const source = harnessPluginSource();
  assert.match(source, /You are an expert designer/);
  assert.match(source, /DESIGN\.md and tokens\.css \(when present\)/);
  assert.match(source, /### verification/);
  assert.match(source, /### anti-slop/);
  assert.match(source, /overflow → design tokens → accessibility → semantics → layout/);
  assert.match(source, /at most 5 fix\/verify iterations OR 10 minutes/);
  assert.match(source, /Verify at every stage/);
});

test('writeHarnessPlugin writes the file under the project and is idempotent', async () => {
  const dir = await tempProject();

  const first = await writeHarnessPlugin(dir);
  assert.equal(first.path, HARNESS_PLUGIN_REL);
  assert.equal(first.created, true);
  assert.equal(first.updated, false);
  assert.equal(first.changed, true);

  const file = path.join(dir, HARNESS_PLUGIN_REL);
  assert.equal(await readFile(file, 'utf8'), harnessPluginSource());

  const second = await writeHarnessPlugin(dir);
  assert.deepEqual(second, { path: HARNESS_PLUGIN_REL, created: false, updated: false, changed: false });
  assert.equal(await readFile(file, 'utf8'), harnessPluginSource(), 'second call leaves identical bytes');
});

test('writeHarnessPlugin refreshes a stale generated file in place', async () => {
  const dir = await tempProject();
  const file = path.join(dir, HARNESS_PLUGIN_REL);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `// ${HARNESS_MARKER}\n// stale body\n`, 'utf8');

  const result = await writeHarnessPlugin(dir);
  assert.equal(result.updated, true);
  assert.equal(result.changed, true);
  assert.equal(await readFile(file, 'utf8'), harnessPluginSource());
});

test('writeHarnessPlugin refuses to overwrite a file it did not generate', async () => {
  const dir = await tempProject();
  const file = path.join(dir, HARNESS_PLUGIN_REL);
  await mkdir(path.dirname(file), { recursive: true });
  const handWritten = 'export default { id: "mine" }\n';
  await writeFile(file, handWritten, 'utf8');

  await assert.rejects(() => writeHarnessPlugin(dir), /refusing to overwrite/);
  assert.equal(await readFile(file, 'utf8'), handWritten, 'the user file is untouched');
});

test('the shared harness text is the one the panel renders', () => {
  // The panel re-exports exactly the shared objects, so the prompt text and the
  // injected plugin text can never drift apart.
  assert.equal(PANEL_VERIFY_PROTOCOL, VERIFY_PROTOCOL);
  assert.equal(PANEL_CRAFT_RULES, CRAFT_RULES);
  assert.equal(panelDefaultCraft(['typography', 'color']), defaultCraft(['typography', 'color']));
  assert.ok(harnessRulesText().includes(VERIFY_PROTOCOL), 'the full block embeds the shared protocol verbatim');
});

// ---- the per-chat design workspace (the workspace note + the opt-in move) ----

test('the generated source has no relocation or isolation filesystem machinery', () => {
  const source = harnessPluginSource();
  assert.doesNotMatch(source, /mkdirSync|readFileSync|session\.move|ISOLATE_DIR|shouldIsolate/);
  assert.ok(source.includes(`const WORKSPACE_NOTE = ${JSON.stringify(DESIGN_WORKSPACE_NOTE)}`), 'the note is inlined verbatim');
  assert.doesNotMatch(source, /workspace is EMPTY|scaffold the project HERE/);
});

test('the workspace note preserves root apps and legacy session directories', () => {
  assert.match(DESIGN_WORKSPACE_NOTE, /selected registered design project itself is the workspace/);
  assert.match(DESIGN_WORKSPACE_NOTE, /reuse the existing app/);
  assert.match(DESIGN_WORKSPACE_NOTE, /legacy child directories stay there/);
});

/** Import the generated plugin as real ESM from a temp file. */
async function loadGeneratedPlugin(dir: string): Promise<{ default: { setup: (ctx: unknown) => Promise<void> } }> {
  const file = path.join(dir, 'plugin.mjs');
  await writeFile(file, harnessPluginSource(), 'utf8');
  return import(pathToFileURL(file).href);
}

type Move = { sessionID: string; directory: string };
type ContextEvent = { sessionID: string; system: Array<{ type: string; text: string }> };

function fakeCtx(directory: string): { ctx: unknown; moves: Move[]; context: (event: ContextEvent) => Promise<unknown> } {
  const moves: Move[] = [];
  let context: ((event: ContextEvent) => Promise<unknown>) | null = null;
  const ctx = {
    location: { directory },
    storage: {},
    session: {
      hook: async (name: string, fn: (event: ContextEvent) => Promise<unknown>) => {
        if (name === 'context') context = fn;
      },
      move: async (arg: Move) => {
        moves.push(arg);
      },
    },
    tool: { hook: async () => undefined },
  };
  return {
    ctx,
    moves,
    context: (event: ContextEvent) => {
      if (!context) throw new Error('context hook was not registered');
      return context(event);
    },
  };
}

test('root workspace: stale isolation request cannot mkdir or move a session', async () => {
  const dir = await tempProject();
  const requests = path.join(dir, ISOLATE_REQUEST_DIR);
  await mkdir(requests, { recursive: true });
  await writeFile(path.join(requests, 'ses_abc123.json'), '{"sessionId":"ses_abc123"}', 'utf8');

  const plugin = await loadGeneratedPlugin(dir);
  const { ctx, moves, context } = fakeCtx(dir);
  await plugin.default.setup(ctx);

  const event: ContextEvent = { sessionID: 'ses_abc123', system: [] };
  await context(event);

  assert.equal(moves.length, 0, 'a stale request must not relocate the selected root');
  assert.equal(existsSync(path.join(dir, 'designs')), false, 'no empty child workspace is created');
  assert.equal(await readFile(path.join(requests, 'ses_abc123.json'), 'utf8'), '{"sessionId":"ses_abc123"}', 'stale files are ignored, not deleted');
  assert.ok(event.system.some((entry) => /Design Studio harness/.test(entry.text)), 'the harness still applies');
  assert.ok(!event.system.some((entry) => /workspace is EMPTY|scaffold the project HERE/.test(entry.text)), 'existing root app must not be treated as empty');

  // A SECOND context call for the same session never moves again (the Set guard).
  await context({ sessionID: 'ses_abc123', system: [] });
  assert.equal(moves.length, 0, 'later turns must also preserve the root');
});

test('the generated plugin does nothing when the opt-in gate says no', async () => {
  const dir = await tempProject();
  const plugin = await loadGeneratedPlugin(dir);

  // No request file for this session → no move, and no workspace note.
  const first = fakeCtx(dir);
  await plugin.default.setup(first.ctx);
  const event: ContextEvent = { sessionID: 'ses_plain', system: [] };
  await first.context(event);
  assert.equal(first.moves.length, 0, 'a session with no request file is never moved');
  assert.ok(!event.system.some((entry) => /per-chat design workspace/.test(entry.text)), 'and gets no workspace note');

  // An opted-in session already inside a designs/ path is never moved again.
  const isolated = path.join(dir, 'designs', 'ses-other');
  await mkdir(path.join(isolated, ISOLATE_REQUEST_DIR), { recursive: true });
  await writeFile(path.join(isolated, ISOLATE_REQUEST_DIR, 'ses_ready.json'), '{}', 'utf8');
  const second = fakeCtx(isolated);
  await plugin.default.setup(second.ctx);
  await second.context({ sessionID: 'ses_ready', system: [] });
  assert.equal(second.moves.length, 0, 'a session already inside designs/ is never moved');
});
