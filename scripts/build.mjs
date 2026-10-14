// Build the two guest entries OpenChamber loads. OpenChamber never compiles our
// code, so panel/main.js and service/main.js are committed.
//
//   panel/main.js   sandboxed iframe bundle: classic IIFE, browser
//   service/main.js local service: Node ESM, run by the host-provided runtime
import { build } from 'esbuild';

const common = { bundle: true, sourcemap: false, logLevel: 'info' };

await build({
  ...common,
  entryPoints: ['panel/main.ts'],
  outfile: 'panel/main.js',
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
});

await build({
  ...common,
  entryPoints: ['service/main.ts'],
  outfile: 'service/main.js',
  format: 'esm',
  platform: 'node',
  target: ['node20'],
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});

console.log('built panel/main.js and service/main.js');
