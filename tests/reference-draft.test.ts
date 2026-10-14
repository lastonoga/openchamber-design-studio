import { test } from 'node:test';
import assert from 'node:assert/strict';

// A missing module must fail each behavioral regression, not abort discovery.
const modulePath = '../panel/reference-draft.ts';
const draft = await import(modulePath).catch(() => null);
const ref = (id: string, path: string, kind: 'file' | 'project' = 'file') => ({
  id, kind, path, sourceDirectory: '/source/project', label: 'same.ts',
});

test('draft identity is canonical full path plus kind, never basename or id', () => {
  assert.ok(draft, 'reference draft helpers must exist');
  const first = ref('first', '/source/project/a/same.ts');
  const second = ref('second', '/source/project/b/same.ts');
  const original = Object.freeze([Object.freeze(first)]);
  const added = draft.addDraftReference(original, second);
  assert.deepEqual(added, [first, second]);
  assert.deepEqual(original, [first], 'adding must not mutate the retained draft');
  assert.deepEqual(draft.addDraftReference(added, { ...first, id: 'alias', label: 'alias' }), added);
  assert.equal(draft.addDraftReference(added, ref('project', first.path, 'project')).length, 3);
});

test('removal is immutable and only retained references reach both submission channels', () => {
  assert.ok(draft, 'reference draft helpers must exist');
  const refs = Object.freeze([ref('remove', '/source/project/removed.ts'), ref('keep', '/other/retained.ts', 'project')]);
  const retained = draft.removeDraftReference(refs, 'remove');
  assert.deepEqual(retained, [refs[1]]);
  assert.equal(refs.length, 2);
  const data = Object.freeze({ mode: { on: true, type: 'web', brief: 'brief' } });
  const submission = draft.buildReferenceSubmission('Build the page.', data, retained);
  assert.match(submission.text, /Build the page\./);
  assert.match(submission.text, /\/other\/retained\.ts/);
  assert.match(submission.text, /\/source\/project/);
  assert.match(submission.text, /project/i);
  assert.doesNotMatch(submission.text, /removed\.ts/);
  assert.deepEqual(submission.data.references, retained);
  assert.deepEqual(submission.data.mode, data.mode);
  assert.equal('references' in data, false);
});

test('empty references preserve exact base text and metadata including undefined', () => {
  assert.ok(draft, 'reference draft helpers must exist');
  const data = { mode: { on: true } };
  const submission = draft.buildReferenceSubmission('  original\n', data, []);
  assert.equal(submission.text, '  original\n');
  assert.equal(submission.data, data);
  assert.deepEqual(draft.buildReferenceSubmission('original', undefined, []), { text: 'original', data: undefined });
});

test('oversize prompt is rejected rather than truncating base text or a reference', () => {
  assert.ok(draft, 'reference draft helpers must exist');
  const refs = [ref('long', '/' + 'p'.repeat(16000))];
  assert.throws(() => draft.buildReferenceSubmission('brief', {}, refs), /text|prompt/i);
  assert.throws(() => draft.buildReferenceSubmission('x'.repeat(16001), {}, []), /16000|16,000/);
  assert.equal(draft.buildReferenceSubmission('x'.repeat(16000), {}, []).text.length, 16000);
});

test('serialized JSON budget includes escaping and rejects oversize without dropping metadata', () => {
  assert.ok(draft, 'reference draft helpers must exist');
  assert.throws(() => draft.buildReferenceSubmission('brief', { brief: '"'.repeat(8000) }, []), /metadata|data|JSON/i);
  assert.throws(() => draft.buildReferenceSubmission('brief', { brief: 'x'.repeat(15950) }, [ref('one', '/source/a.ts')]), /metadata|data|JSON/i);
  const exact = { brief: 'x'.repeat(15988) };
  assert.equal(JSON.stringify(exact).length, 16000);
  assert.equal(draft.buildReferenceSubmission('brief', exact, []).data, exact);
});
