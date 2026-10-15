import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source=await readFile(new URL('../viewer-client/src/Toolbar.tsx',import.meta.url),'utf8');
const icon=source.slice(source.indexOf('function InformationIcon('),source.indexOf('function Feedback('));

test('InformationIcon contains its absolute accessible label in the trigger wrapper',()=>{
  const classes=icon.match(/className="([^"]+)"/)?.[1]?.split(/\s+/)??[];
  assert.ok(classes.includes('relative'),'the existing wrapper must establish the sr-only containing block');
  assert.ok(classes.includes('inline-flex')&&classes.includes('h-7')&&classes.includes('w-7'));
});

test('InformationIcon retains its label, semantic roles, live status and stock tooltip',()=>{
  assert.match(icon,/aria-label=\{label\}/);
  assert.match(icon,/role=\{live \? 'status' : 'img'\}/);
  assert.match(icon,/aria-live=\{live \? 'polite' : undefined\}/);
  assert.match(icon,/<span className="sr-only">\{label\}<\/span>/);
  assert.match(icon,/<TooltipTrigger render=/);
  assert.match(icon,/<TooltipContent>\{label\}<\/TooltipContent>/);
});
