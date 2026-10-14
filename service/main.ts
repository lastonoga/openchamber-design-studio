// Design Studio local service.
//
// The panel iframe cannot touch the filesystem or the network, so this process
// owns the real Chrome window the live view is: the panel asks it to open or
// navigate a window (`/open`), raise it without reloading (`/focus`), read its
// state (`/state`) and reports change stats (`/stat`) so the panel can reload
// when the agent edits a file. Picking is a Cmd/Ctrl-click gesture in the live
// window (browser.ts's PICK_SCRIPT), not a route.
//
// Contract (GUEST_SERVICES.md): bind 127.0.0.1 on OPENCHAMBER_SERVICE_PORT,
// require `Authorization: Bearer OPENCHAMBER_SERVICE_TOKEN` on every request
// including /health, and answer GET /health with 200 once ready.
import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { readStudioConfig, writeStudioConfig } from './studio-config.ts';
import { ensureDevServer, getDevServerStatus, isLoopbackUrl, stopDevServer } from './project-server.ts';
import { ensureBrowser, getBrowser, stopBrowser } from './surface.ts';
import { reapOrphanChrome } from './browser.ts';
import { handleBrowserControl } from './browser-control.ts';
import { handleVerifyRequest } from './verify-routes.ts';
import { writeHarnessPlugin } from './harness-plugin.ts';
import { listProjectFiles, resolveReferencePath } from './project-files.ts';
import { scaffoldProject } from './scaffold.ts';
import { BROWSER_PROVIDER_PATH } from '@openchamber/sdk';

const PORT = Number(process.env.OPENCHAMBER_SERVICE_PORT ?? 0);
const TOKEN = process.env.OPENCHAMBER_SERVICE_TOKEN ?? '';

if (!PORT || !TOKEN) {
  console.error('[design-studio] missing OPENCHAMBER_SERVICE_PORT or OPENCHAMBER_SERVICE_TOKEN');
  process.exit(1);
}

type Json = Record<string, unknown>;

function sendJson(res: http.ServerResponse, status: number, body: Json): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
  });
  res.end(text);
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

async function requireFile(root: string, rel: string): Promise<string | null> {
  const abs = path.resolve(root, rel);
  const rootAbs = path.resolve(root);
  if (abs !== rootAbs && !abs.startsWith(rootAbs + path.sep)) return null;
  try {
    const stat = await fs.stat(abs);
    return stat.isFile() ? abs : null;
  } catch {
    return null;
  }
}

/** Newest mtime among the entry and the files beside it, so a sibling edit reloads. */
async function newestMtime(dir: string, entryAbs: string): Promise<number> {
  let newest = 0;
  try {
    newest = (await fs.stat(entryAbs)).mtimeMs;
  } catch {
    /* entry unreadable; still report siblings */
  }
  try {
    const names = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of names) {
      if (!entry.isFile()) continue;
      try {
        const stat = await fs.stat(path.join(dir, entry.name));
        if (stat.mtimeMs > newest) newest = stat.mtimeMs;
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* directory gone */
  }
  return newest;
}

const server = http.createServer(async (req, res) => {
  const auth = req.headers['authorization'];
  if (auth !== `Bearer ${TOKEN}`) {
    sendJson(res, 401, { error: 'unauthorized' });
    return;
  }

  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
  const params = url.searchParams;

  try {
    // The agent-facing browser provider. The host posts every browser.* action
    // here with the same bearer token; we answer with the BrowserProviderResult
    // union. A failed action is a 200 with `ok:false` and an actionable message,
    // never a transport error, so the agent can read it and correct itself.
    if (req.method === 'POST' && url.pathname === BROWSER_PROVIDER_PATH) {
      const body = await readBody(req);
      const result = await handleBrowserControl(req, body);
      sendJson(res, 200, result as unknown as Json);
      return;
    }

    // The verify routes (run the matrix, return the last report).
    if (url.pathname === '/verify' || url.pathname.startsWith('/verify/')) {
      if (await handleVerifyRequest(req, res)) return;
    }

    // Write the project-local OpenCode plugin that runs the harness in-session.
    // Called by the panel when Design Mode turns ON for a ready project. Writing
    // into the project is a deliberate side effect; harness-plugin.ts never
    // clobbers a file it did not generate and is idempotent.
    if (url.pathname === '/harness') {
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'POST required' });
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(await readBody(req));
      } catch {
        sendJson(res, 400, { error: 'body must be JSON' });
        return;
      }
      const dir = (parsed as { dir?: unknown } | null)?.dir;
      if (typeof dir !== 'string' || !path.isAbsolute(dir)) {
        sendJson(res, 400, { error: 'dir must be an absolute project path' });
        return;
      }
      try {
        sendJson(res, 200, (await writeHarnessPlugin(dir)) as unknown as Json);
      } catch (error) {
        sendJson(res, 400, { error: error instanceof Error ? error.message : 'could not write harness plugin' });
      }
      return;
    }

    // Validate an explicitly pasted reference; no file contents are returned.
    if (url.pathname === '/reference') {
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'POST required' });
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(await readBody(req));
      } catch {
        sendJson(res, 400, { error: 'body must be JSON' });
        return;
      }
      const body = parsed as { dir?: unknown; path?: unknown } | null;
      if (typeof body?.dir !== 'string' || typeof body.path !== 'string') {
        sendJson(res, 400, { error: 'dir and path must be strings. Paste an accessible file path.' });
        return;
      }
      try {
        sendJson(res, 200, { ...(await resolveReferencePath(body.dir, body.path)) });
      } catch (error) {
        sendJson(res, 400, { error: error instanceof Error ? error.message : 'could not validate file path' });
      }
      return;
    }

    // List a project's files so the panel can attach a FILE reference to a
    // message. Bearer-authed; `dir` must be an absolute path and `limit`, when
    // present, a positive integer. A listing the service cannot produce (a
    // missing or unreadable directory) is a 200 with `ok:false`, never a
    // transport error.
    if (url.pathname === '/files') {
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'POST required' });
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(await readBody(req));
      } catch {
        sendJson(res, 400, { error: 'body must be JSON' });
        return;
      }
      const body = parsed as { dir?: unknown; limit?: unknown } | null;
      const dir = body?.dir;
      if (typeof dir !== 'string' || !path.isAbsolute(dir)) {
        sendJson(res, 400, { error: 'dir must be an absolute project path' });
        return;
      }
      const limit = body?.limit;
      if (limit !== undefined && (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1)) {
        sendJson(res, 400, { error: 'limit must be a positive integer' });
        return;
      }
      try {
        sendJson(res, 200, { ok: true, files: await listProjectFiles(dir, limit) });
      } catch (error) {
        sendJson(res, 200, { ok: false, error: error instanceof Error ? error.message : 'could not list files' });
      }
      return;
    }

    // Scaffold a design project server-side, before the agent session starts, so
    // the panel has a live URL the moment Design Mode opens. The dir must be an
    // absolute path and type a non-empty string; questions of validity are a
    // 400, everything the scaffold itself decides (already exists, port busy,
    // install failure, server did not come up) is a 200 with `ok:false`.
    if (url.pathname === '/scaffold') {
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'POST required' });
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(await readBody(req));
      } catch {
        sendJson(res, 400, { error: 'body must be JSON' });
        return;
      }
      const body = parsed as
        | { dir?: unknown; type?: unknown; direction?: unknown; fidelity?: unknown; brief?: unknown; designSystemId?: unknown }
        | null;
      const dir = body?.dir;
      const type = body?.type;
      if (typeof dir !== 'string' || !path.isAbsolute(dir)) {
        sendJson(res, 400, { error: 'dir must be an absolute project path' });
        return;
      }
      if (typeof type !== 'string' || type.trim() === '') {
        sendJson(res, 400, { error: 'type must be a non-empty string' });
        return;
      }
      // designSystemId is optional; only a present non-string value is invalid.
      if (body?.designSystemId !== undefined && typeof body.designSystemId !== 'string') {
        sendJson(res, 400, { error: 'designSystemId must be a string' });
        return;
      }
      const str = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);
      sendJson(
        res,
        200,
        (await scaffoldProject({
          dir,
          type,
          direction: str(body?.direction),
          fidelity: str(body?.fidelity),
          brief: str(body?.brief),
          designSystemId: str(body?.designSystemId),
        })) as unknown as Json,
      );
      return;
    }

    // Start (or confirm) the dev server for a project dir. The service reads
    // the project's `.design-studio.json` and only ever tries to start a loopback
    // URL. Bearer-authed; an absolute `dir` and a loopback `url` are required.
    // A business failure is a 200 with `ok:false` and an actionable `error`.
    if (url.pathname === '/server/start') {
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'POST required' });
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(await readBody(req));
      } catch {
        sendJson(res, 400, { error: 'body must be JSON' });
        return;
      }
      const dir = (parsed as { dir?: unknown } | null)?.dir;
      if (typeof dir !== 'string' || !path.isAbsolute(dir)) {
        sendJson(res, 400, { error: 'dir must be an absolute project path' });
        return;
      }
      const targetUrl = (parsed as { url?: unknown } | null)?.url;
      if (typeof targetUrl !== 'string' || targetUrl === '') {
        sendJson(res, 400, { error: 'url is required' });
        return;
      }
      if (!isLoopbackUrl(targetUrl)) {
        sendJson(res, 400, { error: 'url must be a loopback address' });
        return;
      }
      try {
        const { config } = await readStudioConfig(dir);
        if (!config?.url?.trim()) {
          sendJson(res, 200, { ok: false, started: false, up: false, error: 'no .design-studio.json url found' });
          return;
        }
        const configuredUrl = config.url.trim();
        if (!isLoopbackUrl(configuredUrl)) {
          sendJson(res, 200, { ok: false, started: false, up: false, error: 'configured url is not loopback' });
          return;
        }
        // The request url is validation-only: the config's url is authoritative,
        // so the probe, the record and the recorded port all use the URL the
        // project is actually pinned to. `ownedOnly` keeps a manual start from
        // announcing a foreign process on the configured port as our running
        // server: without a verified record it refuses with the port-in-use
        // error instead. (/open stays permissive for externally served previews.)
        const result = await ensureDevServer(configuredUrl, { dir, ownedOnly: true });
        sendJson(res, 200, { ok: result.up, started: result.started, up: result.up, error: result.error });
      } catch (error) {
        sendJson(res, 200, { ok: false, started: false, up: false, error: error instanceof Error ? error.message : 'could not start the dev server' });
      }
      return;
    }

    // Stop the dev server the service started for a project dir (Design Mode
    // OFF, or the panel's manual escape hatch). The service ONLY kills a process
    // group it recorded for this dir; an unknown dir is a no-op. Bearer-authed,
    // an absolute dir required; a business failure is a 200 with ok:false.
    if (url.pathname === '/server/stop') {
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'POST required' });
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(await readBody(req));
      } catch {
        sendJson(res, 400, { error: 'body must be JSON' });
        return;
      }
      const dir = (parsed as { dir?: unknown } | null)?.dir;
      if (typeof dir !== 'string' || !path.isAbsolute(dir)) {
        sendJson(res, 400, { error: 'dir must be an absolute project path' });
        return;
      }
      try {
        const result = await stopDevServer(dir);
        // A clean no-op (nothing recorded) stays ok:true; a refusal or failed
        // kill carries ok:false with the actionable error.
        sendJson(
          res,
          200,
          result.error
            ? { ok: false, stopped: result.stopped, error: result.error }
            : { ok: true, stopped: result.stopped },
        );
      } catch (error) {
        sendJson(res, 200, { ok: false, error: error instanceof Error ? error.message : 'could not stop the dev server' });
      }
      return;
    }

    // Status of the dev server recorded for a project dir, so the panel can
    // show/verify the preview without starting anything.
    if (url.pathname === '/server/status') {
      const dir = params.get('dir') ?? '';
      if (!path.isAbsolute(dir)) {
        sendJson(res, 400, { error: 'dir must be absolute' });
        return;
      }
      try {
        sendJson(res, 200, (await getDevServerStatus(dir)) as unknown as Json);
      } catch (error) {
        sendJson(res, 200, { up: false, port: null, error: error instanceof Error ? error.message : 'could not read server status' });
      }
      return;
    }

    if (url.pathname === '/health') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('ok');
      return;
    }

    if (url.pathname === '/stat') {
      const root = params.get('dir') ?? '';
      const entry = params.get('path') ?? '';
      if (!path.isAbsolute(root)) {
        sendJson(res, 400, { error: 'dir must be absolute' });
        return;
      }
      const abs = await requireFile(root, entry);
      if (!abs) {
        sendJson(res, 404, { error: 'entry not found' });
        return;
      }
      const dir = path.dirname(abs);
      sendJson(res, 200, { mtime: await newestMtime(dir, abs) });
      return;
    }

    // The live window's state. Never starts the browser: a panel that only
    // reads state must not pop a Chrome window.
    if (url.pathname === '/state') {
      const target = getBrowser();
      if (!target) {
        sendJson(res, 200, { url: '', title: '', lastPick: null, pickSeq: 0, windowOpen: false });
        return;
      }
      sendJson(res, 200, (await target.state()) as unknown as Json);
      return;
    }

    // Open (or navigate) the real Chrome window at the target URL.
    if (url.pathname === '/open') {
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'POST required' });
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(await readBody(req));
      } catch {
        sendJson(res, 400, { error: 'body must be JSON' });
        return;
      }
      const body = parsed as { url?: unknown; dir?: unknown } | null;
      const target = body?.url;
      if (typeof target !== 'string' || target === '') {
        sendJson(res, 400, { error: 'url is required' });
        return;
      }
      const dir = typeof body?.dir === 'string' && body.dir !== '' ? body.dir : null;
      if (dir && !path.isAbsolute(dir)) {
        sendJson(res, 400, { error: 'dir must be absolute' });
        return;
      }
      // A loopback URL may belong to a project's dev server. When a project dir
      // is known (or the URL is loopback) make sure the server is up first: a
      // dead server must yield `ok:false`, never a window on Chrome's error page.
      let started = false;
      if (dir || isLoopbackUrl(target)) {
        const dev = await ensureDevServer(target, { dir: dir ?? undefined });
        if (!dev.up) {
          sendJson(res, 200, { ok: false, error: dev.error ?? 'the dev server is not available' });
          return;
        }
        started = dev.started;
      }
      try {
        const browser = await ensureBrowser(target);
        const nav = await browser.open(target);
        sendJson(res, 200, { ok: true, url: nav.url, title: nav.title, settled: nav.settled, started });
      } catch (error) {
        sendJson(res, 200, { ok: false, error: error instanceof Error ? error.message : 'open failed' });
      }
      return;
    }

    // Close the live window and quit Chrome (Design Mode going OFF). Idempotent:
    // with no browser started there is nothing to quit and it answers ok:true.
    // Also reaps any orphan `ds-chrome-` Chrome process left by an earlier
    // service instance, so OFF always ends with no lingering window.
    if (url.pathname === '/close') {
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'POST required' });
        return;
      }
      const browser = getBrowser();
      if (browser) await browser.close();
      try {
        await reapOrphanChrome();
      } catch {
        /* best effort: closing the tracked window already succeeded */
      }
      sendJson(res, 200, { ok: true });
      return;
    }

    // Briefly re-flash an element in the live window by CSS selector. The panel
    // posts this while the user hovers a reference row so the corresponding
    // element is visible in the window. Bearer-authed; answers ok:false (never a
    // transport error) with no window open or when the selector matches nothing.
    if (url.pathname === '/highlight') {
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'POST required' });
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(await readBody(req));
      } catch {
        sendJson(res, 400, { error: 'body must be JSON' });
        return;
      }
      const selector = (parsed as { selector?: unknown } | null)?.selector;
      if (typeof selector !== 'string' || selector === '') {
        sendJson(res, 400, { error: 'selector is required' });
        return;
      }
      const browser = getBrowser();
      if (!browser) {
        sendJson(res, 200, { ok: false, error: 'no live window is open' });
        return;
      }
      try {
        const highlighted = await browser.highlight(selector);
        if (!highlighted) {
          sendJson(res, 200, { ok: false, error: 'selector did not match any element' });
          return;
        }
        sendJson(res, 200, { ok: true });
      } catch (error) {
        sendJson(res, 200, { ok: false, error: error instanceof Error ? error.message : 'highlight failed' });
      }
      return;
    }

    // Raise the live window WITHOUT navigating or reloading it. Idempotent and
    // safe with no window open (answers ok:true so the panel's Focus control
    // never surfaces a dead error).
    if (url.pathname === '/focus') {
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'POST required' });
        return;
      }
      const browser = getBrowser();
      if (browser) await browser.focus();
      sendJson(res, 200, { ok: true });
      return;
    }

    if (url.pathname === '/config') {
      const root = params.get('dir') ?? '';
      if (!path.isAbsolute(root)) {
        sendJson(res, 400, { error: 'dir must be absolute' });
        return;
      }
      if (req.method === 'PUT') {
        const body = await readBody(req);
        let parsed: { path?: string | null; text?: string };
        try {
          parsed = JSON.parse(body) as { path?: string | null; text?: string };
        } catch {
          sendJson(res, 400, { error: 'body must be JSON' });
          return;
        }
        if (typeof parsed.text !== 'string') {
          sendJson(res, 400, { error: 'text is required' });
          return;
        }
        try {
          sendJson(res, 200, { ...(await writeStudioConfig(root, parsed.path ?? null, parsed.text)) });
        } catch (error) {
          sendJson(res, 400, { error: error instanceof Error ? error.message : 'invalid config' });
        }
        return;
      }
      sendJson(res, 200, { ...(await readStudioConfig(root)) });
      return;
    }

    sendJson(res, 404, { error: 'not found' });
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : 'internal error' });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[design-studio] service listening on 127.0.0.1:${PORT}`);
});

let shuttingDown = false;
async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    await stopBrowser();
  } catch {
    /* nothing to stop */
  }
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown();
});
process.on('SIGTERM', () => {
  void shutdown();
});
