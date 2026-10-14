// The agent-facing browser provider. The host's `openchamber_web` tool posts
// every `browser.*` action here (BROWSER_PROVIDER_PATH = "/browser-control"),
// validated and with the same bearer auth as the rest of the service; we answer
// with the exact `BrowserProviderResult` shapes the in-app view answers with, so
// the agent sees one browser tool whoever drives the page.
//
// This module drives the single `Browser` from service/surface.ts. Live
// screencast JPEG is never used here: verification stills go through
// `Browser.capture` (a deterministic, lossless PNG of the compositor). The four
// actions an agent verifies with — open, snapshot, capture, resize — carry a
// bounded `verification` block. `browser.open` and `browser.capture` walk the
// FULL viewport matrix so the agent cannot forget a breakpoint; `browser.resize`
// and `browser.snapshot` report just the viewport they are looking at. After a
// matrix walk the previous viewport is restored.
import path from 'node:path';
import type { IncomingMessage } from 'node:http';

import {
  BROWSER_CONTROL_ACTIONS,
  BROWSER_VIEWPORT_MODES,
  readBrowserProviderRequest,
} from '@openchamber/sdk';
import type {
  BrowserCaptureData,
  BrowserClickData,
  BrowserConsoleProblem,
  BrowserInspectData,
  BrowserNavigationData,
  BrowserOpenData,
  BrowserProviderContext,
  BrowserProviderData,
  BrowserProviderRequest,
  BrowserProviderResult,
  BrowserResizeData,
  BrowserScrollData,
  BrowserSnapshotData,
  BrowserSnapshotElement,
  BrowserTypeData,
  BrowserViewportMode,
  BrowserViewportSummary,
} from '@openchamber/sdk';

import { hasAccessibleName, isInteractive } from './gates/probe.ts';
import type { ProbeElement, ProbeReport, ProviderVerification } from '../shared/verify-types.ts';
import { runGateReport } from './gates/index.ts';
import {
  gatherGateContext,
  providerVerification,
  providerVerificationFromReport,
  runVerification,
} from './verify.ts';
import { ensureBrowser } from './surface.ts';
import type { Browser } from './browser.ts';

const NO_MODIFIERS = { alt: false, ctrl: false, meta: false, shift: false };

/** mode → emulated CSS size; `fill` keeps whatever is current. */
const MODE_SIZES: Record<BrowserViewportMode, { width: number; height: number } | null> = {
  mobile: { width: 390, height: 844 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 800 },
  fill: null,
};

const MAX_SNAPSHOT_ELEMENTS = 300;
const MAX_SNAPSHOT_TEXT = 20_000;
const MAX_PROBLEMS = 20;
const MAX_LABEL = 120;
const STYLE_KEYS = [
  'display',
  'position',
  'width',
  'height',
  'color',
  'backgroundColor',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
  'textAlign',
  'margin',
  'padding',
  'border',
  'borderRadius',
  'boxShadow',
  'gap',
  'flexDirection',
  'justifyContent',
  'alignItems',
  'gridTemplateColumns',
  'opacity',
  'zIndex',
  'overflow',
  'transform',
] as const;

type WithVerification<T> = T & { verification?: ProviderVerification };

function fail(error: string): BrowserProviderResult {
  return { ok: false, error };
}

function done(data: BrowserProviderData): BrowserProviderResult {
  return { ok: true, data };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Preset mode for an exact size, else "custom". */
function summarize(width: number, height: number): BrowserViewportSummary {
  for (const mode of BROWSER_VIEWPORT_MODES) {
    const size = MODE_SIZES[mode];
    if (size && size.width === width && size.height === height) return { mode, width, height };
  }
  return { mode: 'custom', width, height };
}

function viewportToken(summary: BrowserViewportSummary): string {
  if (summary.mode !== 'custom') return summary.mode;
  return `${summary.width ?? 0}x${summary.height ?? 0}`;
}

/** The project dir from the request context, only when it is usable as such. */
function projectDir(context: BrowserProviderContext): string | null {
  const dir = context.directory;
  return dir && path.isAbsolute(dir) ? dir : null;
}

function requireSelector(value: string | undefined, action: string): string {
  if (!value || !value.trim()) {
    throw new ActionError(`The ${action} action needs a CSS selector; pass one in "selector".`);
  }
  return value;
}

class ActionError extends Error {}

async function pageUrl(browser: Browser): Promise<{ url: string; title: string }> {
  const state = await browser.state();
  return { url: state.url, title: state.title };
}

type Metrics = { scrollY: number; maxScrollY: number };

async function scrollMetrics(browser: Browser): Promise<Metrics> {
  try {
    const raw = await browser.evaluate(
      'JSON.stringify({ scrollY: window.scrollY || 0, maxScrollY: Math.max(0, document.documentElement.scrollHeight - window.innerHeight) })',
    );
    if (typeof raw === 'string') {
      const parsed = JSON.parse(raw) as { scrollY?: number; maxScrollY?: number };
      return { scrollY: Number(parsed.scrollY) || 0, maxScrollY: Number(parsed.maxScrollY) || 0 };
    }
  } catch {
    /* fall through to zeroed metrics */
  }
  return { scrollY: 0, maxScrollY: 0 };
}

// ---- actions ---------------------------------------------------------------

/**
 * Walk the full viewport matrix over the page that is already loaded (the matrix
 * runner does not navigate), collecting each gate's verdict per breakpoint, then
 * restore the viewport that was active before the walk so the live preview is
 * not left at the last breakpoint. A user holding surface control halts the
 * walk: no resize happens and the caller returns `ok:false`.
 */
async function matrixVerification(
  browser: Browser,
  dir: string | null,
  url: string,
): Promise<{ verification: ProviderVerification } | { error: string }> {
  const restore = browser.viewport();
  const camera = await browser.getCamera();
  let heldByUser = false;
  try {
    const report = await runVerification({ dir, url, navigate: false });
    if (report.halted?.guard === 'control') {
      heldByUser = true;
      return { error: report.halted.reason };
    }
    return { verification: providerVerificationFromReport(report) };
  } finally {
    // Restore the pre-action viewport unless the user owns the browser (a
    // resize then would be refused anyway and would fight their control).
    if (!heldByUser) {
      try { await browser.resize(restore.width, restore.height); }
      finally { await browser.restoreCamera(camera); }
    }
  }
}

/** The verification block for the single, current viewport (cheap, no walk). */
async function currentViewportVerification(
  browser: Browser,
  dir: string | null,
  url: string,
): Promise<ProviderVerification> {
  const probe = await browser.getProbe();
  const ctx = await gatherGateContext(dir);
  const gates = runGateReport(probe, ctx);
  const { width, height } = browser.viewport();
  return providerVerification(url, gates, [viewportToken(summarize(width, height))]);
}

async function handleResize(
  browser: Browser,
  params: { viewport: BrowserViewportMode },
  dir: string | null,
): Promise<BrowserProviderResult> {
  const size = MODE_SIZES[params.viewport];
  if (size) await browser.resize(size.width, size.height);
  const { width, height } = browser.viewport();
  const summary = summarize(width, height);
  const url = (await pageUrl(browser)).url;
  const data: WithVerification<BrowserResizeData> = {
    viewport: summary,
    verification: await currentViewportVerification(browser, dir, url),
  };
  return done(data);
}

async function handleOpen(
  browser: Browser,
  params: { url: string; viewport?: BrowserViewportMode },
  dir: string | null,
): Promise<BrowserProviderResult> {
  // Navigate FIRST: the window is launched lazily at the real URL (never
  // about:blank), so the browser only has a session — and can be resized —
  // after navigate() has run.
  const nav = await browser.navigate(params.url);
  if (params.viewport) {
    const size = MODE_SIZES[params.viewport];
    if (size) await browser.resize(size.width, size.height);
  }
  await browser.applyStableMode();
  await browser.waitForStable();
  const { width, height } = browser.viewport();
  const url = nav.url || params.url;

  const matrix = await matrixVerification(browser, dir, url);
  if ('error' in matrix) return fail(matrix.error);

  const data: WithVerification<BrowserOpenData> = {
    url,
    title: nav.title,
    opened: true,
    settled: nav.settled,
    viewport: summarize(width, height),
    verification: matrix.verification,
  };
  return done(data);
}

function inViewport(el: ProbeElement, probe: ProbeReport): boolean {
  const vw = probe.innerWidth || probe.clientWidth;
  const vh = probe.innerHeight;
  const { x, y, width, height } = el.rect;
  if (width <= 0 || height <= 0) return false;
  return x < vw && y < vh && x + width > 0 && y + height > 0;
}

function toSnapshotElement(el: ProbeElement, probe: ProbeReport): BrowserSnapshotElement {
  const element: BrowserSnapshotElement = {
    selector: el.selector,
    tag: el.tag,
    bounds: { x: el.rect.x, y: el.rect.y, width: el.rect.width, height: el.rect.height },
  };
  if (inViewport(el, probe)) element.inViewport = true;
  if (el.role) element.role = el.role;
  const label = el.label || el.ariaLabel;
  if (label) element.label = label;
  if (isInteractive(el) && !hasAccessibleName(el)) element.missingAccessibleName = true;
  return element;
}

/** Failed gate findings, surfaced to the agent through the snapshot's console slot. */
function problemsFromGates(
  gates: ReturnType<typeof runGateReport>,
): BrowserConsoleProblem[] {
  const problems: BrowserConsoleProblem[] = [];
  for (const gate of gates) {
    if (gate.status !== 'fail') continue;
    for (const finding of gate.findings) {
      problems.push({
        level: finding.severity === 'P0' ? 'error' : 'warning',
        message: `${finding.gate} ${finding.id}: ${finding.message}`,
        source: 'design-studio',
      });
      if (problems.length >= MAX_PROBLEMS) return problems;
    }
  }
  return problems;
}

async function handleSnapshot(
  browser: Browser,
  params: { selector?: string },
  dir: string | null,
): Promise<BrowserProviderResult> {
  const selector = params.selector?.trim() || undefined;
  if (selector) {
    const exists = await browser.evaluate(
      `!!document.querySelector(${JSON.stringify(selector)})`,
    );
    if (exists !== true) {
      return fail(`No element matches ${selector}. Check the selector, or omit it to snapshot the whole page.`);
    }
  }

  const probe = await browser.getProbe();
  const elements = probe.selectors;
  const interactiveCount = elements.filter((el) => isInteractive(el)).length;
  const capped = elements.slice(0, MAX_SNAPSHOT_ELEMENTS);

  const textRaw = await browser.evaluate(
    `(function () { var el = ${selector ? `document.querySelector(${JSON.stringify(selector)})` : 'document.body'}; return (el && (el.innerText || el.textContent)) || ''; })()`,
  );
  const fullText = typeof textRaw === 'string' ? textRaw : '';
  const text = fullText.slice(0, MAX_SNAPSHOT_TEXT);

  const metrics = await scrollMetrics(browser);
  const { url, title } = await pageUrl(browser);

  const ctx = await gatherGateContext(dir);
  const gates = runGateReport(probe, ctx);
  const problems = problemsFromGates(gates);

  const viewport = summarize(browser.viewport().width, browser.viewport().height);
  const data: WithVerification<BrowserSnapshotData> = {
    url,
    title,
    scope: selector ?? 'page',
    scrollY: metrics.scrollY,
    maxScrollY: metrics.maxScrollY,
    text,
    elements: capped.map((el) => toSnapshotElement(el, probe)),
    viewport,
    verification: providerVerification(url, gates, [viewportToken(viewport)]),
  };
  if (fullText.length > text.length) {
    data.textTruncated = true;
    data.textTotalChars = fullText.length;
  }
  if (elements.length > capped.length) data.elementsTruncated = true;
  if (interactiveCount > 0) data.interactiveElementsOnPage = interactiveCount;
  if (problems.length > 0) data.consoleProblems = problems;
  return done(data);
}

async function handleInspect(
  browser: Browser,
  params: { selector: string },
): Promise<BrowserProviderResult> {
  const selector = requireSelector(params.selector, 'browser.inspect');
  const raw = await browser.evaluate(
    `(function () {
      var el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      var cs = getComputedStyle(el);
      var keys = ${JSON.stringify(STYLE_KEYS)};
      var styles = {};
      for (var i = 0; i < keys.length; i++) styles[keys[i]] = cs[keys[i]];
      var r = el.getBoundingClientRect();
      var label = (el.getAttribute('aria-label') || el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, ${MAX_LABEL});
      return JSON.stringify({
        tag: el.tagName.toLowerCase(),
        label: label,
        bounds: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) },
        styles: styles,
        vw: window.innerWidth,
        vh: window.innerHeight
      });
    })()`,
  );
  if (typeof raw !== 'string') {
    return fail(`No element matches ${selector}. Check the selector and try again.`);
  }
  const parsed = JSON.parse(raw) as {
    tag: string;
    label: string;
    bounds: { x: number; y: number; width: number; height: number };
    styles: Record<string, string>;
    vw: number;
    vh: number;
  };
  const { x, y, width, height } = parsed.bounds;
  const data: BrowserInspectData = {
    selector,
    tag: parsed.tag,
    label: parsed.label,
    bounds: parsed.bounds,
    inViewport: x < parsed.vw && y < parsed.vh && x + width > 0 && y + height > 0,
    styles: parsed.styles,
  };
  return done(data);
}

async function handleCapture(
  browser: Browser,
  _params: { label?: string },
  dir: string | null,
): Promise<BrowserProviderResult> {
  // Capture the still at the viewport the agent is currently looking at, before
  // the matrix walk temporarily changes it.
  const shot = await browser.capture();
  const { width, height } = browser.viewport();
  const summary = summarize(width, height);
  const { url, title } = await pageUrl(browser);

  const matrix = await matrixVerification(browser, dir, url);
  if ('error' in matrix) return fail(matrix.error);

  const data: WithVerification<BrowserCaptureData> = {
    base64: shot.png.toString('base64'),
    mime: 'image/png',
    width,
    height,
    url,
    title,
    viewport: summary,
    verification: matrix.verification,
  };
  return done(data);
}

async function handleClick(
  browser: Browser,
  params: { selector?: string; text?: string },
): Promise<BrowserProviderResult> {
  const selector = params.selector?.trim();
  const text = params.text?.trim();
  if (!selector && !text) {
    return fail('The browser.click action needs a "selector" or "text" to find the element.');
  }

  const script = selector
    ? `(function () {
        var el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        el.scrollIntoView({ block: 'center', inline: 'nearest' });
        el.click();
        return JSON.stringify({ clicked: ${JSON.stringify(selector)}, label: (el.getAttribute('aria-label') || el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, ${MAX_LABEL}), url: location.href });
      })()`
    : `(function () {
        var needle = ${JSON.stringify(text)}.toLowerCase();
        var nodes = document.querySelectorAll('a,button,[role="button"],[role="link"],input[type="submit"],input[type="button"],summary,label');
        for (var i = 0; i < nodes.length; i++) {
          var el = nodes[i];
          var label = (el.getAttribute('aria-label') || el.value || el.textContent || '').replace(/\\s+/g, ' ').trim();
          if (label.toLowerCase().indexOf(needle) >= 0) {
            el.scrollIntoView({ block: 'center', inline: 'nearest' });
            el.click();
            return JSON.stringify({ clicked: label.slice(0, ${MAX_LABEL}), label: label.slice(0, ${MAX_LABEL}), url: location.href });
          }
        }
        return null;
      })()`;

  const raw = await browser.evaluate(script);
  if (typeof raw !== 'string') {
    return fail(
      selector
        ? `No element matches ${selector}. Check the selector and try again.`
        : `No clickable element contains the text "${text}". Try a different text or a CSS selector.`,
    );
  }
  const parsed = JSON.parse(raw) as { clicked: string; label: string; url: string };
  const data: BrowserClickData = { clicked: parsed.clicked, label: parsed.label, url: parsed.url };
  return done(data);
}

async function handleType(
  browser: Browser,
  params: { selector: string; value: string; submit: boolean },
): Promise<BrowserProviderResult> {
  const selector = requireSelector(params.selector, 'browser.type');
  const found = await browser.evaluate(
    `(function () {
      var el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
      el.focus();
      return el.tagName.toLowerCase();
    })()`,
  );
  if (!found) {
    return fail(`No element matches ${selector}. Check the selector and try again.`);
  }

  await browser.input([{ type: 'text', text: params.value }]);
  if (params.submit) {
    await browser.input([
      { type: 'key', action: 'down', key: 'Enter', code: 'Enter', modifiers: NO_MODIFIERS },
      { type: 'key', action: 'up', key: 'Enter', code: 'Enter', modifiers: NO_MODIFIERS },
    ]);
    await browser.waitForStable();
  }

  const url = (await pageUrl(browser)).url;
  const data: BrowserTypeData = { selector, url };
  return done(data);
}

async function wheelBy(browser: Browser, deltaY: number): Promise<void> {
  const { width, height } = browser.viewport();
  const frame = browser.latestFrame();
  const fx = frame?.width && frame.width > 0 ? frame.width : width;
  const fy = frame?.height && frame.height > 0 ? frame.height : height;
  await browser.input([
    { type: 'wheel', x: Math.round(fx / 2), y: Math.round(fy / 2), deltaX: 0, deltaY, modifiers: NO_MODIFIERS },
  ]);
  await delay(150);
}

async function handleScroll(
  browser: Browser,
  params: { selector?: string; direction?: 'up' | 'down' | 'top' | 'bottom' },
): Promise<BrowserProviderResult> {
  const selector = params.selector?.trim();
  const direction = params.direction ?? 'down';
  const { width, height } = browser.viewport();
  let scrolledTo: string | undefined;

  if (selector) {
    const found = await browser.evaluate(
      `(function () {
        var el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        el.scrollIntoView({ block: 'center', inline: 'nearest' });
        return true;
      })()`,
    );
    if (!found) return fail(`No element matches ${selector}. Check the selector and try again.`);
    scrolledTo = selector;
  } else if (direction === 'top') {
    await browser.evaluate('window.scrollTo(0, 0); true');
  } else if (direction === 'bottom') {
    await browser.evaluate('window.scrollTo(0, document.documentElement.scrollHeight); true');
  } else {
    await wheelBy(browser, direction === 'up' ? -height : height);
  }

  const metrics = await scrollMetrics(browser);
  const data: BrowserScrollData = {
    scrollY: metrics.scrollY,
    maxScrollY: metrics.maxScrollY,
    atTop: metrics.scrollY <= 0,
    atBottom: metrics.scrollY >= metrics.maxScrollY - 1,
    direction,
  };
  if (scrolledTo) data.scrolledTo = scrolledTo;
  return done(data);
}

async function handleHistory(
  browser: Browser,
  direction: 'back' | 'forward',
): Promise<BrowserProviderResult> {
  const nav = await browser.goHistory(direction);
  const data: BrowserNavigationData = { url: nav.url, title: nav.title };
  return done(data);
}

/**
 * Handle one browser-control request. Returns the answer shape the host parses;
 * an unparseable body or unknown action becomes `ok:false` with an actionable
 * message rather than an HTTP failure, so the agent can correct itself.
 */
export async function handleBrowserControl(
  _req: IncomingMessage,
  body: string,
): Promise<BrowserProviderResult> {
  const request: BrowserProviderRequest | null = readBrowserProviderRequest(body);
  if (!request) {
    return fail(
      `Unrecognized browser-control request. Send { requestId, action, parameters } with action one of: ${BROWSER_CONTROL_ACTIONS.join(', ')}.`,
    );
  }

  try {
    const browser = await ensureBrowser();
    const dir = projectDir(request.context);

    switch (request.action) {
      case 'browser.open':
        return await handleOpen(browser, request.parameters, dir);
      case 'browser.snapshot':
        return await handleSnapshot(browser, request.parameters, dir);
      case 'browser.click':
        return await handleClick(browser, request.parameters);
      case 'browser.type':
        return await handleType(browser, request.parameters);
      case 'browser.scroll':
        return await handleScroll(browser, request.parameters);
      case 'browser.back':
        return await handleHistory(browser, 'back');
      case 'browser.forward':
        return await handleHistory(browser, 'forward');
      case 'browser.inspect':
        return await handleInspect(browser, request.parameters);
      case 'browser.capture':
        return await handleCapture(browser, request.parameters, dir);
      case 'browser.resize':
        return await handleResize(browser, request.parameters, dir);
    }
  } catch (error) {
    if (error instanceof ActionError) return fail(error.message);
    const detail = error instanceof Error ? error.message : 'unknown error';
    // A not-started browser is the common case: the window launches lazily, so
    // any action before browser.open has no session to act on.
    const hint = /not started|no attached session/i.test(detail)
      ? 'No live window is open yet — call browser.open with a url first.'
      : 'Make sure Chrome is installed, then try again.';
    return fail(`The browser action failed: ${detail}. ${hint}`);
  }
}
