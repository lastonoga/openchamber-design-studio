// The verifying harness, exercised through the real service route. The teeth:
// `POST /verify` walks the full viewport matrix, the report carries all five
// deterministic gates in order and no pixel-baseline state, and
// `GET /verify/report` returns the same run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { access, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createServer, type Server } from 'node:http';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CHROME = process.env.DS_CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TOKEN = 'verify-acceptance-token';
const AUTH = { authorization: `Bearer ${TOKEN}` };

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
  html, body { margin: 0; }
  main { padding: 16px; }
  button { min-width: 48px; min-height: 48px; }
</style></head><body><h1>Clean</h1><main><button aria-label="Save">Save</button></main></body></html>`;

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

function listen(server: Server, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, () => {
      const address = server.address();
      resolve(typeof address === 'object' && address ? address.port : 0);
    });
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

type Report = {
  url?: string;
  ranAt?: string;
  viewports?: string[];
  gates?: { gate: string; status: string }[];
  summary?: { p0: number; p1: number; p2: number };
  iterations?: number;
  captures?: unknown;
  halted?: unknown;
};

test('POST /verify runs the five-gate matrix and GET /verify/report returns it', { timeout: 120_000 }, async (t) => {
  if (!(await exists(CHROME))) {
    t.skip(`Chrome not found at ${CHROME}`);
    return;
  }

  const site = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(PAGE);
  });
  const sitePort = await listen(site, '127.0.0.1');
  const url = `http://127.0.0.1:${sitePort}/`;

  const project = await mkdtemp(path.join(tmpdir(), 'ds-verify-'));
  await writeFile(path.join(project, 'index.html'), PAGE);
  await writeFile(path.join(project, 'tokens.css'), ':root {\n  --brand: #123456;\n}\n');
  await writeFile(path.join(project, 'styles.css'), 'main {\n  color: var(--brand);\n}\n');

  const port = 48_500 + Math.floor(Math.random() * 1500);
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [path.join(root, 'service', 'main.js')], {
    env: { ...process.env, DS_KILL_WINDOW_ON_STOP: '1', OPENCHAMBER_SERVICE_PORT: String(port), OPENCHAMBER_SERVICE_TOKEN: TOKEN },
    stdio: 'ignore',
  });

  try {
    await waitForHealth(base, child);

    const res = await fetch(`${base}/verify`, {
      method: 'POST',
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ dir: project, url }),
    });
    assert.equal(res.status, 200, '/verify answers 200');
    const report = (await res.json()) as Report;

    assert.deepEqual(
      report.gates?.map((gate) => gate.gate),
      ['G1', 'G4', 'G3', 'G6', 'G5'],
      'all five gates are reported in GATE_ORDER',
    );
    assert.deepEqual(report.viewports, ['mobile', 'tablet', 'desktop', 'wide'], 'the full matrix ran');
    assert.equal(report.iterations, 4, 'four viewport iterations ran');
    assert.equal(typeof report.summary?.p0, 'number');
    assert.equal('captures' in report, false, 'no pixel-baseline captures on the report');
    console.log(`[verify] gates => ${JSON.stringify(report.gates?.map((g) => `${g.gate}:${g.status}`))}`);

    const last = await fetch(`${base}/verify/report`, { headers: AUTH });
    assert.equal(last.status, 200, 'GET /verify/report answers 200');
    const stored = (await last.json()) as Report;
    assert.equal(typeof stored.ranAt, 'string', 'the stored report is the last run');
    assert.deepEqual(stored.viewports, ['mobile', 'tablet', 'desktop', 'wide'], 'the stored report is the same matrix run');
  } finally {
    child.kill('SIGTERM');
    await new Promise<void>((resolve) => site.close(() => resolve()));
    await delay(600);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
});
