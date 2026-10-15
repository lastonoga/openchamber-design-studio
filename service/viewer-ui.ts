/** Capability-gated live canvas. Stock toolbar assets are compiled offline. */
import { initCanvas } from '../viewer-client/src/canvas-controller.js';
import { VIEWER_CLIENT_JS, VIEWER_CLIENT_CSS } from './viewer-assets.generated.ts';

export type ViewerPage = { id: string; label: string; url: string };
export type ViewerConfig = { url: string; pages: ViewerPage[]; viewport: { width: number; height: number } };

function publicUrl(value: string): string {
  if (value === '') return '';
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Preview URL must be an absolute http(s) URL.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Preview URL must use http(s) without embedded credentials.');
  }
  return url.href;
}

function inlineJson(value: unknown): string {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (character) =>
    `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

function inlineScript(source: string): string {
  // Escaping the slash is equivalent inside JS strings/regexes; the HTML parser
  // must never see a script end tag originating in compiled source.
  return source.replace(/<\/script/gi, '<\\/script').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

export function renderViewerHtml(config: ViewerConfig): string {
  const { width, height } = config.viewport;
  if (![width, height].every((n) => Number.isInteger(n) && n >= 100 && n <= 8192)) throw new Error('Invalid design viewport dimensions.');
  const seen = new Set<string>();
  const pages = config.pages.map((page) => {
    if (typeof page.id !== 'string' || !page.id || seen.has(page.id) || typeof page.label !== 'string') throw new Error('Preview pages need unique ids and labels.');
    seen.add(page.id);
    const url = publicUrl(page.url);
    if (!url) throw new Error('A confirmed preview page needs an http(s) URL.');
    return { id: page.id, label: page.label || 'Untitled page', url };
  });
  // Deliberate allowlist: never serialize extra fields such as host bearer tokens.
  const safeConfig: ViewerConfig = { url: publicUrl(config.url), pages, viewport: { width, height } };
  const bootstrap = `window.__dsViewerConfig=${inlineJson(safeConfig)};(${initCanvas.toString()})(window.__dsViewerConfig);`;
  return `<!DOCTYPE html><html lang="en" class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Design Studio · Canvas viewer</title>
<style>${VIEWER_CLIENT_CSS.replace(/<\/style/gi, '<\\/style')}</style><style>${CANVAS_GEOMETRY}</style></head><body>${CANVAS_MARKUP}<script>${inlineScript(bootstrap)}</script><script>${inlineScript(VIEWER_CLIENT_JS)}</script></body></html>`;
}

// Canvas-only geometry. No legacy toolbar, control, typography, or palette CSS.
const CANVAS_GEOMETRY = String.raw`
html,body{margin:0;width:100%;height:100%}
body{display:flex;flex-direction:column;height:100dvh;overflow:hidden}
#toolbar-root{flex:none;min-width:0}
.canvas{position:relative;flex:1 1 auto;min-height:0;min-width:0;overflow:hidden;touch-action:none}
.canvas[data-layout=fit]{touch-action:auto}
.camera{position:absolute;top:0;left:0;transform-origin:0 0}
iframe{display:block;border:0;width:100%;height:100%}
.camera[hidden],.pan-layer[hidden],.state[hidden],[hidden]{display:none}
.pan-layer{position:absolute;inset:0;z-index:4;cursor:grab;touch-action:none}
.canvas.dragging,.canvas.dragging .pan-layer{cursor:grabbing}
.caption{position:absolute;top:-32px;left:0;white-space:nowrap;pointer-events:none}
.state{position:absolute;inset:0;display:grid;place-items:center;text-align:center}
.state-body{max-width:100%;overflow-wrap:anywhere}
.fallback{position:absolute;bottom:0;left:0;max-width:100%;overflow-wrap:anywhere;pointer-events:none}
.sr{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
`;

const CANVAS_MARKUP = String.raw`
<div id="toolbar-root"></div><main id="canvas" class="canvas" tabindex="0" aria-label="Preview canvas. Arrow keys pan in page mode. Plus and minus zoom. Shift 1 fits page width. H toggles Pan."><div id="toolbar-status-area"></div><div id="camera" class="camera"><span id="caption" class="caption" aria-hidden="true"></span><iframe id="preview" title="Live design page" referrerpolicy="no-referrer"></iframe></div><div id="pan-layer" class="pan-layer" hidden aria-hidden="true"></div><section id="state" class="state" data-state="loading" aria-labelledby="state-title"><div class="state-body"><div id="spinner" role="status" aria-label="Loading preview">Loading…</div><h1 id="state-title" hidden>Opening preview</h1><p id="state-copy" hidden>Waiting for the design page.</p><button id="state-action" hidden>Retry</button></div></section><p id="layout-reason" class="fallback" role="status" hidden></p></main><div id="announcement" class="sr" aria-live="polite" aria-atomic="true"></div>
`;
