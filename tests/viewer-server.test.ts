import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
const modulePath = '../service/viewer-server.ts';
const viewer = await import(modulePath).catch(() => null);
test('private viewer serves only its capability HTML with exact Host/method and restrictive headers', async () => {
  assert.ok(viewer, 'private viewer server must exist');
  const server = await viewer.startViewerServer({url:'http://localhost:5173/',pages:[],viewport:{width:1280,height:800}});
  try {
    const response = await fetch(server.url), html = await response.text();
    assert.equal(response.status,200);
    assert.equal(response.headers.get('referrer-policy'),'no-referrer');
    assert.match(response.headers.get('content-security-policy') ?? '', /script-src 'sha256-/);
    assert.match(response.headers.get('content-security-policy') ?? '', /frame-src http: https:/);
    assert.equal(response.headers.get('access-control-allow-origin'),null);
    assert.doesNotMatch(html,/OPENCHAMBER_SERVICE_TOKEN/);
    assert.equal((await fetch(server.url,{method:'POST'})).status,405);
    assert.equal((await fetch(new URL('/config',server.url))).status,404);
    assert.equal((await fetch(server.url+'?x=1')).status,404);
    const wrong = await new Promise<number>((resolve,reject) => { const req=request(server.url,{headers:{host:'evil.invalid'}},res=>{res.resume();resolve(res.statusCode!)}); req.on('error',reject);req.end(); });
    assert.equal(wrong,403);
  } finally { await server.close(); }
  await assert.rejects(()=>fetch(server.url));
});
