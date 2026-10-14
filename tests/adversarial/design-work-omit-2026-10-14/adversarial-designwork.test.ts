// Independent adversarial pass (breaker lane) over `designWorkRows`' new
// `options.omitChatProjectIds` (panel/api.ts) and the `renderDesignSection`
// wiring (panel/main.ts). Attacks the omission contract's failure modes the
// appended suite tests do not pin: state precedence UNDER options, duplicate
// project ids, exact-id matching (prefix / case), sort stability under ties,
// input purity, and the renderer's omit-set derivation at source level — the
// same way this suite pins main.ts by source text elsewhere.
//
// Run: node --test --test-concurrency=1 tests/adversarial/design-work-omit-2026-10-14/adversarial-designwork.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { DesignChatRow, DesignChatsView, DesignWorkRow, ProjectRow, ProjectsView } from '../../../panel/api.ts';

// Same shim contract as tests/panel-open.test.ts: the SDK's connectHost()
// needs a `window` before panel/api.ts is imported.
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

const { designWorkRows } = await import('../../../panel/api.ts');

function projectRow(id: string, name: string): ProjectRow {
  return { id, name, directory: `/p/${id}`, config: { type: 'hi-fi', url: 'http://localhost:5173' }, configError: null };
}

function chatRow(sessionId: string, projectId: string, updatedAt: number): DesignChatRow {
  return { sessionId, projectId, projectName: 'Site', title: `Chat ${sessionId}`, directory: '/p/site', config: null, configError: null, updatedAt };
}

const listed: ProjectsView = { kind: 'list', rows: [projectRow('p1', 'Site')] };
type ChatsList = Extract<DesignChatsView, { kind: 'list' }>;
const chatsOf = (...rows: DesignChatRow[]): ChatsList => ({ kind: 'list', rows });
const omitting = (...ids: string[]): { omitChatProjectIds: Set<string> } => ({ omitChatProjectIds: new Set(ids) });
const sequence = (view: { kind: 'list'; rows: ReadonlyArray<DesignWorkRow> }): string[] =>
  view.rows.map((row) => (row.kind === 'project' ? `project:${row.project.id}` : `chat:${row.chat.sessionId}`));

test('with omit options a chats-source error still takes the merged error state', () => {
  const view = designWorkRows(listed, { kind: 'error', message: 'Could not load design chats for Site.' }, omitting('p1'));
  assert.ok(view.kind === 'error', 'an options object must not mask a chats-source failure');
  assert.equal(view.message, 'Could not load design chats for Site.', 'the chats error message itself surfaces');
});

test('with omit options a projects-source error still outranks a chats-source error', () => {
  const view = designWorkRows(
    { kind: 'error', message: 'Could not load projects.' },
    { kind: 'error', message: 'Could not load design chats for Site.' },
    omitting('p1'),
  );
  assert.ok(view.kind === 'error');
  assert.equal(view.message, 'Could not load projects.', 'the projects message wins when both sources failed');
});

test('with omit options a loading source still holds the merged list loading, in both directions', () => {
  assert.equal(
    designWorkRows(listed, { kind: 'loading' }, omitting('p1')).kind,
    'loading',
    'a loading chats source keeps the merged list loading even with an omit set',
  );
  assert.equal(
    designWorkRows({ kind: 'loading' }, chatsOf(chatRow('s1', 'p1', 10)), omitting('p1')).kind,
    'loading',
    'a loading projects source keeps the merged list loading even with an omit set',
  );
});

test('duplicate listed project ids keep both rows and omit their shared chats once', () => {
  const view = designWorkRows(
    { kind: 'list', rows: [projectRow('p1', 'Site'), projectRow('p1', 'Site again')] },
    chatsOf(chatRow('s1', 'p1', 10), chatRow('s2', 'p9', 5)),
    omitting('p1'),
  );
  assert.ok(view.kind === 'list');
  assert.deepEqual(
    view.rows.map((row) => (row.kind === 'project' ? `project:${row.project.id}` : `chat:${row.chat.sessionId}`)),
    ['project:p1', 'project:p1', 'chat:s2'],
    'both duplicate rows stay in workspace order; the shared-id chat is omitted exactly once',
  );
});

test('the renderer derives the omit set from the listed project rows only, and passes it only unfiltered', async () => {
  const text = await readFile(new URL('../../../panel/main.ts', import.meta.url), 'utf8');
  assert.match(
    text,
    /const listedIds = state\.projects\?\.kind === 'list' \? new Set\(state\.projects\.rows\.map\(\(row\) => row\.id\)\) : new Set<string>\(\);/,
    'the omit set is built from the LISTED project rows, so a config-less project that dropped out keeps its chats',
  );
  assert.match(
    text,
    /state\.projectFilter\s*\?\s*undefined\s*:\s*\{\s*omitChatProjectIds/,
    'the omit set is passed only when no project filter is active, so Open sessions keeps its chats',
  );
  assert.doesNotMatch(
    text,
    /omitChatProjectIds:(?!\s*listedIds\b)/,
    'nothing but the listed-rows set is ever passed as the omit set',
  );
});

test('designWorkRows never mutates its inputs and returns a fresh list', () => {
  const chats = chatsOf(chatRow('s1', 'p2', 5), chatRow('s2', 'p9', 10), chatRow('s3', 'p1', 100));
  const projects: ProjectsView = { kind: 'list', rows: [projectRow('p1', 'Site')] };
  const options = omitting('p1');
  Object.freeze(chats.rows);
  for (const row of chats.rows) Object.freeze(row);
  Object.freeze(projects.rows);
  for (const row of projects.rows) Object.freeze(row);
  Object.freeze(options);
  const chatsBefore = structuredClone(chats.rows);
  const setIdsBefore = [...options.omitChatProjectIds];
  const first = designWorkRows(projects, chats, options);
  const second = designWorkRows(projects, chats, options);
  assert.ok(first.kind === 'list' && second.kind === 'list');
  assert.deepEqual(
    sequence(first),
    ['project:p1', 'chat:s2', 'chat:s1'],
    'the newest-first order comes from a copy, not from reordering the input',
  );
  assert.deepEqual(chats.rows, chatsBefore, 'the chats input array and its row objects are untouched');
  assert.equal(Object.keys(options).length, 1, 'the options object keeps exactly its own key');
  assert.deepEqual([...options.omitChatProjectIds], setIdsBefore, 'the omit set is not drained or reordered');
  assert.ok(first.rows !== second.rows, 'each call returns a fresh list');
});

test('chats with equal updatedAt keep their snapshot order (the recency sort is stable)', () => {
  const view = designWorkRows(
    { kind: 'empty' },
    chatsOf(chatRow('z9', 'p9', 7), chatRow('a1', 'p9', 7), chatRow('m5', 'p9', 3)),
    omitting('p1'),
  );
  assert.ok(view.kind === 'list');
  assert.deepEqual(
    view.rows.map((row) => (row.kind === 'project' ? `project:${row.project.id}` : `chat:${row.chat.sessionId}`)),
    ['chat:z9', 'chat:a1', 'chat:m5'],
    'equal timestamps resolve in snapshot order, with no hidden tie-break',
  );
});

test('a chat whose projectId extends a listed id is kept (exact-id match only)', () => {
  const view = designWorkRows(listed, chatsOf(chatRow('s1', 'p1-x', 10)), omitting('p1'));
  assert.ok(view.kind === 'list');
  assert.deepEqual(
    sequence(view),
    ['project:p1', 'chat:s1'],
    'p1-x is not p1: a prefix match must not omit the chat',
  );
});

test('a chat whose projectId differs only by case is kept (exact-id match only)', () => {
  const view = designWorkRows(listed, chatsOf(chatRow('s1', 'P1', 10)), omitting('p1'));
  assert.ok(view.kind === 'list');
  assert.deepEqual(
    sequence(view),
    ['project:p1', 'chat:s1'],
    'P1 is not p1: case-insensitive matching must not omit the chat',
  );
});
