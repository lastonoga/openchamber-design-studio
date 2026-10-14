// Equivalence probe: omission BEFORE the sort instead of after. For a pure
// filter composed with a total-order stable sort the two commute, so NO
// behavioral test can kill this mutant — recorded as evidence, not as a kill.
import { cpSync, rmSync, readFileSync, writeFileSync, existsSync, symlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const S = path.dirname(new URL(import.meta.url).pathname);
const REPO = path.resolve(S, '../../../..');
const PRISTINE = path.join(S, 'pristine');
const RUN = path.join(S, 'run-eq');
rmSync(RUN, { recursive: true, force: true });
cpSync(PRISTINE, RUN, { recursive: true });
if (!existsSync(path.join(RUN, 'node_modules'))) {
  symlinkSync(path.join(REPO, 'node_modules'), path.join(RUN, 'node_modules'));
}
const target = path.join(RUN, 'panel/api.ts');
const find = [
  '    const ordered = [...chats.rows].sort((a, b) => b.updatedAt - a.updatedAt);',
  '    for (const chat of ordered) {',
  "      // Exact-id match only: a missing ('') or foreign projectId never collides",
  '      // with a listed project id.',
  '      if (omit?.has(chat.projectId)) continue;',
  "      rows.push({ kind: 'chat', chat });",
  '    }',
].join('\n');
const replace = [
  '    const ordered = chats.rows',
  '      .filter((chat) => !(omit?.has(chat.projectId) ?? false))',
  '      .sort((a, b) => b.updatedAt - a.updatedAt);',
  '    for (const chat of ordered) {',
  "      rows.push({ kind: 'chat', chat });",
  '    }',
].join('\n');
const src = readFileSync(target, 'utf8');
const count = src.split(find).length - 1;
if (count !== 1) {
  console.log(`EQ1 probe: find matched ${count} times; aborting`);
  process.exit(1);
}
writeFileSync(target, src.replace(find, replace));
const run = (args) => {
  const r = spawnSync('node', args, { cwd: RUN, encoding: 'utf8' });
  const fails = (r.stdout + r.stderr).split('\n').filter((l) => l.startsWith('✖') && !l.includes('failing tests')).length;
  return `exit=${r.status} failLines=${fails}`;
};
console.log('EQ1 omit-before-sort probe:');
console.log('  panel-open(pattern):', run(['--test', '--test-concurrency=1', '--test-name-pattern', 'designWorkRows|renderer omits', 'tests/panel-open.test.ts']));
console.log('  adversarial(full):  ', run(['--test', '--test-concurrency=1', 'tests/adversarial/design-work-omit-2026-10-14/adversarial-designwork.test.ts']));
