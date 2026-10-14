// The verify routes. The agent never sees these directly: its browser contract
// lives at /browser-control. These two routes drive the shared matrix runner and
// expose the last report for tooling that wants the full gate table.
//
//   POST /verify                  run runVerification and return the report
//   GET  /verify/report           the most recent report
//
// Bearer auth is applied once, in main.ts, before this runs.
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';

import type { VerifyReport } from '../shared/verify-types.ts';
import { getLastReport, runVerification } from './verify.ts';

const MAX_BODY_BYTES = 1_000_000;

function sendJson(res: ServerResponse, status: number, body: Record<string, unknown>): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
  });
  res.end(text);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  try {
    const parsed = JSON.parse(await readBody(req)) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function handleRun(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req);
  if (!body) {
    sendJson(res, 400, { error: 'body must be JSON' });
    return;
  }
  const dir = body.dir;
  const url = body.url;
  if (typeof dir !== 'string' || !path.isAbsolute(dir)) {
    sendJson(res, 400, { error: 'dir must be an absolute project path' });
    return;
  }
  if (typeof url !== 'string' || url === '') {
    sendJson(res, 400, { error: 'url is required' });
    return;
  }

  const report = await runVerification({
    dir,
    url,
    ...(Array.isArray(body.viewports) ? { viewports: body.viewports.filter((v): v is string => typeof v === 'string') } : {}),
  });
  sendJson(res, 200, report as unknown as Record<string, unknown>);
}

function handleReport(_req: IncomingMessage, res: ServerResponse): void {
  const report: VerifyReport | null = getLastReport();
  if (!report) {
    sendJson(res, 404, { error: 'no verification has run yet' });
    return;
  }
  sendJson(res, 200, report as unknown as Record<string, unknown>);
}

/**
 * Handle every `/verify*` request. Returns true when the path was recognised and
 * answered, false to let main.ts fall through to its own routes.
 */
export async function handleVerifyRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const pathname = url.pathname;

  if (pathname === '/verify' && req.method === 'POST') {
    await handleRun(req, res);
    return true;
  }
  if (pathname === '/verify/report' && req.method === 'GET') {
    handleReport(req, res);
    return true;
  }
  return false;
}
