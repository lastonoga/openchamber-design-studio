import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { renderViewerHtml, type ViewerConfig } from './viewer-ui.ts';

/** No host bearer, RPCs, proxying or file serving: one capability-gated asset. */
export async function startViewerServer(config: ViewerConfig): Promise<{ url: string; close(): Promise<void> }> {
  const capability = '/canvas/' + randomBytes(32).toString('hex');
  let html = renderViewerHtml(config);
  html = html.replace('<meta charset="utf-8">', '<meta charset="utf-8"><meta name="referrer" content="no-referrer">');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => "'sha256-" + createHash('sha256').update(match[1]!).digest('base64') + "'");
  const csp = `default-src 'none'; script-src ${scripts.join(' ')}; style-src 'unsafe-inline'; font-src data:; frame-src http: https:; img-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
  let host = '';
  const server = createServer((req, res) => {
    const status = req.headers.host !== host ? 403 : req.url !== capability ? 404 : req.method !== 'GET' ? 405 : 200;
    res.writeHead(status, {
      'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
      'referrer-policy': 'no-referrer', 'content-security-policy': csp,
      'x-content-type-options': 'nosniff', 'cross-origin-resource-policy': 'same-origin',
    });
    res.end(status === 200 ? html : 'Viewer unavailable');
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('viewer did not bind loopback');
  host = `127.0.0.1:${address.port}`;
  return { url: `http://${host}${capability}`, close: () => new Promise<void>((resolve, reject) => {
    server.closeAllConnections(); server.close((error) => error ? reject(error) : resolve());
  }) };
}
