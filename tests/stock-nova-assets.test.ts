import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, readdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const hash=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const provenancePath='viewer-client/stock-provenance.json';
test('official CLI source bytes, real Nova config and stock Geist Neutral theme are conserved',async()=>{
  const provenance=JSON.parse(await readFile(provenancePath,'utf8'));
  for(const [file,identity] of Object.entries(provenance.files) as Array<[string,{sha256:string}]>)assert.equal(hash(await readFile(file)),identity.sha256,file);
  const config=JSON.parse(await readFile('viewer-client/components.json','utf8'));
  assert.equal(config.style,'base-nova');assert.equal(config.rsc,false);assert.equal(config.tsx,true);assert.equal(config.iconLibrary,'lucide');assert.equal(config.tailwind.css,'src/index.css');assert.equal(config.tailwind.baseColor,'neutral');assert.equal(config.font,undefined);
  const css=await readFile('viewer-client/src/index.css','utf8');
  assert.match(css,/@import "@fontsource-variable\/geist"/);assert.match(css,/--font-sans: 'Geist Variable', sans-serif/);assert.match(css,/--radius: 0\.625rem/);assert.doesNotMatch(css,/ds-toolbar|viewer-control|\.toolbar|!important/);
  assert.notEqual(hash(css+'\n/* altered */'),provenance.files['viewer-client/src/index.css'].sha256,'negative identity control detects altered generated source');
});
test('missing real client entry fails without creating placeholder shared assets',async()=>{
  const scratch=await mkdtemp(path.join(tmpdir(),'stock-missing-entry-'));
  const missingEntry=path.join(scratch,'missing.tsx'),output=path.join(scratch,'assets.ts');
  const result=spawnSync(process.execPath,['scripts/build-viewer.mjs','--entry',missingEntry,'--out',output],{encoding:'utf8'});
  assert.notEqual(result.status,0);assert.match(result.stderr,/Viewer entry missing.*Stage 2/s);
  await assert.rejects(access(output));
});
test('private real stock Button fixture produces offline CSS/fonts and production string-only assets',async()=>{
  const scratch=await mkdtemp(path.join(tmpdir(),'stock-button-fixture-'));const entry=path.join(scratch,'main.tsx'),output=path.join(scratch,'assets.ts');
  await writeFile(entry,`import React from 'react';import {createRoot}from'react-dom/client';import {Button}from${JSON.stringify(path.resolve('viewer-client/src/components/ui/button.tsx'))};createRoot(document.getElementById('root')!).render(<Button>Stock fixture</Button>);`);
  const result=spawnSync(process.execPath,['scripts/build-viewer.mjs','--entry',entry,'--out',output],{encoding:'utf8',timeout:60000});assert.equal(result.status,0,result.stderr);
  const assets=await readFile(output,'utf8');assert.match(assets,/export const VIEWER_CLIENT_JS = "/);assert.match(assets,/VIEWER_CLIENT_INPUT_DIGEST = "[a-f0-9]{64}"/);
  const css=JSON.parse(assets.match(/VIEWER_CLIENT_CSS = (".*");/)![1]!);
  assert.doesNotMatch(css,/@import|url\(["']?(https?:|\/\/)/);assert.match(css,/Geist Variable/);
  const dataFonts=[...css.matchAll(/data:[^;"')]+;base64,([A-Za-z0-9+/=]+)/g)].map(match=>hash(Buffer.from(match[1],'base64')));
  const fontRoot=path.dirname(new URL(import.meta.resolve('@fontsource-variable/geist')).pathname);
  const originalFonts=(await readdir(path.join(fontRoot,'files'))).filter(file=>file.endsWith('.woff2'));
  assert.ok(dataFonts.length>0);for(const encoded of dataFonts){const originals=await Promise.all(originalFonts.map(async file=>hash(await readFile(path.join(fontRoot,'files',file)))));assert.ok(originals.includes(encoded),'font bytes are unchanged official WOFF2');}
});
