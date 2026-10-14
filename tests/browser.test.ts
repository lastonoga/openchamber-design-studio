import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import path from 'node:path';

import { Browser, PICK_SCRIPT, buildLaunchArgs, otherLoopback } from '../service/browser.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CHROME = process.env.DS_CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TOKEN = 'browser-acceptance-token';

const AUTH = { authorization: `Bearer ${TOKEN}` };
const MODS = { alt: false, ctrl: false, meta: false, shift: false };

// macOS allows negative coordinates: the window lands off every display, so a
// test run never disturbs the user's screen.
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

async function waitForHealth(base: string, child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`service exited early: ${child.exitCode}`);
    try {
      const res = await fetch(`${base}/health`, { headers: AUTH });
      if (res.status === 200) return;
    } catch {
      /* not up yet */
    }
    await delay(100);
  }
  throw new Error('service did not become healthy');
}

function postJson(base: string, pathname: string, body: unknown): Promise<Response> {
  return fetch(`${base}${pathname}`, {
    method: 'POST',
    headers: { ...AUTH, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Serve `body` on a loopback port and resolve the listening port. */
function serve(body: string, host = '127.0.0.1'): Promise<{ server: ReturnType<typeof createServer>; port: number }> {
  return new Promise((resolve, reject) => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(body);
    });
    server.once('error', reject);
    server.listen(0, host, () => {
      const address = server.address();
      resolve({ server, port: typeof address === 'object' && address ? address.port : 0 });
    });
  });
}

function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

test('otherLoopback swaps the loopback family once', () => {
  assert.equal(otherLoopback('http://localhost:5179/'), 'http://[::1]:5179/');
  assert.equal(otherLoopback('http://127.0.0.1:5179/'), 'http://[::1]:5179/');
  assert.equal(otherLoopback('http://[::1]:5179/'), 'http://127.0.0.1:5179/');
  assert.equal(otherLoopback('https://example.com/x'), null);
  assert.equal(otherLoopback('about:blank'), null);
  assert.equal(otherLoopback('not a url'), null);
});

test('launch args open an incognito --app window with extensions off', () => {
  const args = buildLaunchArgs({ x: 0, y: 0, width: 800, height: 600 }, '/tmp/ds-profile', 'http://example.com/');
  assert.ok(args.includes('--app=http://example.com/'), 'launches the window directly at the target URL');
  assert.ok(args.includes('--incognito'), 'opens incognito');
  assert.ok(args.includes('--disable-extensions'), 'disables extensions');
  assert.ok(
    args.some((arg) => arg.startsWith('--remote-debugging-port=')),
    'exposes a debugging port',
  );
  assert.ok(
    args.some((arg) => arg.startsWith('--user-data-dir=')),
    'uses a throwaway profile',
  );
  assert.ok(args.includes('--window-size=800,600'), 'carries the window size');
  assert.ok(args.includes('--window-position=0,0'), 'carries the window position');
});

test('the launch URL is web-safe: --app carries it, about:blank is gone', () => {
  const spec = { x: 0, y: 0, width: 800, height: 600 };
  const args = buildLaunchArgs(spec, '/tmp/ds-profile', 'http://127.0.0.1:1234/');
  assert.ok(args.includes('--app=http://127.0.0.1:1234/'), 'launches directly at the real target URL');
  assert.ok(!args.some((arg) => arg.includes('about:blank')), 'no about:blank placeholder launch');
  assert.throws(() => buildLaunchArgs(spec, '/tmp/ds-profile', 'about:blank'), /non-http/);
  assert.throws(() => buildLaunchArgs(spec, '/tmp/ds-profile', 'data:text/html,hi'), /non-http/);
});

test('start() refuses a non-http(s) URL and a missing URL without launching', async () => {
  const browser = new Browser();
  await assert.rejects(() => browser.start('about:blank'), /non-http/, 'non-http(s) URL refused');
  await assert.rejects(() => browser.start(), /no URL/, 'a window requested with no URL errors');
});

// Highlighting needs a live window: with none up (a fresh Browser, never
// started) it answers false rather than throwing.
test('highlight() returns false when no window is open', async () => {
  const browser = new Browser();
  assert.equal(await browser.highlight('#anything'), false, 'no window: highlight is false');
});

// The pick gesture is defined entirely by the injected script. Pin its contract
// statically: it gates on Cmd/Ctrl, draws the transient feedback outline, and
// the old toggle is gone.
test('PICK_SCRIPT gates on metaKey/ctrlKey, draws a transient outline, has no toggle', () => {
  assert.match(PICK_SCRIPT, /e\.metaKey\s*\|\|\s*e\.ctrlKey/, 'a pick requires Cmd (metaKey) or Ctrl');
  assert.doesNotMatch(PICK_SCRIPT, /__dsSetPick/, 'the __dsSetPick toggle is gone');
  assert.doesNotMatch(PICK_SCRIPT, /\bpicking\b/, 'no picking flag remains');
  assert.match(PICK_SCRIPT, /__ds-pick-outline/, 'creates the feedback outline element');
  assert.match(PICK_SCRIPT, /pointerEvents\s*=\s*['"]none['"]/, 'the outline is pointer-events: none');
  assert.match(PICK_SCRIPT, /crosshair/, 'crosshair cursor while the modifier is held');
  assert.match(PICK_SCRIPT, /data-ds-overlay/, 'marks the outline so the probe can skip it');
  assert.match(PICK_SCRIPT, /window\.__dsPick/, 'still reports through the __dsPick binding');
});

test('POST /open settles the required IPv4 baseline and reuses its window', { timeout: 60_000 }, async (t) => {
  if (!(await exists(CHROME))) {
    t.skip(`Chrome not found at ${CHROME}`);
    return;
  }

  // IPv6 is optional under the user's release contract. IPv4 remains mandatory:
  // an owned loopback fixture must settle and retain the exact requested URL.
  const site = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<title>IPv4 baseline</title><h1>ok</h1>');
  });
  await new Promise<void>((resolve, reject) => {
    site.once('error', reject);
    site.listen(0, '127.0.0.1', resolve);
  });
  const siteAddress=site.address();
  assert.ok(siteAddress&&typeof siteAddress==='object');
  const siteUrl=`http://127.0.0.1:${siteAddress.port}/`;

  const port = 49_000 + Math.floor(Math.random() * 1500);
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [path.join(root, 'service', 'main.js')], {
    env: {
      ...process.env,
      OPENCHAMBER_SERVICE_PORT: String(port),
      OPENCHAMBER_SERVICE_TOKEN: TOKEN,
      DS_WINDOW: OFFSCREEN,
      // The window survives a normal service stop by design; ask this test's
      // service to kill it on shutdown so a run does not leak a Chrome window.
      DS_KILL_WINDOW_ON_STOP: '1',
    },
    stdio: 'ignore',
  });

  try {
    await waitForHealth(base, child);

    // Before any open, the window does not exist.
    const initialState = (await (await fetch(`${base}/state`, { headers: AUTH })).json()) as {
      windowOpen?: boolean;
      url?: string;
    };
    assert.equal(initialState.windowOpen, false, 'no window before the first open');

    const open = await postJson(base, '/open', { url: siteUrl });
    assert.equal(open.status, 200);
    const body = (await open.json()) as { ok?: boolean; url?: string; title?: string; settled?: boolean };
    assert.equal(body.ok, true, 'open succeeded');
    assert.equal(body.settled, true, 'the required IPv4 navigation settled');
    assert.equal(body.url,siteUrl,'open reports the exact canonical IPv4 URL');
    assert.equal(body.title,'IPv4 baseline');

    const state = (await (await fetch(`${base}/state`, { headers: AUTH })).json()) as {
      windowOpen?: boolean;
      url?: string;
      title?: string;
    };
    assert.equal(state.windowOpen, true, 'the real window is open');
    assert.equal(state.url,siteUrl,'state reports the requested IPv4 URL');
    assert.equal(state.title, 'IPv4 baseline', 'state reports the page title');
    const {readdir,readFile}=await import('node:fs/promises');
    const {tmpdir}=await import('node:os');
    const profiles=(await readdir(tmpdir())).filter(name=>name.startsWith('ds-chrome-'));
    assert.equal(profiles.length,1,'one owned Chrome profile exists');
    const debugPort=Number((await readFile(path.join(tmpdir(),profiles[0]!,'DevToolsActivePort'),'utf8')).split('\n')[0]);
    const pageTargets=async()=>((await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()) as Array<{type:string;id:string}>).filter(target=>target.type==='page');
    const firstTargets=await pageTargets();assert.equal(firstTargets.length,1);

    // A SECOND /open must navigate the SAME window rather than launch another:
    // the URL/state change and no new window is reported.
    const second = await postJson(base, '/open', { url: siteUrl+'second' });
    assert.equal(second.status, 200);
    const secondBody = (await second.json()) as { ok?: boolean; url?: string; settled?: boolean };
    assert.equal(secondBody.ok, true, 'the second open succeeded');
    assert.equal(secondBody.settled,true,'second IPv4 navigation also settles');
    assert.equal(secondBody.url,siteUrl+'second');
    const state2 = (await (await fetch(`${base}/state`, { headers: AUTH })).json()) as {
      windowOpen?: boolean;
      url?: string;
    };
    assert.equal(state2.windowOpen, true, 'still exactly one window');
    assert.equal(state2.url,siteUrl+'second','the existing window navigated to the exact second URL');
    const secondTargets=await pageTargets();assert.equal(secondTargets.length,1);assert.equal(secondTargets[0]!.id,firstTargets[0]!.id,'same actual page target is reused');
    assert.equal((await postJson(base,'/focus',{})).status,200);
    assert.equal(((await (await fetch(`${base}/state`,{headers:AUTH})).json()) as {url:string}).url,siteUrl+'second','focus does not navigate');
    const closed=await postJson(base,'/close',{});assert.equal(closed.status,200);assert.equal((await closed.json() as {ok:boolean}).ok,true);
    assert.equal(((await (await fetch(`${base}/state`,{headers:AUTH})).json()) as {windowOpen:boolean}).windowOpen,false,'owned close reports closed state');
  } finally {
    child.kill('SIGTERM');
    await new Promise<void>((resolve) => site.close(() => resolve()));
    await delay(600);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
});

// Exercises `Browser` directly: the real window primitives with no HTTP route
// of their own. DS_WINDOW pins the window offscreen; the launch is headful, so
// this runs only when Chrome is present.
test('real window: reuses one window, opens a url, picks and captures', { timeout: 90_000 }, async (t) => {
  if (!(await exists(CHROME))) {
    t.skip(`Chrome not found at ${CHROME}`);
    return;
  }

  const previousWindow = process.env.DS_WINDOW;
  process.env.DS_WINDOW = OFFSCREEN;
  const browser = new Browser();
  if (previousWindow === undefined) delete process.env.DS_WINDOW;
  else process.env.DS_WINDOW = previousWindow;

  // Both shell and artifact now use actual HTTP(S) pages, not data: documents.
  const { server, port: launchPort } = await serve('<style>body{margin:0}</style><button id="b" style="width:300px;height:200px;font-size:40px">Hi</button>');
  const launchUrl = `http://127.0.0.1:${launchPort}/`;

  try {
    await browser.start(launchUrl);

    // (a) The --app window is the only page target; opening a URL must REUSE it
    // (a blind createTarget would make the count 2).
    assert.equal(await browser.pageTargetCount(), 1, 'one window exists after launch');

    const page = launchUrl + 'fixture';
    const opened = await browser.open(page);
    assert.equal(opened.settled, true, 'open() navigated and settled');
    assert.equal(opened.url, page, 'open() reports the artifact url, never the shell');
    assert.equal(await browser.pageTargetCount(), 1, 'the same window is reused on open');
    // A second open() must NAVIGATE the same window, never spawn a second one.
    const reopened = await browser.open(page);
    assert.equal(reopened.settled, true, 'the second open navigated and settled');
    assert.equal(await browser.pageTargetCount(), 1, 'the second open opened no second window');
    assert.equal((await browser.state()).windowOpen, true, 'windowOpen is true while up');

    // (b) pick gesture: a PLAIN click passes through and is not a pick; a
    //     Cmd-modified click is swallowed and reported through __dsPick.
    const META = { ...MODS, meta: true };
    await browser.input([
      { type: 'pointer', action: 'down', x: 60, y: 60, button: 0, buttons: 1, modifiers: MODS },
      { type: 'pointer', action: 'up', x: 60, y: 60, button: 0, buttons: 0, modifiers: MODS },
    ]);
    await delay(400);
    assert.equal((await browser.state()).lastPick, null, 'a plain click is not a pick');
    assert.equal(
      await browser.evaluate("!!document.querySelector('#__ds-pick-outline')"),
      false,
      'a plain click leaves no pick outline',
    );

    await browser.input([
      { type: 'pointer', action: 'down', x: 60, y: 60, button: 0, buttons: 1, modifiers: META },
      { type: 'pointer', action: 'up', x: 60, y: 60, button: 0, buttons: 0, modifiers: META },
    ]);
    const pickDeadline = Date.now() + 5000;
    let picked: { lastPick?: { selector?: string } | null } = {};
    while (Date.now() < pickDeadline) {
      picked = (await browser.state()) as typeof picked;
      if (picked.lastPick) break;
      await delay(120);
    }
    assert.ok(picked.lastPick, 'a ⌘-click recorded a pick');
    assert.match(String(picked.lastPick?.selector), /#b|button/, 'selector names the button');

    // The pick must be VISIBLE: one transient outline covers the picked button.
    const outline = (await browser.evaluate(`(function () {
      var el = document.querySelector('#__ds-pick-outline');
      if (!el) return null;
      var r = el.getBoundingClientRect();
      return {
        id: el.id,
        marker: el.getAttribute('data-ds-overlay'),
        picked: el.getAttribute('data-ds-picked'),
        x: r.x, y: r.y, width: r.width, height: r.height
      };
    })()`)) as
      | { id?: string; marker?: string; picked?: string | null; x?: number; y?: number; width?: number; height?: number }
      | null;
    console.log(`[pick-outline] ${JSON.stringify(outline)}`);
    assert.ok(outline, 'the pick outline exists after a ⌘-click');
    assert.equal(outline?.id, '__ds-pick-outline', 'the outline uses the stable id');
    assert.equal(outline?.marker, 'pick', 'the outline is marked data-ds-overlay="pick"');
    assert.equal(outline?.picked, '1', 'the picked element keeps the outline marked');
    // The button (#b) sits at the viewport origin at 300x200; the outline tracks it.
    assert.ok(
      typeof outline?.x === 'number' && Math.abs(outline.x) < 5 && Math.abs(Number(outline.y)) < 5,
      `the outline is positioned near the picked element's rect (x=${outline?.x}, y=${outline?.y})`,
    );
    assert.ok(Number(outline?.width) > 100 && Number(outline?.height) > 100, 'the outline covers the button box');

    // (b2) highlight by selector: the same outline re-flashes for a known id and
    // is MARKED as a highlight (distinct from a pick); a selector that matches
    // nothing, and an invalid selector, both answer false.
    assert.equal(await browser.highlight('#b'), true, 'highlighting a present selector returns true');
    const highlighted = (await browser.evaluate(`(function () {
      var el = document.querySelector('#__ds-pick-outline');
      if (!el) return null;
      var r = el.getBoundingClientRect();
      return {
        id: el.id,
        marker: el.getAttribute('data-ds-overlay'),
        highlight: el.getAttribute('data-ds-highlight'),
        display: el.style.display,
        x: r.x, y: r.y, width: r.width, height: r.height
      };
    })()`)) as
      | { id?: string; marker?: string; highlight?: string | null; display?: string; x?: number; y?: number; width?: number; height?: number }
      | null;
    console.log(`[highlight-outline] ${JSON.stringify(highlighted)}`);
    assert.ok(highlighted, 'the highlight outline exists after highlight()');
    assert.equal(highlighted?.id, '__ds-pick-outline', 'highlight reuses the shared outline element');
    assert.equal(highlighted?.marker, 'pick', 'the outline stays tagged data-ds-overlay="pick"');
    assert.equal(highlighted?.highlight, '1', 'the outline is marked data-ds-highlight');
    assert.equal(highlighted?.display, 'block', 'the highlight is visible');
    assert.ok(
      typeof highlighted?.x === 'number' && Math.abs(highlighted.x) < 5 && Math.abs(Number(highlighted.y)) < 5,
      `the highlight tracks the target rect (x=${highlighted?.x}, y=${highlighted?.y})`,
    );
    assert.ok(Number(highlighted?.width) > 100 && Number(highlighted?.height) > 100, 'the highlight covers the button box');
    assert.equal(await browser.highlight('#__ds-no-such-element__'), false, 'a selector that matches nothing is false');
    assert.equal(await browser.highlight(':::not a selector:::'), false, 'an invalid selector is false');

    // (c) the probe is present on a loaded page.
    const probe = await browser.getProbe();
    assert.equal(typeof probe.scrollWidth, 'number', 'probe reports a numeric scrollWidth');
    assert.ok(
      probe.selectors.some((s) => s.tag === 'button'),
      'probe described the button',
    );

    // The probe must skip the pick overlay (and any subtree under it): a
    // fixture button under a data-ds-overlay root must not be described, and
    // the outline itself must not appear among the selectors.
    await browser.evaluate(`(function () {
      var root = document.createElement('div');
      root.id = '__ds-probe-fixture';
      root.setAttribute('data-ds-overlay', 'pick');
      var btn = document.createElement('button');
      btn.id = 'overlay-fixture-btn';
      btn.textContent = 'ghost';
      root.appendChild(btn);
      document.body.appendChild(root);
      return true;
    })()`);
    const probeWithFixture = await browser.getProbe();
    assert.equal(
      probeWithFixture.selectors.some((s) => String(s.selector).includes('overlay-fixture-btn')),
      false,
      'the probe skips a button under a data-ds-overlay root',
    );
    assert.equal(
      probeWithFixture.selectors.some((s) => String(s.selector).includes('__ds-pick-outline')),
      false,
      'the probe skips the pick outline itself',
    );
    await browser.evaluate("var f=document.getElementById('__ds-probe-fixture'); if(f) f.remove(); true");

    // (d) capture() returns a real PNG.
    await browser.applyStableMode();
    const shot = await browser.capture();
    assert.deepEqual(Array.from(shot.png.subarray(0, 4)), [0x89, 0x50, 0x4e, 0x47], 'PNG magic bytes');
    assert.ok(shot.width > 0 && shot.height > 0, 'capture reports a viewport size');
    console.log(
      `[capture] ${shot.width}x${shot.height}, ${shot.png.length} bytes, magic=${shot.png.subarray(0, 4).toString('hex')}`,
    );

    // (e) a static page stabilises, and resize() drives device metrics.
    const stable = await browser.waitForStable();
    assert.equal(stable, true, 'a static page stabilises');
    await browser.resize(390, 844);
    assert.deepEqual(browser.viewport(), { width: 390, height: 844 }, 'resize reports the requested size');
    const mobile = await browser.capture();
    assert.deepEqual(
      Array.from(mobile.png.subarray(0, 4)),
      [0x89, 0x50, 0x4e, 0x47],
      'a resized capture yields PNG magic bytes',
    );
    console.log(
      `[resize+capture] ${mobile.width}x${mobile.height}, ${mobile.png.length} bytes, magic=${mobile.png.subarray(0, 4).toString('hex')}`,
    );
  } finally {
    await browser.stop();
    await closeServer(server);
  }
});

// close() is the `/close` path: it must quit Chrome (macOS would otherwise keep
// the app running after its last window closes), remove the throwaway profile,
// and leave a later open() launching a fresh window.
test('close() quits Chrome, removes the profile, and a later open relaunches fresh', { timeout: 90_000 }, async (t) => {
  if (!(await exists(CHROME))) {
    t.skip(`Chrome not found at ${CHROME}`);
    return;
  }

  const previousWindow = process.env.DS_WINDOW;
  process.env.DS_WINDOW = OFFSCREEN;
  const browser = new Browser();
  if (previousWindow === undefined) delete process.env.DS_WINDOW;
  else process.env.DS_WINDOW = previousWindow;

  const { server, port: launchPort } = await serve('<title>close</title><h1>ok</h1>');
  const launchUrl = `http://127.0.0.1:${launchPort}/`;

  try {
    await browser.start(launchUrl);
    const profile = browser.profilePath();
    assert.ok(profile, 'a throwaway profile exists while the window is up');
    assert.equal(await exists(profile), true, 'the profile dir is present');

    await browser.close();

    assert.equal((await browser.state()).windowOpen, false, 'windowOpen is false after close()');
    assert.equal(await exists(profile), false, 'the temp profile dir is removed');

    const reopened = await browser.open(launchUrl);
    assert.equal(reopened.settled, true, 'a fresh window opened after the close');
    assert.equal((await browser.state()).windowOpen, true, 'windowOpen is true again');
    const freshProfile = browser.profilePath();
    assert.ok(freshProfile && freshProfile !== profile, 'a new throwaway profile is used');
  } finally {
    await browser.stop();
    await closeServer(server);
  }
});

// The acceptance test for "no tabs, no address bar": the live window must be a
// real chromeless `--app` window. `Browser.open()` is exactly the launch path
// `POST /open` runs; the same launch args and the same window result, so the
// window mode measured here is the window mode the service opens.
test('the live window is chromeless: standalone, no browser chrome, no omnibox target', { timeout: 60_000 }, async (t) => {
  if (!(await exists(CHROME))) {
    t.skip(`Chrome not found at ${CHROME}`);
    return;
  }

  const { server, port } = await serve('<!doctype html><html><head><title>chromeless</title></head><body><h1>ok</h1></body></html>');
  const url = `http://127.0.0.1:${port}/`;

  const previousWindow = process.env.DS_WINDOW;
  process.env.DS_WINDOW = OFFSCREEN;
  const browser = new Browser();
  if (previousWindow === undefined) delete process.env.DS_WINDOW;
  else process.env.DS_WINDOW = previousWindow;

  try {
    const opened = await browser.open(url);
    assert.equal(opened.settled, true, 'the served page settled');

    // (1) The window presents as a standalone app window, not a browser tab.
    const displayMode = await browser.evaluate("matchMedia('(display-mode: standalone)').matches");
    // (2) An app window has essentially no browser chrome. A normal tabbed
    //     window is ~80-90px taller than its viewport (tab strip + omnibox).
    const chromePx = Number(await browser.evaluate('window.outerHeight - window.innerHeight'));
    // (3) A normal window also exposes a chrome://omnibox-popup target. An app
    //     window must have none.
    const list = await browser.jsonList();
    const omnibox = list.filter((target) => String(target.url ?? '').startsWith('chrome://omnibox-popup'));
    const pageTargets = list.filter((target) => target.type === 'page');

    console.log(
      `[chromeless] display-mode standalone=${displayMode}, outerHeight-innerHeight=${chromePx}px, pageTargets=${pageTargets.length}, omniboxTargets=${omnibox.length}`,
    );

    assert.equal(displayMode, true, 'display-mode is standalone (an app window, not a tab)');
    assert.ok(Number.isFinite(chromePx) && chromePx < 60, `little/no browser chrome (outer-inner=${chromePx}px)`);
    assert.equal(omnibox.length, 0, 'no chrome://omnibox-popup target (no address bar)');
  } finally {
    await browser.stop();
    await closeServer(server);
  }
});
