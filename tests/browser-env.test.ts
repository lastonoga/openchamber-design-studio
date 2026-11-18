// Browser mode selection (service/browser-env.ts) and the service behaviour it
// drives: host mode never launches Chrome, and a missing or unusable Chrome is a
// readable `ok:false`, never a crashed service.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { chmod, mkdtemp, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  chromeCandidates,
  decideMode,
  detectDisplay,
  readServiceConfig,
  resolveBrowserSetup,
  resolveChromePath,
  type Probe,
} from '../service/browser-env.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TOKEN = 'browser-env-token';
const AUTH = { authorization: `Bearer ${TOKEN}` };

function probe(over: Partial<Probe> & { files?: string[]; dirs?: Record<string, string[]>; contents?: Record<string, string> } = {}): Probe {
  const files = new Set(over.files ?? []);
  return {
    platform: over.platform ?? 'linux',
    env: over.env ?? {},
    exists: over.exists ?? ((file) => files.has(file) || Object.hasOwn(over.contents ?? {}, file)),
    list: over.list ?? ((dir) => over.dirs?.[dir] ?? []),
    read: over.read ?? ((file) => {
      const text = over.contents?.[file];
      if (text === undefined) throw new Error('ENOENT');
      return text;
    }),
  };
}

test('Linux candidates cover Google Chrome and Chromium installs', () => {
  const list = chromeCandidates('linux', {});
  for (const expected of ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/opt/google/chrome/chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium']) {
    assert.ok(list.includes(expected), `${expected} is probed`);
  }
});

test('resolveChromePath takes the first install that exists', () => {
  const found = resolveChromePath(probe({ files: ['/usr/bin/chromium'] }));
  assert.equal(found.path, '/usr/bin/chromium');
  assert.equal(resolveChromePath(probe()).path, null);
});

test('an explicit path wins (env over config) and is returned even when missing', () => {
  assert.equal(resolveChromePath(probe({ env: { DS_CHROME_PATH: '/env/chrome' } }), '/cfg/chrome').path, '/env/chrome');
  assert.equal(resolveChromePath(probe(), '/cfg/chrome').path, '/cfg/chrome');
});

test('Windows candidates anchor on SYSTEMDRIVE and LOCALAPPDATA (PROGRAMFILES is scrubbed)', () => {
  const list = chromeCandidates('win32', { SYSTEMDRIVE: 'D:', LOCALAPPDATA: 'D:\\Users\\me\\AppData\\Local' });
  assert.equal(list[0], 'D:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');
  assert.ok(list.some((entry) => entry.startsWith('D:\\Users\\me\\AppData\\Local')));
});

test('detectDisplay finds an X11 socket the host stripped DISPLAY for', () => {
  const display = detectDisplay(probe({ dirs: { '/tmp/.X11-unix': ['X1', 'X0', 'junk'] } }));
  assert.equal(display.found, true);
  assert.deepEqual(display.env, { DISPLAY: ':0' });
});

test('detectDisplay finds a Wayland socket in XDG_RUNTIME_DIR', () => {
  const display = detectDisplay(probe({ env: { XDG_RUNTIME_DIR: '/run/user/1000' }, dirs: { '/run/user/1000': ['bus', 'wayland-0'] } }));
  assert.equal(display.found, true);
  assert.deepEqual(display.env, { WAYLAND_DISPLAY: 'wayland-0' });
  assert.deepEqual(display.args, ['--ozone-platform=wayland']);
});

test('detectDisplay reports a headless Linux box; macOS always has a display', () => {
  assert.equal(detectDisplay(probe()).found, false);
  assert.equal(detectDisplay(probe({ platform: 'darwin' })).found, true);
});

test('auto picks host mode without Chrome or without a display, own mode with both', () => {
  const screen = { found: true, env: {}, args: [], description: 'X11 display :0' };
  const none = { found: false, env: {}, args: [], description: 'no X11 or Wayland display' };
  assert.equal(decideMode('auto', null, false, screen).mode, 'host');
  assert.equal(decideMode('auto', '/usr/bin/chromium', true, none).mode, 'host');
  assert.equal(decideMode('auto', '/usr/bin/chromium', true, screen).mode, 'own');
  assert.equal(decideMode('own', null, false, none).mode, 'own', 'an explicit mode is honoured');
  assert.equal(decideMode('host', '/usr/bin/chromium', true, screen).mode, 'host');
});

test('the service config file sets the mode and Chrome path; bad values are reported', () => {
  const file = '/data/config.json';
  const good = readServiceConfig(probe({ contents: { [file]: '{"browserMode":"host","chromePath":"/x/chrome"}' } }), file);
  assert.deepEqual(good.config, { browserMode: 'host', chromePath: '/x/chrome' });
  const bad = readServiceConfig(probe({ contents: { [file]: '{"browserMode":"window"}' } }), file);
  assert.match(bad.error ?? '', /browserMode/);
  assert.deepEqual(readServiceConfig(probe(), file).config, {}, 'a missing file is an empty config');
});

test('resolveBrowserSetup: env mode beats the config file', () => {
  const setup = resolveBrowserSetup(
    probe({ env: { DS_BROWSER_MODE: 'own' }, contents: { '/data/config.json': '{"browserMode":"host"}' } }),
    '/data',
  );
  assert.equal(setup.requested, 'own');
  assert.equal(setup.configPath, '/data/config.json');
});

// ---- the service in each mode ----

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function startService(env: Record<string, string>): Promise<{ port: number; child: ChildProcess }> {
  const port = await freePort();
  const base = { ...process.env };
  delete base.DS_BROWSER_MODE;
  delete base.DS_CHROME_PATH;
  const child = spawn(process.execPath, [path.join(root, 'service', 'main.js')], {
    env: { ...base, DS_KILL_WINDOW_ON_STOP: '1', OPENCHAMBER_SERVICE_PORT: String(port), OPENCHAMBER_SERVICE_TOKEN: TOKEN, ...env },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`service exited early: ${child.exitCode}`);
    try {
      if ((await fetch(`http://127.0.0.1:${port}/health`, { headers: AUTH })).status === 200) return { port, child };
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill();
  throw new Error('service did not become healthy');
}

async function post(port: number, route: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`http://127.0.0.1:${port}${route}`, { method: 'POST', headers: { ...AUTH, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return (await res.json()) as Record<string, unknown>;
}

async function get(port: number, route: string): Promise<Record<string, unknown>> {
  return (await (await fetch(`http://127.0.0.1:${port}${route}`, { headers: AUTH })).json()) as Record<string, unknown>;
}

test('host mode (from the config file): /open launches nothing and hands the URL back', async () => {
  const data = await mkdtemp(path.join(tmpdir(), 'ds-data-'));
  await writeFile(path.join(data, 'config.json'), JSON.stringify({ browserMode: 'host' }));
  const { port, child } = await startService({ OPENCHAMBER_SERVICE_DATA_DIR: data });
  try {
    const setup = await get(port, '/browser');
    assert.equal(setup.mode, 'host');
    assert.equal(setup.requested, 'host');
    assert.equal(setup.configPath, path.join(data, 'config.json'));

    const before = await get(port, '/state');
    assert.equal(before.hostMode, true);
    assert.equal(before.windowOpen, false);

    const opened = await post(port, '/open', { url: 'https://example.com/' });
    assert.deepEqual(opened, { ok: true, url: 'https://example.com/', title: '', settled: false, started: false, host: true });

    const open = await get(port, '/state');
    assert.equal(open.windowOpen, true);
    assert.equal(open.url, 'https://example.com/');

    const highlight = await post(port, '/highlight', { selector: 'h1' });
    assert.equal(highlight.ok, false);
    assert.match(String(highlight.error), /host browser mode/);

    // The agent's browser.* actions, if Design Studio is still the selected
    // provider, get an answer that says how to switch.
    const action = await post(port, '/browser-control', { requestId: 'r1', action: 'browser.snapshot', parameters: {} });
    assert.equal(action.ok, false);
    assert.match(String(action.error), /OpenChamber Web/);

    assert.deepEqual(await post(port, '/close', {}), { ok: true });
    assert.equal((await get(port, '/state')).windowOpen, false);
  } finally {
    child.kill();
  }
});

test('a Chrome path that cannot be executed fails the open; the service stays up', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ds-fake-chrome-'));
  const fake = path.join(dir, 'chrome');
  await writeFile(fake, 'not a program');
  await chmod(fake, 0o644);
  const { port, child } = await startService({ DS_BROWSER_MODE: 'own', DS_CHROME_PATH: fake });
  try {
    const opened = await post(port, '/open', { url: 'https://example.com/' });
    assert.equal(opened.ok, false);
    assert.match(String(opened.error), /Chrome could not start|not found/);
    assert.equal(child.exitCode, null, 'the service did not crash');
    assert.equal((await fetch(`http://127.0.0.1:${port}/health`, { headers: AUTH })).status, 200);
  } finally {
    child.kill();
  }
});

test('a missing Chrome in own mode is an actionable error, not a crash', async () => {
  const { port, child } = await startService({ DS_BROWSER_MODE: 'own', DS_CHROME_PATH: '/nonexistent/google-chrome' });
  try {
    const opened = await post(port, '/open', { url: 'https://example.com/' });
    assert.equal(opened.ok, false);
    assert.match(String(opened.error), /Chrome was not found at \/nonexistent\/google-chrome/);
    assert.match(String(opened.error), /"browserMode": "host"/);
    assert.equal(child.exitCode, null);
  } finally {
    child.kill();
  }
});
