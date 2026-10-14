// Real-window acceptance: the live view is a headful `--app` window in
// incognito. These tests verify the window is REUSED (one page target, not a
// second window), that its geometry round-trips through the CDP Browser domain,
// and that closing the Chrome process is detected. The window is launched at
// --window-position=-2400,-2400 so test runs never disturb the user's screen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { promisify } from 'node:util';

import { Browser } from '../service/browser.ts';

const execFileP = promisify(execFile);
const CHROME = process.env.DS_CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// macOS allows negative coordinates; the window lands left of/above every
// display, so nothing appears on screen during tests.
const OFFSCREEN = '-2400,-2400,1280,800';

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A web-safe launch URL for `--app`: the window cannot be launched at a data:/
 * about: page any more, so a tiny loopback server stands in.
 */
function serve(): Promise<{ server: ReturnType<typeof createServer>; url: string }> {
  return new Promise((resolve, reject) => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<title>window</title><h1>app window</h1>');
    });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({ server, url: `http://127.0.0.1:${port}/` });
    });
  });
}

/** First direct child of `pid` (the Chrome main process), or null. */
async function firstChildPid(pid: number): Promise<number | null> {
  try {
    const { stdout } = await execFileP('pgrep', ['-P', String(pid)]);
    const line = stdout.split('\n').map((s) => s.trim()).filter(Boolean)[0];
    return line ? Number(line) : null;
  } catch {
    return null; // pgrep exits non-zero when nothing matched
  }
}

/** Every process whose command line mentions `needle` (the profile dir). */
async function processesMentioning(needle: string): Promise<string[]> {
  const { stdout } = await execFileP('ps', ['-ax', '-o', 'command=']);
  return stdout.split('\n').filter((line) => line.includes(needle));
}

/** Send one CDP command over a websocket and resolve its result. */
function cdpCall(wsUrl: string, method: string, params: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      try {
        ws.close();
      } catch {
        /* already closing */
      }
      reject(new Error(`cdp timeout: ${method}`));
    }, 10_000);
    ws.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error('cdp socket error'));
    });
    ws.addEventListener('open', () => ws.send(JSON.stringify({ id: 1, method, params })));
    ws.addEventListener('message', (event) => {
      let message: { id?: number; result?: unknown; error?: { message?: string } };
      try {
        message = JSON.parse(String(event.data)) as typeof message;
      } catch {
        return;
      }
      if (message.id !== 1) return;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        /* already closing */
      }
      if (message.error) reject(new Error(message.error.message ?? 'cdp error'));
      else resolve(message.result);
    });
  });
}

test('closing the window by hand quits Chrome, removes the profile and relaunches fresh', { timeout: 90_000 }, async (t) => {
  if (!(await exists(CHROME))) {
    t.skip(`Chrome not found at ${CHROME}`);
    return;
  }

  const previousWindow = process.env.DS_WINDOW;
  process.env.DS_WINDOW = OFFSCREEN;
  const browser = new Browser();
  if (previousWindow === undefined) delete process.env.DS_WINDOW;
  else process.env.DS_WINDOW = previousWindow;

  const { server, url: launchUrl } = await serve();

  try {
    await browser.start(launchUrl);
    const profile = browser.profilePath();
    assert.ok(profile, 'a throwaway profile exists while the window is up');
    assert.equal(await exists(profile), true, 'the profile dir is present');
    const before = await processesMentioning(profile);
    console.log(`[close] processes before = ${before.length}`);
    assert.ok(before.length > 0, 'a Chrome process is running for this profile');

    // Close the window the way the user does: destroy the page target through
    // the browser endpoint. Our CDP event wiring must notice and quit Chrome.
    const list = await browser.jsonList();
    const page = list.find((target) => target.type === 'page');
    assert.ok(page?.id && page.webSocketDebuggerUrl, 'the page target is listed');
    const port = new URL(page.webSocketDebuggerUrl).port;
    const version = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()) as {
      webSocketDebuggerUrl?: string;
    };
    assert.ok(version.webSocketDebuggerUrl, 'the browser endpoint is available');
    await cdpCall(version.webSocketDebuggerUrl, 'Target.closeTarget', { targetId: page.id });

    const closeDeadline = Date.now() + 15_000;
    let open = true;
    while (Date.now() < closeDeadline) {
      const state = await browser.state(); // must not throw
      if (!state.windowOpen) {
        open = false;
        break;
      }
      await delay(100);
    }
    assert.equal(open, false, 'windowOpen flips false once the window is closed');

    // The temp profile is removed, and no Chrome process — notably no lingering
    // `--no-startup-window` background process — still references it.
    const goneDeadline = Date.now() + 8000;
    while (Date.now() < goneDeadline && (await exists(profile))) await delay(100);
    assert.equal(await exists(profile), false, 'the temp profile dir is removed');

    let after: string[] = [];
    const procDeadline = Date.now() + 8000;
    while (Date.now() < procDeadline) {
      after = await processesMentioning(profile);
      if (after.length === 0) break;
      await delay(200);
    }
    console.log(`[close] processes after = ${after.length}: ${JSON.stringify(after)}`);
    assert.equal(after.length, 0, 'no Chrome process lingers for the closed profile (no --no-startup-window orphan)');

    // A later open() launches a fresh window with a new profile.
    const fresh = await browser.open(launchUrl);
    assert.equal(fresh.settled, true, 'a fresh window opened after the close');
    assert.equal((await browser.state()).windowOpen, true, 'windowOpen is true again');
    assert.ok(browser.profilePath() && browser.profilePath() !== profile, 'a new throwaway profile is used');
  } finally {
    await browser.stop();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('the window is reused, its bounds round-trip and closure is detected', { timeout: 90_000 }, async (t) => {
  if (!(await exists(CHROME))) {
    t.skip(`Chrome not found at ${CHROME}`);
    return;
  }

  // DS_WINDOW is read at construct time; pin it around the construction only.
  const previousWindow = process.env.DS_WINDOW;
  process.env.DS_WINDOW = OFFSCREEN;
  const browser = new Browser();
  if (previousWindow === undefined) delete process.env.DS_WINDOW;
  else process.env.DS_WINDOW = previousWindow;

  // `--app` requires a web-safe launch URL, so a served page replaces the old
  // about:blank placeholder launch.
  const { server, url: launchUrl } = await serve();

  try {
    await browser.start(launchUrl);

    // (a) Target acquisition must have ATTACHED to the existing --app window,
    // not created a second one: Chrome still reports exactly one page target.
    assert.equal(await browser.pageTargetCount(), 1, 'the --app window is the only page target');

    // (b) navigate + place + read the geometry back through the Browser domain.
    // macOS/Chrome clamp a fully-offscreen position so a sliver of the window
    // stays visible (a -2400 request came back as x≈-1240), so exact
    // round-trip is asserted only for in-range values: top and the size. Left
    // is asserted negative-and-stable — still essentially offscreen.
    const page = launchUrl + 'app-window';
    const nav = await browser.navigate(page);
    assert.equal(nav.settled, true, 'the real HTTP artifact settled');
    assert.equal(await browser.pageTargetCount(), 1, 'navigating reuses the same window');

    await browser.placeWindow(-2400, 100, 1280, 800);
    const bounds = await browser.windowBounds();
    assert.ok(bounds, 'windowBounds reports geometry');
    console.log(`[window] placed bounds => ${JSON.stringify(bounds)}`);
    assert.equal(bounds!.width, 1280, 'width round-trips');
    assert.equal(bounds!.height, 800, 'height round-trips');
    assert.equal(bounds!.y, 100, 'an in-range top round-trips exactly');
    assert.ok(
      Number.isFinite(bounds!.x) && bounds!.x >= -2400 && bounds!.x < 0,
      `offscreen left is platform-clamped but negative (got ${bounds!.x})`,
    );
    const again = await browser.windowBounds();
    assert.deepEqual(again, bounds, 'a second read is stable');

    // (d) SIGKILL the Chrome child (a direct child of this test process) and
    // expect windowOpen to flip false — with state() still answering on the
    // dead CDP socket, and no auto-relaunch.
    const kid = await firstChildPid(process.pid);
    assert.ok(kid, 'found the Chrome child process');
    process.kill(kid!, 'SIGKILL');

    const deadline = Date.now() + 5000;
    let open = true;
    while (Date.now() < deadline) {
      const state = await browser.state(); // must not throw on the dead socket
      if (!state.windowOpen) {
        open = false;
        break;
      }
      await delay(100);
    }
    assert.equal(open, false, 'windowOpen flips false after the Chrome child dies');
    await delay(300);
    assert.equal((await browser.state()).windowOpen, false, 'no auto-relaunch happened');
  } finally {
    await browser.stop();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
