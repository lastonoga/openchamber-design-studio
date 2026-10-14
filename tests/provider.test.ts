// The agent-facing browser provider, driven end to end through the real service
// and a real headless Chrome: a page that overflows a phone must fail G1, and a
// successful action must carry the bounded `verification` block. An unknown
// action must answer `ok:false` with an actionable message.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { access, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createServer, type Server } from 'node:http';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CHROME = process.env.DS_CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TOKEN = 'provider-acceptance-token';
const AUTH = { authorization: `Bearer ${TOKEN}` };

const OVERFLOW_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  html, body { margin: 0; }
  .wide { width: 2000px; height: 120px; background: #f00; }
</style></head><body><h1>Wide</h1><div class="wide"></div></body></html>`;

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

function listen(server: Server, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve());
  });
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

function postControl(base: string, body: unknown): Promise<Response> {
  return fetch(`${base}/browser-control`, {
    method: 'POST',
    headers: { ...AUTH, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

type ProviderBody = {
  ok: boolean;
  error?: string;
  data?: {
    viewport?: { mode?: string; width?: number | null; height?: number | null };
    verification?: {
      url?: string;
      viewports?: string[];
      gates?: { gate: string; status: string; summary: { p0: number; p1: number; p2: number } }[];
    };
  };
};

test('browser-control returns a verification block and fails G1 on a wide page', { timeout: 90_000 }, async (t) => {
  if (!(await exists(CHROME))) {
    t.skip(`Chrome not found at ${CHROME}`);
    return;
  }

  const sitePort = 47_500 + Math.floor(Math.random() * 1500);
  const site = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(OVERFLOW_HTML);
  });
  await listen(site, sitePort, '127.0.0.1');

  const port = 49_500 + Math.floor(Math.random() * 1500);
  const base = `http://127.0.0.1:${port}`;
  const project = await mkdtemp(path.join(tmpdir(), 'ds-provider-'));
  const context = { directory: project, sessionId: null };

  const child = spawn(process.execPath, [path.join(root, 'service', 'main.js')], {
    env: { ...process.env, DS_KILL_WINDOW_ON_STOP: '1', OPENCHAMBER_SERVICE_PORT: String(port), OPENCHAMBER_SERVICE_TOKEN: TOKEN },
    stdio: 'ignore',
  });

  try {
    await waitForHealth(base, child);

    const openRes = await postControl(base, {
      requestId: 'req-open',
      action: 'browser.open',
      parameters: { url: `http://127.0.0.1:${sitePort}/`, viewport: 'mobile' },
      context,
    });
    assert.equal(openRes.status, 200, 'open answers 200');
    const opened = (await openRes.json()) as ProviderBody;
    assert.equal(opened.ok, true, 'open succeeded');
    assert.ok(opened.data?.verification, 'open carries a verification block');
    assert.equal(opened.data!.viewport?.mode, 'mobile', 'open restored the requested mobile viewport after the matrix');
    assert.deepEqual(
      opened.data!.verification!.viewports,
      ['mobile', 'tablet', 'desktop', 'wide'],
      'open runs the full viewport matrix, not just one breakpoint',
    );

    const g1 = opened.data!.verification!.gates?.find((gate) => gate.gate === 'G1');
    assert.ok(g1, 'G1 is reported');
    assert.equal(g1!.status, 'fail', 'G1 fails on a horizontally overflowing page across the matrix');
    assert.ok((g1!.summary.p0 ?? 0) >= 1, 'G1 carries at least one P0 finding');
    console.log(`[provider] G1 => ${JSON.stringify(g1)}`);
    console.log(`[provider] open viewports => ${JSON.stringify(opened.data!.verification!.viewports)}`);

    const resizeRes = await postControl(base, {
      requestId: 'req-resize',
      action: 'browser.resize',
      parameters: { viewport: 'tablet' },
      context,
    });
    assert.equal(resizeRes.status, 200, 'resize answers 200');
    const resized = (await resizeRes.json()) as ProviderBody;
    assert.equal(resized.ok, true, 'resize succeeded');
    assert.ok(resized.data?.verification, 'resize carries a verification block');
    assert.equal(resized.data!.viewport?.width, 768, 'resize settled on the tablet width');
    assert.deepEqual(
      resized.data!.verification!.viewports,
      ['tablet'],
      'resize reports only the viewport it just set (no matrix walk)',
    );
    console.log(`[provider] resize viewport => ${JSON.stringify(resized.data!.viewport)}`);

    const unknownRes = await postControl(base, {
      requestId: 'req-unknown',
      action: 'browser.wiggle',
      parameters: {},
      context: { directory: null, sessionId: null },
    });
    assert.equal(unknownRes.status, 200, 'an unknown action is still a parseable answer');
    const unknown = (await unknownRes.json()) as ProviderBody;
    assert.equal(unknown.ok, false, 'an unknown action is refused');
    assert.match(String(unknown.error), /action/i, 'the error names the problem');
    console.log(`[provider] unknown => ${unknown.error}`);
  } finally {
    child.kill('SIGTERM');
    await new Promise<void>((resolve) => site.close(() => resolve()));
    await delay(600);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
});
