import { test } from 'node:test';
import assert from 'node:assert/strict';

import { inferDirection, defaultCraft, DIRECTIONS } from '../panel/craft.ts';
import {
  buildBoardPrompt,
  buildEditPrompt,
  buildCritiquePrompt,
  loadDesignContext,
  resolveDirection,
  buildDiscoveryPrompt,
} from '../panel/harness.ts';
import type { HarnessConfig, ReadTextFile } from '../panel/harness.ts';
import type { SelectedElement } from '../panel/compose.ts';
import type { VerifyReport } from '../shared/verify-types.ts';

const cfg: HarnessConfig = {
  direction: 'auto',
  fidelity: 'hi-fi',
  critiquePolicy: 'opt-in',
  designMdPath: 'DESIGN.md',
  tokensPath: 'tokens.css',
};

test('inferDirection maps briefs to the intended direction', () => {
  assert.equal(inferDirection('an analytics dashboard for the ops team'), 'tech-utility');
  assert.equal(inferDirection('a marketing landing page for a new saas product'), 'modern-minimal');
  assert.equal(inferDirection('a long-form editorial magazine article'), 'editorial');
  assert.equal(inferDirection('a wellness community app for kids'), 'human');
  assert.equal(inferDirection('something utterly generic'), 'modern-minimal');
});

test('resolveDirection honors a manual id and falls back to inference on auto', () => {
  assert.equal(resolveDirection({ ...cfg, direction: 'editorial' }, 'a dashboard'), 'editorial');
  assert.equal(resolveDirection(cfg, 'a dashboard'), 'tech-utility');
});

test('defaultCraft renders the requested rules', () => {
  const text = defaultCraft(['typography', 'color']);
  assert.match(text, /### typography/);
  assert.match(text, /### color/);
  assert.ok(!/### anti-slop/.test(text));
  assert.ok(Object.keys(DIRECTIONS).length === 4);
});

test('buildBoardPrompt carries the direction line, craft and DESIGN.md', () => {
  const prompt = buildBoardPrompt('design/index.html', 'a dashboard', cfg, {
    designMd: '# Our System\nUse blue.',
    tokensCss: null,
  });
  assert.match(prompt, /Direction: LOCKED to "Tech Utility"/);
  assert.match(prompt, /Craft rules:/);
  assert.match(prompt, /DESIGN\.md \(authoritative/);
  assert.match(prompt, /# Our System/);
  assert.match(prompt, /Fidelity: HI-FI/);
  assert.match(prompt, /design\/index\.html/);
  assert.match(prompt, /Verification protocol:/);
  assert.match(prompt, /at most 5 fix\/verify iterations OR 10 minutes/);
});

test('buildBoardPrompt omits context labels when none is provided', () => {
  const prompt = buildBoardPrompt('design/index.html', 'a dashboard', cfg, { designMd: null, tokensCss: null });
  assert.ok(!/DESIGN\.md \(authoritative/.test(prompt));
  assert.ok(!/tokens\.css \(authoritative/.test(prompt));
});

test('buildEditPrompt includes the selected selector and markup', () => {
  const element: SelectedElement = {
    selector: 'main > section.hero > h1',
    tag: 'h1',
    id: 'title',
    classes: 'hero-title',
    text: 'Hello',
    outerHTML: '<h1 id="title" class="hero-title">Hello</h1>',
    styles: { 'font-size': '48px', color: 'rgb(0, 0, 0)' },
    rect: { x: 0, y: 0, width: 100, height: 40 },
  };
  const prompt = buildEditPrompt('design/index.html', element, 'make it bolder', cfg, { designMd: null, tokensCss: null });
  assert.match(prompt, /Point-and-edit target:/);
  assert.match(prompt, /main > section\.hero > h1/);
  assert.match(prompt, /hero-title/);
  assert.match(prompt, /font-size: 48px;/);
  assert.match(prompt, /Task: make it bolder/);
});

test('buildCritiquePrompt lists each passed finding', () => {
  const prompt = buildCritiquePrompt(
    'design/index.html',
    [
      { rule: 'anti-slop/indigo', severity: 'P1', message: 'Default indigo accent detected.' },
      { rule: 'contrast/body', severity: 'P0', message: 'Body contrast below AA.', evidence: '#999 on #fff' },
    ],
    cfg,
    { designMd: null, tokensCss: null },
  );
  assert.match(prompt, /anti-slop\/indigo/);
  assert.match(prompt, /contrast\/body/);
  assert.match(prompt, /#999 on #fff/);
  assert.match(prompt, /Philosophy consistency/);
  assert.match(prompt, /Keep:/);
  assert.match(prompt, /Quick wins:/);
});

test('buildCritiquePrompt marks the empty case', () => {
  const prompt = buildCritiquePrompt('design/index.html', [], cfg, { designMd: null, tokensCss: null });
  assert.match(prompt, /No automated findings\./);
});

test('buildCritiquePrompt renders a supplied verification gate table ahead of the advisory rubric', () => {
  const report: VerifyReport = {
    url: 'http://localhost:5173',
    ranAt: '2026-10-12T00:00:00.000Z',
    viewports: ['mobile', 'desktop'],
    gates: [
      {
        gate: 'G1',
        status: 'fail',
        findings: [{ id: 'overflow/horizontal', gate: 'G1', severity: 'P0', message: 'Horizontal scroll', evidence: 'scrollWidth 480 > 390' }],
      },
      { gate: 'G4', status: 'pass', findings: [] },
    ],
    summary: { p0: 1, p1: 0, p2: 0 },
    iterations: 2,
  };
  const prompt = buildCritiquePrompt('design/index.html', [], cfg, { designMd: null, tokensCss: null }, report);
  assert.match(prompt, /Verification gates/);
  assert.match(prompt, /overflow \(G1\): fail — P0 1 · P1 0/);
  assert.match(prompt, /design tokens \(G4\): pass — P0 0 · P1 0/);
  assert.match(prompt, /Totals: P0 1 · P1 0 · P2 0 · iterations 2/);
  assert.match(prompt, /advisory only/);
  assert.ok(prompt.indexOf('Verification gates') < prompt.indexOf('Philosophy consistency'), 'gates render ahead of the 0–10 rubric');
});

test('buildDiscoveryPrompt asks for at most 5 questions and does not ask for a direction', () => {
  const prompt = buildDiscoveryPrompt(cfg);
  assert.match(prompt, /at most 5 questions/);
  assert.match(prompt, /Do NOT ask the user to choose a visual direction/);
});

test('loadDesignContext returns nulls when the reader throws', async () => {
  const read: ReadTextFile = async (path) => {
    if (path === cfg.designMdPath) return '# Design';
    throw new Error('missing');
  };
  const ctx = await loadDesignContext(read, cfg);
  assert.equal(ctx.designMd, '# Design');
  assert.equal(ctx.tokensCss, null);
});

test('loadDesignContext returns both when the reader succeeds', async () => {
  const read: ReadTextFile = async () => 'x';
  const ctx = await loadDesignContext(read, cfg);
  assert.equal(ctx.designMd, 'x');
  assert.equal(ctx.tokensCss, 'x');
});
