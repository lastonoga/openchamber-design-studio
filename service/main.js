import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);

// service/main.ts
import http from "node:http";
import { promises as fs8 } from "node:fs";
import path10 from "node:path";

// service/studio-config.ts
import { promises as fs } from "node:fs";
import path from "node:path";
var CONFIG_CANDIDATES = [".design-studio.json", "design-studio.json", "design/.design-studio.json"];
var DEFAULT_CONFIG_PATH = CONFIG_CANDIDATES[0];
async function isFile(abs) {
  try {
    return (await fs.stat(abs)).isFile();
  } catch {
    return false;
  }
}
async function resolveConfigPath(root) {
  for (const rel of CONFIG_CANDIDATES) {
    const abs = path.join(root, rel);
    if (await isFile(abs)) return abs;
  }
  return null;
}
async function readStudioConfig(root) {
  const abs = await resolveConfigPath(root);
  if (!abs) return { config: null, path: null };
  const rel = path.relative(root, abs);
  try {
    const parsed = JSON.parse(await fs.readFile(abs, "utf8"));
    return { config: parsed && typeof parsed === "object" ? parsed : null, path: rel };
  } catch {
    return { config: null, path: rel };
  }
}
async function writeStudioConfig(root, rel, text) {
  const relPath = rel && rel.trim() ? rel.trim() : DEFAULT_CONFIG_PATH;
  const rootAbs = path.resolve(root);
  const abs = path.resolve(rootAbs, relPath);
  if (abs !== rootAbs && !abs.startsWith(rootAbs + path.sep)) throw new Error("path outside project");
  JSON.parse(text);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, text, "utf8");
  return { path: relPath };
}

// service/project-server.ts
import { execFile as execFile2, spawn as spawn2 } from "node:child_process";
import { promises as fs3 } from "node:fs";
import { createServer as createServer2 } from "node:net";
import path3 from "node:path";
import { promisify } from "node:util";

// service/browser.ts
import { execFile, spawn } from "node:child_process";
import { promises as fs2 } from "node:fs";
import { tmpdir } from "node:os";
import path2 from "node:path";

// shared/probe-script.ts
var PROBE_SCRIPT = String.raw`(function () {
  'use strict';

  // Layout-shift is cumulative over the page's life, so we keep the running
  // total on window and let __dsProbe read it whenever it is called.
  if (typeof window.__dsCls !== 'number') window.__dsCls = 0;
  try {
    var clsObserver = new PerformanceObserver(function (list) {
      var entries = list.getEntries();
      for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        // Shifts the user caused (hover, click) are not layout instability.
        if (entry.hadRecentInput) continue;
        window.__dsCls += entry.value || 0;
      }
    });
    clsObserver.observe({ type: 'layout-shift', buffered: true });
  } catch (e) {
    // PerformanceObserver may be absent or reject the buffered layout-shift
    // option; CLS then simply stays 0 rather than breaking the load.
  }

  function cssEscape(value) {
    if (window.CSS && CSS.escape) return CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, function (ch) { return '\\' + ch; });
  }

  // id wins outright; otherwise an nth-of-type path capped at 6 levels. Same
  // deterministic approach as service/browser.ts PICK_SCRIPT so selectors match.
  function selectorFor(el) {
    if (!el || el.nodeType !== 1) return '';
    if (el.id) return '#' + cssEscape(el.id);
    var parts = [];
    var node = el;
    var depth = 0;
    while (node && node.nodeType === 1 && depth < 6) {
      var tag = node.tagName.toLowerCase();
      var parent = node.parentElement;
      if (parent) {
        var index = 0, count = 0;
        for (var i = 0; i < parent.children.length; i++) {
          var child = parent.children[i];
          if (child.tagName === node.tagName) {
            count++;
            if (child === node) index = count;
          }
        }
        if (count > 1) tag += ':nth-of-type(' + index + ')';
      }
      parts.unshift(tag);
      depth++;
      if (node.id) { parts[0] = '#' + cssEscape(node.id); break; }
      node = parent;
    }
    return parts.join(' > ');
  }

  // Accessible name, best-effort: aria-label beats a wrapping <label> beats
  // placeholder beats visible text.
  function labelFor(el) {
    var aria = el.getAttribute('aria-label');
    if (aria) return aria;
    if (el.id) {
      var forLabel = document.querySelector('label[for="' + cssEscape(el.id) + '"]');
      if (forLabel && forLabel.textContent) return forLabel.textContent.replace(/\s+/g, ' ').trim();
    }
    var wrapping = el.closest ? el.closest('label') : null;
    if (wrapping && wrapping.textContent) return wrapping.textContent.replace(/\s+/g, ' ').trim();
    var placeholder = el.getAttribute('placeholder');
    if (placeholder) return placeholder;
    return (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  }

  function describe(el) {
    var cs = getComputedStyle(el);
    var rect = el.getBoundingClientRect();
    var item = {
      selector: selectorFor(el),
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role') || '',
      label: labelFor(el),
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      },
      styles: {
        color: cs.color,
        backgroundColor: cs.backgroundColor,
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        display: cs.display,
        position: cs.position
      }
    };
    if (el.getAttribute('aria-hidden') === 'true') item.ariaHidden = true;
    if (el.tagName === 'IMG') item.hasAlt = el.hasAttribute('alt');
    if (/^H[1-6]$/.test(el.tagName)) item.headingLevel = parseInt(el.tagName.charAt(1), 10);
    if (typeof el.tabIndex === 'number') item.tabIndex = el.tabIndex;
    return item;
  }

  var INTERACTIVE = 'a[href], button, input, select, textarea, [role="button"], [role="link"], [tabindex]';

  // The live window's pick feedback (service/browser.ts) paints a transient
  // outline marked data-ds-overlay. It is ours, not the page's: skip it and
  // anything nested under it so gates never see a highlight as a real element.
  function isDsOverlay(el) {
    return !!(el && el.nodeType === 1 && el.closest && el.closest('[data-ds-overlay]'));
  }

  function collect() {
    var out = [];
    var seen = new Set();
    function add(el) {
      if (!el || el.nodeType !== 1 || seen.has(el) || isDsOverlay(el)) return;
      seen.add(el);
      out.push(describe(el));
    }

    var i;
    var interactives = document.querySelectorAll(INTERACTIVE);
    for (i = 0; i < interactives.length; i++) add(interactives[i]);

    var headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    for (i = 0; i < headings.length; i++) add(headings[i]);

    var images = document.querySelectorAll('img');
    for (i = 0; i < images.length; i++) add(images[i]);

    // Anything whose box hangs past the document width is the raw material for
    // the overflow gate; keep its selector and rect so the gate can name it.
    var doc = document.documentElement;
    var docWidth = Math.max(doc ? doc.clientWidth : 0, window.innerWidth || 0);
    var all = document.body ? document.querySelectorAll('*') : [];
    for (i = 0; i < all.length; i++) {
      if (isDsOverlay(all[i])) continue;
      var rect = all[i].getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      if (rect.right > docWidth + 1 || rect.left < -1) add(all[i]);
    }

    return out;
  }

  window.__dsProbe = function () {
    var doc = document.documentElement;
    return JSON.stringify({
      scrollWidth: doc ? doc.scrollWidth : 0,
      clientWidth: doc ? doc.clientWidth : 0,
      innerWidth: window.innerWidth || 0,
      innerHeight: window.innerHeight || 0,
      scrollHeight: doc ? doc.scrollHeight : 0,
      cls: window.__dsCls || 0,
      selectors: collect()
    });
  };
})();`;
var PROBE_EXPR = "window.__dsProbe ? window.__dsProbe() : null";

// service/viewer-server.ts
import { createServer } from "node:http";
import { randomBytes, createHash } from "node:crypto";

// service/viewer-ui.ts
function publicUrl(value) {
  if (value === "") return "";
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Preview URL must be an absolute http(s) URL.");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Preview URL must use http(s) without embedded credentials.");
  }
  return url.href;
}
function inlineJson(value) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);
}
function renderViewerHtml(config) {
  const { width, height } = config.viewport;
  if (![width, height].every((n) => Number.isInteger(n) && n >= 100 && n <= 8192)) throw new Error("Invalid design viewport dimensions.");
  const seen = /* @__PURE__ */ new Set();
  const pages = config.pages.map((page) => {
    if (typeof page.id !== "string" || !page.id || seen.has(page.id) || typeof page.label !== "string") throw new Error("Preview pages need unique ids and labels.");
    seen.add(page.id);
    const url = publicUrl(page.url);
    if (!url) throw new Error("A confirmed preview page needs an http(s) URL.");
    return { id: page.id, label: page.label || "Untitled page", url };
  });
  const safeConfig = { url: publicUrl(config.url), pages, viewport: { width, height } };
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Design Studio \xB7 Canvas viewer</title>
<style id="design-tokens">
:root {
  --viewer-bg:#17181b; --viewer-surface:#222428; --viewer-hover:#303339; --viewer-text:#eeede9; --viewer-muted:#b5b8c0; --viewer-border:#737985; --viewer-focus:#e9c3a3;
  --paper:#f8f7f3; --paper-surface:#ffffff; --ink:#292e29; --ink-muted:#596157; --paper-border:#858c82; --accent:#8c512b; --accent-soft:#f0e4d9; --error:#ffb3b1; --ink-error:#8a2222;
  --s1:4px; --s2:8px; --s3:12px; --s4:16px; --s5:24px; --s6:32px; --s7:48px; --s8:64px; --s9:96px;
  --t1:12px; --t2:15px; --t3:18.75px; --t4:23.4375px; --t5:29.296875px; --t6:36.62109375px; --t7:45.7763671875px;
  --body-font:system-ui,sans-serif; --display-font:"Iowan Old Style",Georgia,serif;
  --control:44px; --icon:20px; --line:1px; --focus-line:2px; --radius:8px; --radius-lg:16px; --menu-width:264px; --label-width:220px; --page-measure:68ch; --pan-step:32px;
  --viewer-control:28px; --zoom-width:64px; --leading-body:1.5; --leading-label:1.2; --leading-section:1.25; --leading-display:1.08;
  --tracking-badge:.06em; --tracking-eyebrow:.08em; --tracking-display:-.025em; --heading-measure:18ch;
  --weight-regular:400; --weight-medium:500; --weight-strong:600; --loading-duration:1s;
  --control-selected-bg:var(--viewer-text); --control-selected-text:var(--viewer-bg); --control-motion:140ms;
}
</style><style>${VIEWER_CSS}</style></head><body>${VIEWER_MARKUP}<script>
const initialConfig = ${inlineJson(safeConfig)};
${VIEWER_SCRIPT}
</script></body></html>`;
}
var VIEWER_CSS = String.raw`
*{box-sizing:border-box} html,body{margin:0;width:100%;height:100%;color:var(--viewer-text);background:var(--viewer-bg);font:var(--t2)/var(--leading-body) var(--body-font)}
body{display:flex;flex-direction:column;height:100dvh;overflow:hidden} button,input{font:inherit} button{color:var(--viewer-text);background:var(--viewer-surface);border:var(--line) solid var(--viewer-border);border-radius:var(--radius);min-height:var(--viewer-control);cursor:pointer} button:not(:disabled):hover{background:var(--viewer-hover)} button:disabled{cursor:not-allowed;color:var(--viewer-muted)}
:focus-visible{outline:var(--focus-line) solid var(--viewer-focus);outline-offset:var(--s1)} button svg{width:var(--icon);height:var(--icon);flex:none} .icon{display:grid;place-items:center;width:var(--viewer-control);padding:0;flex:none} .sr{position:absolute;width:var(--line);height:var(--line);padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.toolbar{position:relative;z-index:20;display:flex;align-items:center;gap:var(--s2);padding:var(--s1) var(--s2);border-bottom:var(--line) solid var(--viewer-border);background:var(--viewer-surface);flex:none;font-size:var(--t1)}
.left{display:flex;align-items:center;gap:var(--s2);flex:1 1 var(--label-width);min-width:0;max-width:var(--menu-width)} .left .anchor{flex:1 1 auto} .demo{font-weight:var(--weight-strong);color:var(--viewer-muted);letter-spacing:var(--tracking-badge)} .right{display:flex;align-items:center;gap:var(--s1);margin-left:auto;min-width:0} .anchor{position:relative;min-width:0} .page-button{display:flex;align-items:center;gap:var(--s1);width:100%;padding:0 var(--s2);text-align:left;font-weight:var(--weight-medium)}.page-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1}.caret{font-size:var(--t1);color:var(--viewer-muted)} .zoom-button{min-width:var(--zoom-width);padding:0 var(--s1);font-variant-numeric:tabular-nums;font-weight:var(--weight-medium)} .status{min-width:var(--viewer-control);margin-left:var(--s1);color:var(--viewer-muted);white-space:nowrap}
.toolbar button{transition:background-color var(--control-motion) ease,color var(--control-motion) ease,border-color var(--control-motion) ease}.toolbar .icon{background:transparent;border-color:transparent;color:var(--viewer-muted)}.toolbar .icon:not(:disabled):hover{background:var(--viewer-hover);color:var(--viewer-text)}
.toolbar button:focus-visible{outline:var(--focus-line) solid var(--viewer-focus);outline-offset:calc(-1 * var(--focus-line))}
.viewport-choices{display:flex;flex:none;border:0;padding:var(--line);background:var(--viewer-bg);box-shadow:inset 0 0 0 var(--line) var(--viewer-border);border-radius:var(--radius);min-width:0;overflow:visible}.viewport-choice{border:0;border-radius:var(--radius);padding:0 var(--s3);background:transparent;line-height:var(--leading-label);font-weight:var(--weight-medium)}
.toolbar .viewport-choice[aria-checked=true],.toolbar #pan[aria-pressed=true]{color:var(--control-selected-text);background:var(--control-selected-bg)}
.toolbar .viewport-choice[aria-checked=true]:focus-visible,.toolbar #pan[aria-pressed=true]:focus-visible{outline-color:var(--control-selected-text)}
.menu{position:absolute;top:calc(100% + var(--s2));left:0;min-width:100%;width:var(--menu-width);max-width:calc(100vw - var(--s5));padding:var(--s1);background:var(--viewer-surface);border:var(--line) solid var(--viewer-border);border-radius:var(--radius);box-shadow:0 var(--s3) var(--s6) var(--viewer-bg)} .zoom-menu{left:auto;right:0;min-width:0}.menu[hidden],.anchor[hidden],.page-name[hidden]{display:none}.menu button{position:relative;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:var(--s1);width:100%;padding:var(--s2) var(--s3);padding-right:var(--s6);text-align:left;background:transparent;border:0;font-weight:var(--weight-medium);overflow-wrap:anywhere}.menu small{font-size:var(--t1);font-weight:var(--weight-regular);line-height:var(--leading-label);color:var(--viewer-muted)}.menu button[aria-checked=true]{background:var(--viewer-hover)}
.menu button[aria-checked=true]::after{content:"";position:absolute;right:var(--s3);top:50%;width:var(--s1);height:var(--s2);border:solid var(--viewer-text);border-width:0 var(--focus-line) var(--focus-line) 0;transform:translateY(-50%) rotate(45deg)}
.canvas{position:relative;flex:1 1 auto;min-height:0;min-width:0;overflow:hidden;background:var(--viewer-bg);outline-offset:calc(-1 * var(--s1));touch-action:none}.camera{position:absolute;top:0;left:0;transform-origin:0 0;box-shadow:0 var(--s4) var(--s7) var(--viewer-bg)} iframe{display:block;border:0;background:var(--paper);width:100%;height:100%}.camera[hidden]{display:none}.pan-layer{position:absolute;inset:0;z-index:4;cursor:grab;touch-action:none}.pan-layer[hidden]{display:none}.canvas.dragging,.canvas.dragging .pan-layer{cursor:grabbing}.caption{position:absolute;top:calc(-1 * var(--s6));left:0;color:var(--viewer-muted);font-size:var(--t1);white-space:nowrap;pointer-events:none}
.pan-actions{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:var(--s1);padding:var(--s1)}.pan-heading{padding:var(--s2) var(--s3) var(--s1);color:var(--viewer-muted);font-size:var(--t1)}.menu .pan-actions button{min-width:0;min-height:var(--control);padding:0;align-items:center}.pan-actions svg{width:var(--icon);height:var(--icon)}
.state{position:absolute;inset:0;display:grid;place-items:center;padding:var(--s5);text-align:center}.state[hidden]{display:none}.state-body{max-width:var(--page-measure)}.state h1{font:var(--weight-regular) var(--t5)/var(--leading-label) var(--display-font);margin:0 0 var(--s3)}.state p{color:var(--viewer-muted);margin:0 0 var(--s5);overflow-wrap:anywhere}.state button{padding:var(--s2) var(--s4)}.spinner{width:var(--s6);height:var(--s6);border:var(--focus-line) solid var(--viewer-border);border-top-color:var(--viewer-text);border-radius:50%;margin:0 auto var(--s5);animation:turn var(--loading-duration) linear infinite}@keyframes turn{to{transform:rotate(360deg)}}
.state[data-state=loading] .state-body{max-width:min(100%,var(--page-measure));padding:var(--s3);background:var(--viewer-surface);border:var(--line) solid var(--viewer-border);border-radius:var(--radius-lg)}.state[data-state=loading] .spinner{margin:0 auto}.state[data-state=loading] p{font-size:var(--t1);margin:var(--s3) 0}
.toolbar{flex-wrap:wrap}.fallback{flex:1 0 100%;margin:0;font-size:var(--t1);color:var(--viewer-muted);overflow-wrap:anywhere}.fallback[hidden]{display:none}.canvas[data-layout=fit]{touch-action:auto}
@media(max-width:768px),(pointer:coarse){:root{--viewer-control:var(--control)}.toolbar{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:var(--s1) var(--s2)}.left{grid-column:1;grid-row:1;max-width:none}.right{grid-column:2;grid-row:1;margin:0}.viewport-choices{grid-column:1/-1;grid-row:2;display:grid;grid-template-columns:none;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr)}.viewport-choice{min-width:0;padding:0 var(--s1)}}
@media(max-width:560px){.demo{display:none}.status{position:absolute;width:var(--line);height:var(--line);overflow:hidden;clip-path:inset(50%);white-space:nowrap}}
@media(max-width:768px),(pointer:coarse){.fallback{grid-column:1/-1;grid-row:3}}
@media(prefers-reduced-motion:reduce){.spinner{animation:none}.toolbar button{transition:none}}
`;
var VIEWER_MARKUP = String.raw`
<header class="toolbar" role="toolbar" aria-label="Preview controls">
<div class="left"><span class="demo" title="Design Studio live preview">DESIGN</span><div id="page-anchor" class="anchor"><button id="pages" class="page-button" aria-label="Choose preview page" aria-haspopup="menu" aria-expanded="false"><span class="page-name" id="page-name">Preview</span><span class="caret" aria-hidden="true">⌄</span></button><div id="page-menu" class="menu" role="menu" aria-label="Preview pages" hidden></div></div><span id="page-static" class="page-name" hidden>Preview</span></div>
<div class="viewport-choices" role="radiogroup" aria-label="Design viewport"><button class="viewport-choice" role="radio" data-preset="fit" aria-checked="false" tabindex="-1" title="Fit · responsive page with native scrolling">Fit</button><button class="viewport-choice" role="radio" data-preset="desktop" aria-checked="true" tabindex="0" title="Desktop · 1280 × 800">Desktop</button><button class="viewport-choice" role="radio" data-preset="large" aria-checked="false" tabindex="-1" title="Desktop Large · 1920 × 1080">Desktop Large</button><button class="viewport-choice" role="radio" data-preset="tablet" aria-checked="false" tabindex="-1" title="Tablet · 768 × 1024">Tablet</button><button class="viewport-choice" role="radio" data-preset="mobile" aria-checked="false" tabindex="-1" title="Mobile · 390 × 844">Mobile</button></div>
<div class="right"><button id="pan" class="icon" aria-label="Pan canvas" aria-pressed="false" title="Pan canvas (H)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M8 12V5a1.5 1.5 0 0 1 3 0v6-7a1.5 1.5 0 0 1 3 0v7-6a1.5 1.5 0 0 1 3 0v7-3a1.5 1.5 0 0 1 3 0v8c0 4-3 6-7 6-2 0-4-2-5-4l-3-4a1.5 1.5 0 0 1 2-2z"/></svg></button><button id="minus" class="icon" aria-label="Zoom out" title="Zoom out"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M5 12h14"/></svg></button>
<div class="anchor"><button id="zoom" class="zoom-button" aria-label="Zoom options" aria-haspopup="menu" aria-expanded="false">Width · 100%</button><div id="zoom-menu" class="menu zoom-menu" role="menu" aria-label="Zoom options" hidden><button role="menuitemradio" data-zoom="fit" aria-checked="true">Fit width <small>Fit page width, up to 100%</small></button><button role="menuitemradio" data-zoom="0.5" aria-checked="false">50%</button><button role="menuitemradio" data-zoom="1" aria-checked="false">100% <small>One design pixel per viewer pixel</small></button><button role="menuitemradio" data-zoom="2" aria-checked="false">200%</button><div class="pan-heading">Pan without dragging</div><div class="pan-actions" role="group" aria-label="Pan without dragging"><button role="menuitem" data-pan="left" aria-label="Pan left" title="Pan left">←</button><button role="menuitem" data-pan="up" aria-label="Pan up" title="Pan up">↑</button><button role="menuitem" data-pan="down" aria-label="Pan down" title="Pan down">↓</button><button role="menuitem" data-pan="right" aria-label="Pan right" title="Pan right">→</button></div></div></div><button id="plus" class="icon" aria-label="Zoom in" title="Zoom in"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M5 12h14M12 5v14"/></svg></button><span id="status" class="status" role="status" aria-live="polite">Loading…</span></div><p id="layout-reason" class="fallback" role="status" hidden></p>
</header><main id="canvas" class="canvas" tabindex="0" aria-label="Preview canvas. Arrow keys pan in page mode. Plus and minus zoom. Shift 1 fits page width. H toggles Pan."><div id="camera" class="camera"><span id="caption" class="caption" aria-hidden="true"></span><iframe id="preview" title="Live design page" referrerpolicy="no-referrer"></iframe></div><div id="pan-layer" class="pan-layer" hidden aria-hidden="true"></div><section id="state" class="state" data-state="loading" aria-labelledby="state-title"><div class="state-body"><div id="spinner" class="spinner" role="status" aria-label="Loading preview"></div><h1 id="state-title" hidden>Opening preview</h1><p id="state-copy" hidden>Waiting for the design page.</p><button id="state-action" hidden>Retry</button></div></section></main><div id="announcement" class="sr" aria-live="polite" aria-atomic="true"></div>
`;
var VIEWER_SCRIPT = String.raw`
(() => {
  const $ = id => document.getElementById(id);
  const canvas = $('canvas'), camera = $('camera'), frame = $('preview');
  const presets = {desktop:{width:1280,height:800},large:{width:1920,height:1080},tablet:{width:768,height:1024},mobile:{width:390,height:844}};
  let pages = initialConfig.pages, currentUrl = '', currentTitle = 'Preview';
  const view = {width:initialConfig.viewport.width,height:initialConfig.viewport.height,nominalHeight:initialConfig.viewport.height,layoutMode:'viewport',reason:'',preset:'desktop',mode:'fit',scale:1,panX:0,panY:0,pan:false,space:false,ready:false};
  let openMenu = null, drag = null, slowTimer = null, statusState = 'loading';
  let captureState = null, captureSequence = 0, repaintPending = false;
  const numToken = name => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  function announce(text){$('announcement').textContent=text;}
  function validUrl(value){try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null;}catch{return null;}}
  function paint(){
    if(captureState){repaintPending=true;return;}
    const box=canvas.getBoundingClientRect();
    const adaptive=view.layoutMode==='fit';canvas.dataset.layout=view.layoutMode;
    if(adaptive){const bounds=getFitBounds();view.width=bounds.width;view.height=bounds.height;view.mode='fit';view.scale=1;view.panX=0;view.panY=0;view.pan=false;view.space=false;}
    else if(view.mode==='fit'){view.scale=Math.max(.05,Math.min(1,(box.width-numToken('--s7'))/view.width));view.panX=0;view.panY=0;}
    camera.style.width=view.width+'px';camera.style.height=view.height+'px';
    const x=adaptive?0:(box.width-view.width*view.scale)/2+view.panX,y=adaptive?0:numToken('--s7')+view.panY;
    camera.style.transform='translate('+x+'px,'+y+'px) scale('+view.scale+')';
    $('zoom').textContent=(!adaptive&&view.mode==='fit'?'Width · ':'')+Math.round(view.scale*100)+'%';
    $('caption').hidden=adaptive;$('layout-reason').hidden=!(view.layoutMode==='viewport'&&view.reason);$('layout-reason').textContent=view.reason?'Viewport fallback: '+view.reason:'';
    $('caption').textContent=(view.preset==='large'?'DESKTOP LARGE':view.preset.toUpperCase())+' · '+view.width+' × '+view.height;
    document.querySelectorAll('[data-zoom]').forEach(b=>b.setAttribute('aria-checked',String(b.dataset.zoom==='fit'?view.mode==='fit':view.mode==='manual'&&view.scale===Number(b.dataset.zoom))));
    $('pan-layer').hidden=!(view.ready&&(view.pan||view.space));$('pan').setAttribute('aria-pressed',String(view.pan));
    $('minus').disabled=!view.ready||adaptive||view.scale<=.1;$('plus').disabled=!view.ready||adaptive||view.scale>=3;$('pan').disabled=!view.ready||adaptive;$('zoom').disabled=!view.ready||adaptive;
    const disabledReason=adaptive?'Fit uses native page scrolling; camera zoom and Pan are unavailable.':!view.ready?'Wait for the preview page to be ready.':'';
    [$('pan'),$('zoom'),$('minus'),$('plus')].forEach(b=>b.title=disabledReason||b.getAttribute('aria-label'));
    document.querySelectorAll('[data-preset]').forEach((b,i)=>{b.disabled=!view.ready;b.setAttribute('aria-checked',String(b.dataset.preset===view.preset));b.tabIndex=b.dataset.preset===view.preset||(view.preset==='custom'&&i===0)?0:-1;});
  }
  function setViewport(width,height){
    if(captureState)return false;
    if(![width,height].every(n=>Number.isInteger(n)&&n>=100&&n<=8192))return false;
    view.width=width;view.height=height;view.nominalHeight=height;view.layoutMode='viewport';view.reason='';view.preset=Object.keys(presets).find(id=>presets[id].width===width&&presets[id].height===height)||'custom';paint();return true;
  }
  function getFitBounds(){
    return {width:Math.max(1,Math.min(8192,Math.floor(canvas.clientWidth))),height:Math.max(1,Math.min(8192,Math.floor(canvas.clientHeight)))};
  }
  function setLayout(info){
    if(captureState||!info||!['fit','page','viewport'].includes(info.mode)||!['fit','desktop','large','tablet','mobile','custom'].includes(info.preset))return false;
    if(![info.width,info.height,info.nominalHeight].every(n=>Number.isInteger(n)&&n>0&&n<=8192)||((info.mode==='fit')!==(info.preset==='fit')))return false;
    if(info.reason!==undefined&&(typeof info.reason!=='string'||info.reason.length>600))return false;
    const changed=view.layoutMode!==info.mode||view.preset!==info.preset;
    view.layoutMode=info.mode;view.preset=info.preset;view.width=info.width;view.height=info.height;view.nominalHeight=info.nominalHeight;view.reason=info.mode==='viewport'?(info.reason||''):'';
    if(changed){view.mode='fit';view.panX=0;view.panY=0;view.pan=false;view.space=false;}paint();return true;
  }
  function closeMenu(refocus=true){if(!openMenu)return false;const id=openMenu;$(id+'-menu').hidden=true;$(id==='page'?'pages':'zoom').setAttribute('aria-expanded','false');openMenu=null;if(refocus)$(id==='page'?'pages':'zoom').focus();return true;}
  function setStatus(info){
    if(!info||!['loading','ready','empty','error'].includes(info.state))return false;
    if(captureState){captureState.pendingStatus=info;return true;}
    clearTimeout(slowTimer);statusState=info.state;view.ready=info.state==='ready';
    if(!view.ready){closeMenu();view.space=false;if(info.state!=='loading')view.pan=false;}
    camera.hidden=info.state==='empty'||info.state==='error';$('state').hidden=view.ready;$('spinner').hidden=info.state!=='loading';$('state-action').hidden=info.state==='loading'||view.ready;
    $('state').dataset.state=info.state;$('state-title').hidden=info.state==='loading';$('state-copy').hidden=info.state==='loading';
    const defaults={loading:['Opening preview','Waiting for the design page.'],empty:['No preview page available','Choose a confirmed page, or retry after adding a preview entry to the project.'],error:['Preview could not be displayed','Check that the dev server is running and the page allows embedding, then retry.']};
    $('status').textContent=view.ready?'Ready':info.state==='loading'?'Loading…':info.state==='empty'?'No page':'Load failed';
    if(!view.ready){$('state-title').textContent=defaults[info.state][0];$('state-copy').textContent=typeof info.message==='string'?info.message:defaults[info.state][1];}
    $('status').title=typeof info.message==='string'?info.message:$('status').textContent;
    if(info.state==='loading')slowTimer=setTimeout(()=>{if(statusState!=='loading')return;$('state-copy').textContent='Still opening the preview. Try again if the page is unavailable.';$('state-copy').hidden=false;$('state-action').hidden=false;announce($('state-copy').textContent);},15000);
    paint();announce($('status').title);return true;
  }
  function send(command){
    if(command.type==='ready'&&typeof window.__dsCanvasSend!=='function')return false;
    try{if(typeof window.__dsCanvasSend!=='function')throw new Error('Preview controls are not connected. Reopen the preview window.');window.__dsCanvasSend(JSON.stringify(command));return true;}
    catch(error){setStatus({state:'error',message:error instanceof Error?error.message:'Could not contact the preview service. Retry.'});return false;}
  }
  function renderPages(){
    if(openMenu==='page')closeMenu();$('page-menu').replaceChildren();
    const multiple=pages.length>1;$('page-anchor').hidden=!multiple;$('page-static').hidden=multiple;
    const matching=pages.find(p=>p.url===currentUrl);const label=matching?matching.label:currentTitle;
    $('page-name').textContent=label;$('page-static').textContent=label;$('page-static').title=currentUrl;$('pages').title=currentUrl;
    pages.forEach(p=>{const b=document.createElement('button');b.type='button';b.setAttribute('role','menuitemradio');b.setAttribute('aria-checked',String(p.url===currentUrl));const name=document.createElement('span');name.textContent=p.label;const route=document.createElement('small');const u=new URL(p.url);route.textContent=u.pathname+u.search+u.hash;b.append(name,route);b.onclick=()=>{closeMenu();send({type: 'page',id:p.id});};$('page-menu').append(b);});
  }
  function setPage(info){
    if(!info||typeof info.url!=='string')return false;
    const url=info.url?validUrl(info.url):'';if(url===null){setStatus({state:'error',message:'The preview page URL must use http or https.'});return false;}
    if(Array.isArray(info.pages)){
      const ids=new Set();const next=[];
      for(const p of info.pages){if(!p||typeof p.id!=='string'||!p.id||ids.has(p.id)||typeof p.label!=='string')return false;const u=validUrl(p.url);if(!u)return false;ids.add(p.id);next.push({id:p.id,label:p.label||'Untitled page',url:u});}pages=next;
    }
    currentTitle=typeof info.title==='string'&&info.title?info.title:'Preview';
    if(url!==currentUrl){currentUrl=url;if(info.navigate!==false){if(url){setStatus({state:'loading'});frame.src = url;}else{frame.removeAttribute('src');setStatus({state:'empty'});}}}
    else if(!url&&info.navigate!==false)setStatus({state:'empty'});
    document.title=currentTitle+' · Design Studio';renderPages();return true;
  }
  function zoomTo(value,point){
    if(!view.ready||captureState||view.layoutMode==='fit')return;if(value==='fit'){view.mode='fit';paint();announce('Fit page width, up to 100 percent');return;}
    const next=Number(value);if(!finite(next))return;const old=view.scale,scale=Math.min(3,Math.max(.1,next)),box=canvas.getBoundingClientRect(),px=point?point.x-box.width/2:0,py=point?point.y-box.height/2:0;
    view.panX=px-(px-view.panX)*scale/old;view.panY=py-(py-view.panY)*scale/old;view.scale=scale;view.mode='manual';paint();announce('Zoom '+Math.round(scale*100)+' percent');
  }
  function setPan(next){if(!view.ready||captureState||view.layoutMode==='fit')return;view.pan=next;view.space=false;paint();if(next)canvas.focus();announce(next?'Pan canvas enabled. Escape returns to page interaction.':'Page interaction enabled.');}
  // Capture is a renderer-owned transaction: observers cannot overwrite the
  // normalized geometry, and competing viewer gestures cannot change the camera.
  function beginCapture(){
    if(captureState)throw new Error('Canvas capture is already active.');
    captureState={token:++captureSequence,view:{...view},body:document.body.style.cssText,styles:[camera,canvas,frame].map(el=>[el,el.style.cssText])};
    window.__dsCaptureActive=true;document.body.style.pointerEvents='none';return captureState.token;
  }
  async function normalizeCapture(token){
    if(!captureState||captureState.token!==token)throw new Error('Invalid canvas capture transaction.');
    document.body.style.overflow='visible';canvas.style.flex='none';canvas.style.height=view.height+'px';canvas.style.overflow='visible';
    camera.style.transform='none';camera.style.left='0';camera.style.top='0';camera.style.width=view.width+'px';camera.style.height=view.height+'px';
    frame.style.width=view.width+'px';frame.style.height=view.height+'px';
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const r=frame.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};
  }
  function endCapture(token){
    if(!captureState||captureState.token!==token)return false;
    const saved=captureState;document.body.style.cssText=saved.body;for(const [el,style] of saved.styles)el.style.cssText=style;Object.assign(view,saved.view);
    captureState=null;window.__dsCaptureActive=false;
    const pending=saved.pendingStatus;repaintPending=false;if(pending)setStatus(pending);else paint();return true;
  }
  for(const type of ['pointerdown','pointermove','pointerup','click','wheel','keydown','keyup'])document.addEventListener(type,e=>{if(captureState){e.preventDefault();e.stopImmediatePropagation();}},{capture:true,passive:false});
  function toggleMenu(id){if(openMenu===id){closeMenu();return;}closeMenu(false);openMenu=id;$(id+'-menu').hidden=false;$(id==='page'?'pages':'zoom').setAttribute('aria-expanded','true');($(id+'-menu').querySelector('[aria-checked=true]')||$(id+'-menu').querySelector('button')).focus();}
  $('pages').onclick=()=>toggleMenu('page');$('zoom').onclick=()=>toggleMenu('zoom');
  document.addEventListener('pointerdown',e=>{if(openMenu&&!e.target.closest('.anchor')){e.preventDefault();closeMenu();}});
  document.addEventListener('keydown',e=>{
    if(openMenu){const items=[...$(openMenu+'-menu').querySelectorAll('button')];if(e.key==='Escape'){e.preventDefault();closeMenu();return;}if(e.key==='Tab'){closeMenu(false);return;}if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();let i=items.indexOf(document.activeElement);i=e.key==='Home'?0:e.key==='End'?items.length-1:(i+(e.key==='ArrowDown'?1:-1)+items.length)%items.length;items[i].focus();return;}}
    if(e.key==='Escape'&&(view.pan||view.space)){e.preventDefault();setPan(false);$('pan').focus();return;}
    if(document.activeElement!==canvas||!view.ready||view.layoutMode==='fit')return;
    if(e.key===' '){e.preventDefault();view.space=true;paint();}else if(e.key.toLowerCase()==='h'){e.preventDefault();setPan(!view.pan);}else if(e.key==='+'||e.key==='='){e.preventDefault();zoomTo(view.scale*1.25);}else if(e.key==='-'){e.preventDefault();zoomTo(view.scale/1.25);}else if(e.shiftKey&&(e.code==='Digit1'||e.key==='!')){e.preventDefault();zoomTo('fit');}else if(e.shiftKey&&(e.code==='Digit0'||e.key===')')){e.preventDefault();zoomTo(1);}else if(e.key.startsWith('Arrow')){e.preventDefault();moveCamera(e.key.slice(5).toLowerCase(),e.shiftKey?3:1);}
  });
  function moveCamera(direction,multiplier=1){if(!view.ready||captureState||view.layoutMode==='fit')return;view.mode='manual';const step=numToken('--pan-step')*multiplier;if(direction==='left')view.panX-=step;if(direction==='right')view.panX+=step;if(direction==='up')view.panY-=step;if(direction==='down')view.panY+=step;paint();}
  document.addEventListener('keyup',e=>{if(e.key===' '){view.space=false;paint();}});window.addEventListener('blur',()=>{view.space=false;drag=null;canvas.classList.remove('dragging');paint();});
  $('pan').onclick=()=>setPan(!view.pan);$('minus').onclick=()=>zoomTo(view.scale/1.25);$('plus').onclick=()=>zoomTo(view.scale*1.25);
  document.querySelectorAll('[data-zoom]').forEach(b=>b.onclick=()=>{zoomTo(b.dataset.zoom==='fit'?'fit':Number(b.dataset.zoom));closeMenu();});
  function choosePreset(id){if(!view.ready||captureState)return;if(id==='fit'){setLayout({mode:'fit',preset:'fit',...getFitBounds(),nominalHeight:view.nominalHeight});send({type: 'layout',mode:'fit',preset:'fit'});}else{const p=presets[id];setLayout({mode:'viewport',preset:id,width:p.width,height:p.height,nominalHeight:p.height});send({type: 'layout',mode:'page',preset:id});}announce((id==='large'?'Desktop Large':id)+' layout');}
  const presetButtons=[...document.querySelectorAll('[data-preset]')];presetButtons.forEach((b,i)=>{b.onclick=()=>choosePreset(b.dataset.preset);b.onkeydown=e=>{if(!['ArrowRight','ArrowLeft','ArrowDown','ArrowUp','Home','End'].includes(e.key))return;e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?presetButtons.length-1:(i+(['ArrowRight','ArrowDown'].includes(e.key)?1:-1)+presetButtons.length)%presetButtons.length;choosePreset(presetButtons[next].dataset.preset);presetButtons[next].focus();};});
  document.querySelectorAll('[data-pan]').forEach(b=>b.onclick=()=>{moveCamera(b.dataset.pan);announce('Canvas moved '+b.dataset.pan+'.');closeMenu();});
  canvas.addEventListener('pointerdown',e=>{if(!view.ready||view.layoutMode==='fit'||e.button!==0||e.target.closest('.state'))return;canvas.focus();view.mode='manual';drag={x:e.clientX,y:e.clientY,panX:view.panX,panY:view.panY};canvas.setPointerCapture(e.pointerId);canvas.classList.add('dragging');e.preventDefault();});
  canvas.addEventListener('pointermove',e=>{if(!drag)return;view.panX=drag.panX+e.clientX-drag.x;view.panY=drag.panY+e.clientY-drag.y;paint();});
  function endDrag(e){if(!drag)return;drag=null;canvas.classList.remove('dragging');if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);}canvas.addEventListener('pointerup',endDrag);canvas.addEventListener('pointercancel',endDrag);
  function wheelInput(deltaX,deltaY,x,y,zoom){if(!view.ready||captureState||view.layoutMode==='fit'||![deltaX,deltaY,x,y].every(finite))return false;if(zoom)zoomTo(view.scale*Math.exp(-deltaY*.005),{x,y});else{view.mode='manual';view.panX-=deltaX;view.panY-=deltaY;paint();}return true;}
  canvas.addEventListener('wheel',e=>{if(!view.ready||view.layoutMode==='fit'||e.target.closest('.state'))return;e.preventDefault();const b=canvas.getBoundingClientRect();wheelInput(e.deltaX,e.deltaY,e.clientX-b.left,e.clientY-b.top,e.ctrlKey||e.metaKey);},{passive:false});
  let fitSizeQueued=false;
  new ResizeObserver(()=>{paint();if(view.layoutMode==='fit'&&!captureState&&!fitSizeQueued){fitSizeQueued=true;requestAnimationFrame(()=>{fitSizeQueued=false;if(view.layoutMode==='fit'&&!captureState)send({type: 'fit-size'});});}}).observe(canvas);
  $('state-action').onclick=()=>{setStatus({state:'loading'});send({type: 'retry'});};
  frame.addEventListener('error',()=>setStatus({state:'error',message:'The preview could not be displayed. Check that the dev server is running and the page allows embedding, then retry.'}));
  window.__dsCanvas = {
    setViewport,setLayout,getFitBounds,setStatus,setPage,beginCapture,normalizeCapture,endCapture,
    getCamera:()=>({mode:view.mode,scale:view.scale,panX:view.panX,panY:view.panY,width:view.width,height:view.height,preset:view.preset,layoutMode:view.layoutMode,nominalHeight:view.nominalHeight,reason:view.reason}),
    restoreCamera:state=>{if(captureState||!state||!['fit','manual'].includes(state.mode)||![state.scale,state.panX,state.panY].every(finite)||state.scale<=0)return false;if(state.layoutMode!==undefined&&!setLayout({mode:state.layoutMode,preset:state.preset,width:state.width,height:state.height,nominalHeight:state.nominalHeight,reason:state.reason||''}))return false;view.mode=state.mode;view.scale=Math.min(3,Math.max(.05,state.scale));view.panX=state.panX;view.panY=state.panY;paint();return true;},
    dismissMenu:()=>closeMenu(),
    // Backend may forward normalized camera wheel input while Pan owns input.
    // It must retain native website gestures in interaction mode and own picks.
    handleCanvasInput:event=>{if(!event||view.layoutMode==='fit'||(!view.pan&&view.layoutMode!=='page')||event.type!=='wheel')return false;return wheelInput(event.deltaX,event.deltaY,event.x,event.y,Boolean(event.zoom));}
  };
  setViewport(view.width,view.height);setPage({url:initialConfig.url,pages:initialConfig.pages});
  if(initialConfig.url)setStatus({state:'loading'});
  send({type: 'ready'});
})();
`;

// service/viewer-server.ts
async function startViewerServer(config) {
  const capability = "/canvas/" + randomBytes(32).toString("hex");
  let html = renderViewerHtml(config);
  html = html.replace('<meta charset="utf-8">', '<meta charset="utf-8"><meta name="referrer" content="no-referrer">');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => "'sha256-" + createHash("sha256").update(match[1]).digest("base64") + "'");
  const csp = `default-src 'none'; script-src ${scripts.join(" ")}; style-src 'unsafe-inline'; frame-src http: https:; img-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
  let host = "";
  const server2 = createServer((req, res) => {
    const status = req.headers.host !== host ? 403 : req.url !== capability ? 404 : req.method !== "GET" ? 405 : 200;
    res.writeHead(status, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "content-security-policy": csp,
      "x-content-type-options": "nosniff",
      "cross-origin-resource-policy": "same-origin"
    });
    res.end(status === 200 ? html : "Viewer unavailable");
  });
  await new Promise((resolve, reject) => {
    server2.once("error", reject);
    server2.listen(0, "127.0.0.1", resolve);
  });
  const address = server2.address();
  if (!address || typeof address === "string") throw new Error("viewer did not bind loopback");
  host = `127.0.0.1:${address.port}`;
  return { url: `http://${host}${capability}`, close: () => new Promise((resolve, reject) => {
    server2.closeAllConnections();
    server2.close((error) => error ? reject(error) : resolve());
  }) };
}

// service/artifact-context.ts
var ArtifactContexts = class {
  shellFrame = null;
  artifactFrame = null;
  contexts = /* @__PURE__ */ new Map();
  childSessions = /* @__PURE__ */ new Map();
  loaders = /* @__PURE__ */ new Map();
  loaderVersions = /* @__PURE__ */ new Map();
  sameDocumentVersions = /* @__PURE__ */ new Map();
  discovering = null;
  active = true;
  shellRevision = 0;
  shellUrl = "";
  trustedShellUrl;
  trustedShellOrigin;
  cdp;
  shellSession;
  scripts;
  changed;
  constructor(cdp, shellSession, scripts, changed, trustedShellUrl) {
    this.cdp = cdp;
    this.shellSession = shellSession;
    this.scripts = scripts;
    this.changed = changed;
    this.trustedShellUrl = new URL(trustedShellUrl).href;
    this.trustedShellOrigin = new URL(trustedShellUrl).origin;
    cdp.on("Runtime.executionContextCreated", (params, session) => {
      const context = params.context;
      if (!session || !context?.auxData?.isDefault || !context.auxData.frameId || typeof context.id !== "number") return;
      if (session === shellSession && context.auxData.frameId === this.shellFrame) this.shellRevision++;
      this.contexts.set(session + ":" + context.id, { session, frame: context.auxData.frameId, id: context.id, unique: context.uniqueId, origin: context.origin ?? "" });
      void this.discover().then(() => this.initializeArtifact()).catch(() => void 0);
    });
    cdp.on("Runtime.executionContextDestroyed", (params, session) => {
      if (this.contexts.get(session + ":" + params.executionContextId)?.frame === this.shellFrame) this.shellRevision++;
      this.contexts.delete(session + ":" + params.executionContextId);
      this.changed();
    });
    cdp.on("Runtime.executionContextsCleared", (_params, session) => {
      if (session === shellSession) this.shellRevision++;
      for (const [key, context] of this.contexts) if (context.session === session) this.contexts.delete(key);
      this.changed();
    });
    cdp.on("Page.frameNavigated", (params, session) => {
      const frame = params.frame;
      if (session === shellSession && frame && !frame.parentId) {
        this.shellRevision++;
        this.shellUrl = "";
        this.artifactFrame = null;
      }
      if (session === shellSession || this.childSessions.has(session ?? "")) {
        if (frame?.id && frame.loaderId) {
          this.loaders.set(frame.id, frame.loaderId);
          this.loaderVersions.set(frame.id, (this.loaderVersions.get(frame.id) ?? 0) + 1);
        }
        void this.discover().then(() => this.initializeArtifact()).catch(() => void 0);
        this.changed();
      }
    });
    cdp.on("Page.navigatedWithinDocument", (params, session) => {
      if ((session === shellSession || this.childSessions.has(session ?? "")) && typeof params.frameId === "string") {
        this.sameDocumentVersions.set(params.frameId, (this.sameDocumentVersions.get(params.frameId) ?? 0) + 1);
        this.changed();
      }
    });
    cdp.on("Page.frameAttached", () => {
      void this.discover().then(() => this.initializeArtifact()).catch(() => void 0);
    });
    cdp.on("Page.frameDetached", (params) => {
      if (params.frameId === this.shellFrame) {
        this.shellRevision++;
        this.shellUrl = "";
        this.artifactFrame = null;
      }
      if (params.frameId === this.artifactFrame && params.reason !== "swap") this.artifactFrame = null;
      this.changed();
    });
    cdp.on("Target.attachedToTarget", (params) => {
      const info = params.targetInfo;
      if (info?.type !== "iframe" || typeof params.sessionId !== "string") return;
      this.childSessions.set(params.sessionId, info.targetId ?? "");
      void this.enable(params.sessionId).then(() => this.discover()).then(() => this.initializeArtifact()).catch(() => void 0);
    });
    cdp.on("Target.detachedFromTarget", (params) => {
      if (params.sessionId === shellSession) {
        this.shellRevision++;
        this.shellUrl = "";
        this.artifactFrame = null;
      }
      this.childSessions.delete(String(params.sessionId));
      for (const [key, context] of this.contexts) if (context.session === params.sessionId) this.contexts.delete(key);
      this.changed();
    });
  }
  async enable(session) {
    await this.cdp.send("Page.enable", {}, session);
    for (const name of ["__dsPick", "__dsArtifactEvent", "__dsCanvasSend", "__dsShellState"]) await this.cdp.send("Runtime.addBinding", { name }, session);
    await this.cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: this.scripts }, session);
    await this.cdp.send("Runtime.enable", {}, session);
    await this.cdp.send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true }, session);
  }
  async discover() {
    if (!this.active) return;
    if (this.discovering) return this.discovering;
    this.discovering = (async () => {
      const revision = this.shellRevision;
      const result = await this.cdp.send("Page.getFrameTree", {}, this.shellSession);
      const tree = result.frameTree;
      if (!tree?.frame?.id) return;
      if (!this.active || revision !== this.shellRevision) return;
      this.shellUrl = tree.frame.url ?? "";
      if (this.shellUrl !== this.trustedShellUrl || this.shellFrame !== null && this.shellFrame !== tree.frame.id) {
        this.shellUrl = "";
        this.artifactFrame = null;
        return;
      }
      this.shellFrame = tree.frame.id;
      const candidates = new Set((tree.childFrames ?? []).map((child) => child.frame?.id).filter((id) => !!id));
      for (const frame of this.childSessions.values()) if (frame) candidates.add(frame);
      for (const frame of candidates) {
        try {
          const owner = await this.cdp.send("DOM.getFrameOwner", { frameId: frame }, this.shellSession);
          const result2 = await this.cdp.send("DOM.describeNode", { backendNodeId: owner.backendNodeId }, this.shellSession);
          const node = result2.node;
          const attrs = node?.attributes ?? [];
          if (node?.nodeName === "IFRAME" && attrs.some((value, index) => index % 2 === 0 && value === "id" && attrs[index + 1] === "preview")) {
            if (this.active && revision === this.shellRevision) this.artifactFrame = frame;
            return;
          }
        } catch {
        }
      }
    })().finally(() => {
      this.discovering = null;
    });
    return this.discovering;
  }
  shell() {
    if (!this.active || this.discovering || this.shellUrl !== this.trustedShellUrl) return null;
    const context = this.find(this.shellSession, this.shellFrame);
    return context?.origin === this.trustedShellOrigin ? context : null;
  }
  captureShellAuthority(session, id) {
    const context = this.shell();
    return this.matches(context, session, id) ? { context, revision: this.shellRevision } : null;
  }
  shellAuthorityCurrent(authority) {
    return this.active && authority.revision === this.shellRevision && this.shell() === authority.context;
  }
  artifact() {
    if (!this.artifactFrame) return null;
    return [...this.contexts.values()].find((context) => context.frame === this.artifactFrame && (context.session === this.shellSession || this.childSessions.get(context.session) === this.artifactFrame)) ?? null;
  }
  artifactLoaderId() {
    return this.artifactFrame ? this.loaders.get(this.artifactFrame) ?? null : null;
  }
  artifactSameDocumentVersion() {
    return this.artifactFrame ? this.sameDocumentVersions.get(this.artifactFrame) ?? 0 : 0;
  }
  find(session, frame) {
    return [...this.contexts.values()].find((context) => context.session === session && context.frame === frame) ?? null;
  }
  matches(context, session, id) {
    return this.active && !!context && context.session === session && context.id === id && this.contexts.get(session + ":" + id) === context;
  }
  async evaluate(context, expression, awaitPromise = false) {
    if (!this.matches(context, context.session, context.id)) throw new Error("execution context authority was revoked");
    const result = await this.cdp.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise,
      ...context.unique ? { uniqueContextId: context.unique } : { contextId: context.id }
    }, context.session);
    if (result.exceptionDetails) throw new Error("artifact evaluation failed: " + JSON.stringify(result.exceptionDetails));
    return result.result?.value;
  }
  async initializeArtifact() {
    const context = this.artifact();
    if (context && this.active) {
      await this.seedArtifactLoader(context);
      if (this.artifact() === context) await this.evaluate(context, "window.__dsTrustedArtifact=true;" + this.scripts);
    }
    this.changed();
  }
  /** A new OOPIF may commit before Page.enable can report frameNavigated. */
  async seedArtifactLoader(context) {
    const revision = this.shellRevision, version = this.loaderVersions.get(context.frame) ?? 0;
    const result = await this.cdp.send("Page.getFrameTree", {}, context.session);
    if (!this.active || revision !== this.shellRevision || this.shellUrl !== this.trustedShellUrl || this.artifactFrame !== context.frame || this.artifact() !== context || !this.matches(context, context.session, context.id) || version !== (this.loaderVersions.get(context.frame) ?? 0)) return;
    const tree = result.frameTree;
    let frame;
    if (context.session === this.shellSession) {
      if (tree?.frame?.id !== this.shellFrame) return;
      const find = (node) => {
        if (node?.frame?.id === context.frame) return node.frame;
        for (const child of node?.childFrames ?? []) {
          const found = find(child);
          if (found) return found;
        }
        return void 0;
      };
      frame = find(tree);
    } else {
      if (this.childSessions.get(context.session) !== context.frame || tree?.frame?.id !== context.frame) return;
      frame = tree.frame;
    }
    if (typeof frame?.loaderId === "string" && frame.loaderId) this.loaders.set(context.frame, frame.loaderId);
  }
  close() {
    this.active = false;
    this.shellRevision++;
    this.shellUrl = "";
    this.contexts.clear();
    this.childSessions.clear();
  }
};

// service/browser.ts
var CHROME_PATH = process.env.DS_CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
var VIEWPORT_WIDTH = 1280;
var VIEWPORT_HEIGHT = 800;
var CDP_TIMEOUT_MS = 3e4;
var LAUNCH_TIMEOUT_MS = 2e4;
var DEFAULT_WINDOW = { x: 80, y: 80, width: 1280, height: 800 };
var MIN_WINDOW_EDGE = 200;
var ANTI_THROTTLE_FLAGS = [
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  "--disable-background-timer-throttling",
  "--disable-features=CalculateNativeWinOcclusion"
];
function parseWindowSpec(raw) {
  if (!raw) return null;
  const parts = raw.split(",").map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [x, y, width, height] = parts;
  return { x: x ?? 0, y: y ?? 0, width: width ?? 0, height: height ?? 0 };
}
function isWebSafeUrl(url) {
  try {
    const protocol = new URL(url).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}
function buildLaunchArgs(spec, profile, url) {
  if (!isWebSafeUrl(url)) {
    throw new Error(`refusing to launch the --app window at a non-http(s) URL: ${url}`);
  }
  return [
    `--app=${url}`,
    "--incognito",
    "--disable-extensions",
    "--remote-debugging-port=0",
    "--no-first-run",
    "--no-default-browser-check",
    `--window-size=${spec.width},${spec.height}`,
    `--window-position=${spec.x},${spec.y}`,
    `--user-data-dir=${profile}`,
    ...ANTI_THROTTLE_FLAGS
  ];
}
var STABLE_STYLE = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}";
function emptyProbeReport() {
  return {
    scrollWidth: 0,
    clientWidth: 0,
    innerWidth: 0,
    innerHeight: 0,
    scrollHeight: 0,
    cls: 0,
    selectors: []
  };
}
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function openSocket(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const onError = () => reject(new Error(`failed to open CDP socket at ${url}`));
    ws.addEventListener(
      "open",
      () => {
        ws.removeEventListener("error", onError);
        resolve(ws);
      },
      { once: true }
    );
    ws.addEventListener("error", onError, { once: true });
  });
}
var CdpClient = class {
  ws;
  nextId = 1;
  pending = /* @__PURE__ */ new Map();
  handlers = /* @__PURE__ */ new Map();
  closed = false;
  closeError = null;
  constructor(ws) {
    this.ws = ws;
    ws.addEventListener("message", (event) => this.onMessage(event));
    ws.addEventListener("close", () => this.onClose(new Error("CDP socket closed")));
    ws.addEventListener("error", () => this.onClose(new Error("CDP socket error")));
  }
  onMessage(event) {
    let message;
    try {
      const raw = typeof event.data === "string" ? event.data : String(event.data);
      message = JSON.parse(raw);
    } catch {
      return;
    }
    const id = message.id;
    if (typeof id === "number" && this.pending.has(id)) {
      const entry = this.pending.get(id);
      this.pending.delete(id);
      clearTimeout(entry.timer);
      const error = message.error;
      if (error) entry.reject(new Error(`CDP error: ${error.message ?? "unknown"}`));
      else entry.resolve(message.result);
      return;
    }
    const method = message.method;
    if (typeof method === "string") {
      const set = this.handlers.get(method);
      if (!set) return;
      const params = message.params ?? {};
      const sessionId = typeof message.sessionId === "string" ? message.sessionId : void 0;
      for (const handler of set) handler(params, sessionId);
    }
  }
  onClose(error) {
    if (this.closed) return;
    this.closed = true;
    this.closeError = error;
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    this.pending.clear();
  }
  send(method, params = {}, sessionId) {
    if (this.closed) return Promise.reject(this.closeError ?? new Error("CDP closed"));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, CDP_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
    });
  }
  on(method, handler) {
    let set = this.handlers.get(method);
    if (!set) {
      set = /* @__PURE__ */ new Set();
      this.handlers.set(method, set);
    }
    set.add(handler);
    const current = set;
    return () => current.delete(handler);
  }
  close() {
    this.onClose(new Error("CDP closed"));
    try {
      this.ws.close();
    } catch {
    }
  }
};
function otherLoopback(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const host = url.hostname;
  if (host === "localhost" || host === "127.0.0.1") url.hostname = "[::1]";
  else if (host === "[::1]" || host === "::1") url.hostname = "127.0.0.1";
  else return null;
  return url.toString();
}
function modifierBits(modifiers) {
  let bits = 0;
  if (modifiers.alt) bits |= 1;
  if (modifiers.ctrl) bits |= 2;
  if (modifiers.meta) bits |= 4;
  if (modifiers.shift) bits |= 8;
  return bits;
}
function buttonName(button) {
  if (button === 0) return "left";
  if (button === 1) return "middle";
  if (button === 2) return "right";
  return "none";
}
var PICK_SCRIPT = `(() => {
  if (window.__dsPickerInstalled) return;
  window.__dsPickerInstalled = true;
  function selectorFor(el) {
    if (el.id) return '#' + CSS.escape(el.id);
    var parts = [];
    var node = el;
    var depth = 0;
    while (node && node.nodeType === 1 && depth < 6) {
      var tag = node.tagName.toLowerCase();
      var parent = node.parentElement;
      if (parent) {
        var index = 0, count = 0;
        for (var i = 0; i < parent.children.length; i++) {
          var child = parent.children[i];
          if (child.tagName === node.tagName) {
            count++;
            if (child === node) index = count;
          }
        }
        if (count > 1) tag += ':nth-of-type(' + index + ')';
      }
      parts.unshift(tag);
      depth++;
      if (node.id) { parts[0] = '#' + CSS.escape(node.id); break; }
      node = parent;
    }
    return parts.join(' > ');
  }
  function stylesFor(el) {
    var cs = getComputedStyle(el);
    var keys = ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textAlign',
      'color', 'backgroundColor', 'borderTopWidth', 'borderStyle', 'borderColor', 'borderRadius',
      'padding', 'margin', 'display', 'gap', 'width', 'height'];
    var out = {};
    for (var i = 0; i < keys.length; i++) out[keys[i]] = cs[keys[i]];
    return out;
  }

  // ---- transient pick feedback --------------------------------------------
  // One lazily-created fixed box that follows the pointer while a modifier is
  // held. It is intentionally NOT a wrapper: no page subtree is moved or
  // cloned, the box has pointer-events off, and it is tagged with
  // data-ds-overlay so the probe skips it.
  function inOverlay(el) {
    return !!(el && el.nodeType === 1 && el.closest && el.closest('[data-ds-overlay]'));
  }

  var outline = null;
  var outlineLabel = null;
  var savedCursor = '';
  var cursorOverridden = false;

  function ensureOutline() {
    if (outline && outline.isConnected) return outline;
    // Never leave more than one: drop any stale copy (e.g. from a prior doc).
    var stale = document.querySelectorAll('#__ds-pick-outline,[data-ds-overlay="pick"]');
    for (var i = 0; i < stale.length; i++) {
      if (stale[i] !== outline && stale[i].parentNode) stale[i].parentNode.removeChild(stale[i]);
    }
    outline = document.createElement('div');
    outline.id = '__ds-pick-outline';
    outline.setAttribute('data-ds-overlay', 'pick');
    outline.setAttribute('aria-hidden', 'true');
    var s = outline.style;
    s.position = 'fixed';
    s.pointerEvents = 'none';
    s.boxSizing = 'border-box';
    s.border = '2px solid #3b82f6';
    s.background = 'rgba(59,130,246,0.12)';
    s.borderRadius = '2px';
    s.zIndex = '2147483647';
    s.top = '0px';
    s.left = '0px';
    s.width = '0px';
    s.height = '0px';
    s.display = 'none';
    outlineLabel = document.createElement('div');
    var ls = outlineLabel.style;
    ls.position = 'absolute';
    ls.top = '-18px';
    ls.left = '-2px';
    ls.maxWidth = '60vw';
    ls.overflow = 'hidden';
    ls.textOverflow = 'ellipsis';
    ls.whiteSpace = 'nowrap';
    ls.padding = '0 4px';
    ls.borderRadius = '2px';
    ls.background = '#3b82f6';
    ls.color = '#ffffff';
    ls.font = '11px/16px ui-monospace, SFMono-Regular, Menlo, monospace';
    outline.appendChild(outlineLabel);
    (document.body || document.documentElement).appendChild(outline);
    return outline;
  }

  // Hover state is blue; a chosen element is marked in green so it stays
  // visibly identified (persisted) rather than blinking away.
  function paint(picked) {
    if (!outline) return;
    var s = outline.style;
    s.border = picked ? '2px solid #22c55e' : '2px solid #3b82f6';
    s.background = picked ? 'rgba(34,197,94,0.14)' : 'rgba(59,130,246,0.12)';
    if (outlineLabel) outlineLabel.style.background = picked ? '#22c55e' : '#3b82f6';
    if (picked) outline.setAttribute('data-ds-picked', '1');
    else outline.removeAttribute('data-ds-picked');
  }

  function place(el) {
    ensureOutline();
    var rect = el.getBoundingClientRect();
    var s = outline.style;
    s.display = 'block';
    s.top = rect.top + 'px';
    s.left = rect.left + 'px';
    s.width = rect.width + 'px';
    s.height = rect.height + 'px';
    if (outlineLabel) outlineLabel.textContent = el.tagName.toLowerCase() + ' ' + selectorFor(el);
  }

  function setCursor(on) {
    var root = document.documentElement;
    if (!root) return;
    if (on && !cursorOverridden) {
      savedCursor = root.style.cursor;
      root.style.cursor = 'crosshair';
      cursorOverridden = true;
    } else if (!on && cursorOverridden) {
      root.style.cursor = savedCursor;
      cursorOverridden = false;
    }
  }

  function hideOutline() {
    if (outline) outline.style.display = 'none';
    setCursor(false);
  }

  // ---- highlight by selector (driven from outside the page) ----------------
  // The panel asks for a brief re-flash of an element it already knows (a
  // reference row hovered in the UI). It borrows the SAME transient outline as
  // the modifier hover, in a distinct clear accent (violet), shows it for about
  // 900ms, then hides it. This is NOT a pick: it reports nothing through
  // __dsPick and leaves no persistent mark.
  var highlightTimer = 0;

  function paintHighlight() {
    if (!outline) return;
    var s = outline.style;
    s.border = '2px solid #a855f7';
    s.background = 'rgba(168,85,247,0.18)';
    if (outlineLabel) outlineLabel.style.background = '#a855f7';
    outline.setAttribute('data-ds-highlight', '1');
  }

  function endHighlight() {
    if (outline) outline.removeAttribute('data-ds-highlight');
    hideOutline();
  }

  window.__dsHighlight = function (selector) {
    var el = null;
    try {
      el = selector ? document.querySelector(selector) : null;
    } catch (e) {
      return false; // an invalid selector is not a match
    }
    if (!el || el.nodeType !== 1 || inOverlay(el)) return false;
    if (highlightTimer) clearTimeout(highlightTimer);
    place(el);
    paintHighlight();
    highlightTimer = setTimeout(function () {
      highlightTimer = 0;
      endHighlight();
    }, 900);
    return true;
  };

  // Hover is throttled: pointer moves only stash the latest target and one
  // rAF does the measuring, so a fast sweep costs a single layout read a frame.
  var rafId = 0;
  var pendingTarget = null;
  function schedulePlace(el) {
    pendingTarget = el;
    if (rafId) return;
    rafId = requestAnimationFrame(function () {
      rafId = 0;
      var target = pendingTarget;
      pendingTarget = null;
      if (target && target.isConnected && !inOverlay(target)) {
        paint(false);
        place(target);
      }
    });
  }

  function onHover(e) {
    if (e.metaKey || e.ctrlKey) {
      setCursor(true);
      if (!inOverlay(e.target)) schedulePlace(e.target);
    } else {
      hideOutline();
    }
  }
  document.addEventListener('mousemove', onHover, true);
  document.addEventListener('mouseover', onHover, true);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Meta' || e.key === 'Control') setCursor(true);
  }, true);
  document.addEventListener('keyup', function (e) {
    if (e.key === 'Meta' || e.key === 'Control') hideOutline();
  }, true);
  window.addEventListener('blur', hideOutline, true);
  window.__dsPickAt = function(x,y) {
    var el = document.elementFromPoint(x,y);
    if (!el || inOverlay(el)) return false;
    el.dispatchEvent(new MouseEvent('click', {bubbles:true,cancelable:true,ctrlKey:true}));
    return true;
  };

  document.addEventListener('click', function (e) {
    // Cmd (metaKey) or Ctrl held: this click is a reference pick, not a
    // navigation. Anything else is an ordinary click and passes through.
    if (!(e.metaKey || e.ctrlKey)) return;
    var el = e.target;
    if (!el || el.nodeType !== 1) return;
    if (inOverlay(el)) return;
    e.preventDefault();
    e.stopPropagation();
    // Keep the outline on the picked element so the choice stays visible.
    place(el);
    paint(true);
    var rect = el.getBoundingClientRect();
    var payload = {
      selector: selectorFor(el),
      tag: el.tagName.toLowerCase(),
      classes: typeof el.className === 'string' ? el.className : '',
      text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 200),
      outerHTML: el.outerHTML.slice(0, 4000),
      styles: stylesFor(el),
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    };
    if (window.__dsPick) window.__dsPick(JSON.stringify(payload));
  }, true);
})();`;
var ARTIFACT_BRIDGE = `(() => {
  if (window.__dsBridgeInstalled) return; window.__dsBridgeInstalled = true;
  window.__dsViewerFlags = {menu:false,pan:false};
  let consumed = null;
  const emit = type => {if(window.__dsArtifactEvent)window.__dsArtifactEvent(JSON.stringify({type}));};
  document.addEventListener('pointerdown', e => {
    // A new pointer sequence supersedes a stale dismissal; keyboard clicks do
    // not belong to any pointer sequence.
    consumed=null;
    if(!window.__dsViewerFlags.menu)return;
    consumed={id:e.pointerId,type:e.pointerType,ended:false};e.preventDefault();e.stopImmediatePropagation();emit('dismiss');
  },true);
  const matches=e=>consumed&&e.pointerId===consumed.id&&e.pointerType===consumed.type;
  document.addEventListener('pointerup',e=>{if(matches(e))consumed.ended=true;},true);
  document.addEventListener('pointercancel',e=>{if(matches(e))consumed=null;},true);
  document.addEventListener('lostpointercapture',e=>{if(matches(e)&&!consumed.ended)consumed=null;},true);
  window.addEventListener('blur',()=>{consumed=null;});
  document.addEventListener('click', e => {if(e.detail!==0&&matches(e)){consumed=null;e.preventDefault();e.stopImmediatePropagation();}},true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&window.__dsViewerFlags.menu){e.preventDefault();e.stopImmediatePropagation();emit('dismiss');}},true);
  for(const method of ['pushState','replaceState']){const original=history[method];history[method]=function(...args){const result=original.apply(this,args);emit('changed');return result;};}
  window.addEventListener('hashchange',()=>emit('changed'));window.addEventListener('popstate',()=>emit('changed'));
  window.addEventListener('load',()=>emit('changed'));document.addEventListener('DOMContentLoaded',()=>emit('changed'));
  let dirtyQueued=false,dirtyDuringSizing=false;
  const overlay=node=>node&&node.nodeType===1&&node.closest('[data-ds-overlay]');
  const dirty=()=>{if(window.__dsSizing){dirtyDuringSizing=true;return;}if(dirtyQueued)return;dirtyQueued=true;requestAnimationFrame(()=>{dirtyQueued=false;if(!window.__dsSizing)emit('height-dirty');});};
  window.__dsFinishSizing=()=>{window.__dsSizing=false;if(dirtyDuringSizing){dirtyDuringSizing=false;dirty();}};
  const observe=()=>{
    if(!document.body)return;
    new ResizeObserver(()=>{if(!window.__dsSizing)dirty();}).observe(document.body);
    new MutationObserver(records=>{if(records.some(r=>!overlay(r.target)&&!overlay(r.target.parentElement)&&!(r.type==='childList'&&[...r.addedNodes,...r.removedNodes].every(n=>overlay(n)))))dirty();}).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','style','src','hidden','open','width','height']});
  };
  if(document.body)observe();else document.addEventListener('DOMContentLoaded',observe,{once:true});
  document.addEventListener('load',e=>{if(e.target instanceof HTMLImageElement)dirty();},true);
  if(document.fonts)document.fonts.ready.then(dirty);
  document.addEventListener('wheel',e=>{
    if(window.__dsLayoutMode!=='page'||window.__dsSizing||e.defaultPrevented||e.ctrlKey||e.metaKey)return;
    for(const node of e.composedPath()){
      if(!(node instanceof Element)||node===document.body||node===document.documentElement)continue;
      if(node.matches('textarea,input,select,[contenteditable],canvas,[role="application"],[role="slider"]'))return;
      const css=getComputedStyle(node);
      if((/(auto|scroll)/.test(css.overflowY)&&node.scrollHeight>node.clientHeight+1)||(/(auto|scroll)/.test(css.overflowX)&&node.scrollWidth>node.clientWidth+1))return;
    }
    if(![e.clientX,e.clientY,e.deltaX,e.deltaY].every(Number.isFinite))return;
    e.preventDefault();window.__dsArtifactEvent(JSON.stringify({type:'wheel',x:e.clientX,y:e.clientY,deltaX:e.deltaX,deltaY:e.deltaY}));
  },{passive:false});
})();`;
var ARTIFACT_SCRIPTS = `if(window!==top && (window.__dsTrustedArtifact || window.name==='__dsArtifact')){${ARTIFACT_BRIDGE}
${PICK_SCRIPT}
if(!window.__dsProbe){${PROBE_SCRIPT}}}`;
var SHELL_BRIDGE = `(() => {
  const frame=document.getElementById('preview'); if(!frame||!window.__dsCanvas)return false;
  frame.name='__dsArtifact';
  if(window.__dsShellBridgeInstalled)return true;window.__dsShellBridgeInstalled=true;
  let prior='';
  const update=()=>{const value=JSON.stringify({menu:!!document.querySelector('[aria-expanded="true"]'),pan:!document.getElementById('pan-layer').hidden});if(value!==prior){prior=value;window.__dsShellState(value);}};
  new MutationObserver(update).observe(document.body,{subtree:true,attributes:true,attributeFilter:['hidden','aria-expanded','aria-pressed']});update();
  document.addEventListener('keydown',e=>{if(window.__dsCaptureActive){e.preventDefault();e.stopImmediatePropagation();}},true);
  const layer=document.getElementById('pan-layer');
  let picked=false;
  layer.addEventListener('pointerdown',e=>{if(!(e.ctrlKey||e.metaKey))return;e.preventDefault();e.stopImmediatePropagation();picked=true;const r=frame.getBoundingClientRect();window.__dsShellState(JSON.stringify({pick:{x:(e.clientX-r.x)*frame.clientWidth/r.width,y:(e.clientY-r.y)*frame.clientHeight/r.height}}));},true);
  for(const type of ['pointerup','click'])layer.addEventListener(type,e=>{if(picked){e.preventDefault();e.stopImmediatePropagation();if(type==='click')picked=false;}},true);
  return true;
})();`;
function validPick(value) {
  if (!value || typeof value !== "object") return false;
  const item = value;
  for (const [key, max] of [["selector", 2048], ["tag", 64], ["classes", 2048], ["text", 200], ["outerHTML", 4e3]]) if (typeof item[key] !== "string" || item[key].length > max) return false;
  if (!item.selector || !item.tag || !item.styles || typeof item.styles !== "object" || Array.isArray(item.styles) || Object.keys(item.styles).length > 32) return false;
  if (Object.entries(item.styles).some(([key, text]) => key.length > 64 || typeof text !== "string" || text.length > 2048)) return false;
  return !!item.rect && ["x", "y", "width", "height"].every((key) => Number.isFinite(item.rect[key]) && Math.abs(item.rect[key]) <= 1e7) && item.rect.width >= 0 && item.rect.height >= 0;
}
async function reapOrphanChrome() {
  const prefix = path2.join(tmpdir(), "ds-chrome-");
  let stdout;
  try {
    ({ stdout } = await new Promise((resolve, reject) => {
      execFile("ps", ["-ax", "-o", "pid=,command="], { maxBuffer: 8 * 1024 * 1024 }, (error, out) => {
        if (error) reject(error);
        else resolve({ stdout: String(out) });
      });
    }));
  } catch {
    return;
  }
  const pids = [];
  const profiles = /* @__PURE__ */ new Set();
  for (const line of stdout.split("\n")) {
    if (!line.includes(prefix)) continue;
    const pidMatch = line.match(/^\s*(\d+)\s/);
    if (!pidMatch) continue;
    const pid = Number(pidMatch[1]);
    if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) continue;
    pids.push(pid);
    const dirMatch = line.match(/--user-data-dir=(\S+)/);
    if (dirMatch && dirMatch[1] && path2.resolve(dirMatch[1]).startsWith(prefix)) {
      profiles.add(dirMatch[1]);
    }
  }
  for (const pid of pids) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
    }
  }
  for (const profile of profiles) {
    await fs2.rm(profile, { recursive: true, force: true }).catch(() => {
    });
  }
}
var Browser = class {
  layoutState = { mode: "page", preset: "desktop", nominalHeight: 800 };
  layoutGeneration = 0;
  layoutQueued = false;
  layoutDirty = false;
  layoutContext = null;
  captureInFlight = false;
  pendingNavigation = null;
  viewer = null;
  contexts = null;
  pages = [];
  artifactUrl = "";
  artifactTitle = "";
  requestedUrl = "";
  canvasFlags = { menu: false, pan: false };
  operationTail = Promise.resolve();
  refreshing = false;
  canvasError = "";
  chrome = null;
  cdp = null;
  profileDir = null;
  sessionId = null;
  targetId = null;
  lastPick = null;
  pickSeq = 0;
  viewportWidth = VIEWPORT_WIDTH;
  viewportHeight = VIEWPORT_HEIGHT;
  starting = null;
  windowSpec;
  /**
   * URL the window is launched at. Set only when a launch actually happens; it
   * is never `about:blank`, because `--app` requires a web-safe URL.
   */
  launchUrl = null;
  /** DevTools HTTP port, for the `/json/list` diagnostics helper. */
  debuggingPort = null;
  /** Set when the Chrome child exits on its own; drives `windowOpen`. */
  closedAt = null;
  /** True while an observed/intentional close is tearing Chrome down. */
  quitting = false;
  /** The in-flight teardown, so a second close (or stop) joins it instead of racing. */
  quitPromise = null;
  constructor() {
    this.windowSpec = parseWindowSpec(process.env.DS_WINDOW) ?? DEFAULT_WINDOW;
  }
  /**
   * Start the live window at `url` if it is not already up.
   *
   * Chrome is launched LAZILY with the real target URL: `--app=<url>` is the
   * only thing that yields a chromeless window and it needs a web-safe URL, so
   * there is no `about:blank` placeholder launch. A running window is reused
   * as-is (`open()`/`navigate()` do the navigating); a call with NO URL while no
   * window is up is an error rather than a blank launch.
   */
  async start(url) {
    if (this.closedAt !== null) {
      await this.stop();
    }
    if (this.cdp) return;
    if (url === void 0) {
      throw new Error("no live window is open and no URL was provided to launch one");
    }
    if (!isWebSafeUrl(url)) {
      throw new Error(`refusing to launch the live window at a non-http(s) URL: ${url}`);
    }
    this.requestedUrl = url;
    if (!this.starting) {
      this.starting = this.launch().catch((error) => {
        this.starting = null;
        throw error;
      });
    }
    return this.starting;
  }
  async launch() {
    if (!isWebSafeUrl(this.requestedUrl)) {
      throw new Error("launch() needs a web-safe --app URL");
    }
    this.viewer = await startViewerServer({ url: this.requestedUrl, pages: [], viewport: this.viewport() });
    const url = this.viewer.url;
    this.launchUrl = url;
    const profile = await fs2.mkdtemp(path2.join(tmpdir(), "ds-chrome-"));
    this.profileDir = profile;
    const chrome = spawn(CHROME_PATH, buildLaunchArgs(this.windowSpec, profile, url), {
      stdio: "ignore",
      detached: true
    });
    chrome.unref();
    this.chrome = chrome;
    chrome.on("exit", () => {
      if (this.chrome !== chrome) return;
      this.closedAt = Date.now();
      void this.quit();
    });
    const port = await this.waitForPort(profile, chrome);
    this.debuggingPort = port;
    const version = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json());
    const wsUrl = version.webSocketDebuggerUrl;
    if (!wsUrl) throw new Error("Chrome did not report a webSocketDebuggerUrl");
    const ws = await openSocket(wsUrl);
    const cdp = new CdpClient(ws);
    this.cdp = cdp;
    this.wireEvents(cdp);
    try {
      await cdp.send("Target.setDiscoverTargets", { discover: true });
    } catch {
    }
    if (!await this.attachExistingPage(cdp)) await this.attachNewPage(cdp);
    const session = this.requireSession();
    this.contexts = new ArtifactContexts(cdp, session, ARTIFACT_SCRIPTS, () => {
      void this.refreshArtifact();
    }, url);
    await this.contexts.enable(session);
    await this.contexts.discover();
    await this.shellEval(SHELL_BRIDGE);
    await this.contexts.initializeArtifact();
  }
  /** Create a fresh page target and attach to it (last-resort fallback). */
  async attachNewPage(cdp) {
    const created = await cdp.send("Target.createTarget", { url: "about:blank" });
    this.targetId = String(created.targetId ?? "");
    const attached = await cdp.send("Target.attachToTarget", { targetId: this.targetId, flatten: true });
    this.sessionId = String(attached.sessionId ?? "");
  }
  /**
   * Attach (flatten) to an ALREADY-EXISTING `page` target — the `--app` window.
   * With `--app=<url>` the target is already at the requested URL, so the first
   * non-internal page is the window; the about:blank-preference is gone because
   * the window is never launched at a placeholder. Returns false when Chrome
   * reports no page target at all, so the caller can fall back to creating one.
   */
  async attachExistingPage(cdp) {
    const res = await cdp.send("Target.getTargets");
    const infos = Array.isArray(res.targetInfos) ? res.targetInfos : [];
    const pages = infos.filter((info) => info.type === "page");
    const chosen = pages.find((info) => !String(info.url ?? "").startsWith("chrome://")) ?? pages[0];
    if (!chosen || typeof chosen.targetId !== "string") return false;
    this.targetId = chosen.targetId;
    const attached = await cdp.send("Target.attachToTarget", { targetId: this.targetId, flatten: true });
    this.sessionId = String(attached.sessionId ?? "");
    return true;
  }
  async waitForPort(profile, chrome) {
    const file = path2.join(profile, "DevToolsActivePort");
    const deadline = Date.now() + LAUNCH_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (chrome.exitCode !== null) throw new Error(`Chrome exited early (${chrome.exitCode})`);
      try {
        const text = await fs2.readFile(file, "utf8");
        const port = Number((text.split("\n")[0] ?? "").trim());
        if (Number.isFinite(port) && port > 0) return port;
      } catch {
      }
      await delay(50);
    }
    throw new Error("timed out waiting for DevToolsActivePort");
  }
  wireEvents(cdp) {
    cdp.on("Runtime.bindingCalled", (params, session) => {
      if (typeof params.payload !== "string" || params.payload.length > 24e3) return;
      try {
        const value = JSON.parse(params.payload);
        const context = this.contexts;
        if (!context) return;
        if (context.matches(context.artifact(), session, params.executionContextId)) {
          if (params.name === "__dsPick" && validPick(value)) {
            this.lastPick = value;
            this.pickSeq += 1;
          }
          if (params.name === "__dsArtifactEvent" && value && ["dismiss", "changed", "height-dirty", "wheel"].includes(value.type)) {
            if (value.type === "dismiss" && this.canvasFlags.menu) void this.shellEval("__dsCanvas.dismissMenu()").catch(() => void 0);
            if (value.type === "changed") void this.refreshArtifact();
            if (value.type === "height-dirty") this.queueLayout();
            if (value.type === "wheel" && [value.x, value.y, value.deltaX, value.deltaY].every((n) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 8192)) {
              const artifact = context.artifact();
              void this.transaction(async () => {
                if (this.layoutState.mode !== "page" || context.artifact() !== artifact) return;
                await this.shellEval(`(()=>{const f=document.getElementById('preview'),r=f.getBoundingClientRect(),c=document.getElementById('canvas').getBoundingClientRect();return __dsCanvas.handleCanvasInput({type:'wheel',deltaX:${value.deltaX},deltaY:${value.deltaY},x:r.x+${value.x}*r.width/f.clientWidth-c.x,y:r.y+${value.y}*r.height/f.clientHeight-c.y,zoom:false})})()`);
              }).catch(() => void 0);
            }
          }
        } else if (context.matches(context.shell(), session, params.executionContextId)) {
          const authority = context.captureShellAuthority(session, params.executionContextId);
          if (!authority) return;
          if (params.name === "__dsCanvasSend") void this.canvasCommand(value, authority).catch(() => void 0);
          if (params.name === "__dsShellState" && value) {
            void this.transaction(async () => {
              if (!context.shellAuthorityCurrent(authority)) return;
              if (typeof value.menu === "boolean" && typeof value.pan === "boolean") {
                this.canvasFlags = { menu: value.menu, pan: value.pan };
                void this.evalIn(`window.__dsViewerFlags=${JSON.stringify(this.canvasFlags)}`, false).catch(() => void 0);
              } else if (value.pick && [value.pick.x, value.pick.y].every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 8192)) {
                void this.evalIn(`window.__dsPickAt(${value.pick.x},${value.pick.y})`, false).catch(() => void 0);
              }
            }).catch(() => void 0);
          }
        }
      } catch {
      }
    });
    cdp.on("Target.targetDestroyed", (params) => {
      this.handleTargetGone(String(params.targetId ?? ""), void 0);
    });
    cdp.on("Target.detachedFromTarget", (params) => {
      this.handleTargetGone(String(params.targetId ?? ""), typeof params.sessionId === "string" ? params.sessionId : void 0);
    });
  }
  /**
   * Our window target is gone. Quit Chrome (it would otherwise stay running —
   * macOS keeps the app alive after the last window closes) and remove the
   * throwaway profile. Ignored while an intentional teardown is already running.
   */
  handleTargetGone(targetId, sessionId) {
    if (this.quitting) return;
    if (this.targetId === null || targetId !== this.targetId && sessionId !== this.sessionId) return;
    this.closedAt = Date.now();
    void this.quit();
  }
  requireCdp() {
    if (!this.cdp) throw new Error("browser not started");
    return this.cdp;
  }
  requireSession() {
    if (!this.sessionId) throw new Error("browser has no attached session");
    return this.sessionId;
  }
  transaction(work) {
    const next = this.operationTail.then(work, work);
    this.operationTail = next.catch(() => void 0);
    return next;
  }
  async shellEval(expression, awaitPromise = false) {
    const context = this.contexts?.shell();
    if (!context || !this.contexts) throw new Error("canvas shell context is unavailable");
    return this.contexts.evaluate(context, expression, awaitPromise);
  }
  async getCamera() {
    if (!this.cdp) return null;
    const camera = await this.shellEval("__dsCanvas.getCamera()");
    return { ...camera, layoutMode: this.layoutState.mode, preset: this.layoutState.preset, nominalHeight: this.layoutState.nominalHeight, reason: this.layoutState.reason ?? "" };
  }
  async restoreCamera(camera) {
    if (!camera || !this.cdp) return;
    const generation = ++this.layoutGeneration;
    await this.transaction(async () => {
      if (generation !== this.layoutGeneration) return;
      if (["fit", "page", "viewport"].includes(String(camera.layoutMode)) && [camera.width, camera.height, camera.nominalHeight].every((n) => typeof n === "number" && Number.isInteger(n) && n >= 100 && n <= 8192)) {
        await this.applyLayout({ mode: camera.layoutMode, preset: String(camera.preset), nominalHeight: Number(camera.nominalHeight), reason: typeof camera.reason === "string" ? camera.reason : void 0 }, Number(camera.width), Number(camera.height));
      }
      await this.shellEval(`__dsCanvas.restoreCamera(${JSON.stringify(camera)})`);
    });
  }
  async setLayout(mode, preset = "desktop") {
    if (mode !== "fit" && mode !== "page") throw new Error("Unsupported layout mode");
    if (mode === "fit" ? preset !== "fit" : !this.presetSize(preset)) throw new Error("Unsupported layout preset");
    const generation = ++this.layoutGeneration;
    await this.transaction(() => this.reconcileLayout(mode, preset, generation));
  }
  presetSize(preset) {
    return { desktop: { width: 1280, height: 800 }, large: { width: 1920, height: 1080 }, tablet: { width: 768, height: 1024 }, mobile: { width: 390, height: 844 } }[preset];
  }
  async applyLayout(state, width, height, current = () => true) {
    const accepted = await this.shellEval(`typeof __dsCanvas.setLayout==='function'&&__dsCanvas.setLayout(${JSON.stringify({ ...state, width, height })})`);
    if (!current()) return;
    if (accepted !== true) throw new Error("Renderer contract unavailable: __dsCanvas.setLayout must accept confirmed geometry");
    await this.evalIn(`window.__dsLayoutMode=${JSON.stringify(state.mode)}`, false);
    if (!current()) return;
    this.layoutState = { ...state };
    this.viewportWidth = width;
    this.viewportHeight = height;
  }
  queueLayout() {
    if (this.layoutState.mode === "viewport" && !this.layoutState.reason || !this.cdp) return;
    this.layoutDirty = true;
    if (this.layoutQueued) return;
    this.layoutQueued = true;
    void this.transaction(async () => {
      this.layoutDirty = false;
      await this.reconcileLayout(this.layoutState.mode === "fit" ? "fit" : "page", this.layoutState.preset, this.layoutGeneration);
    }).catch(() => void 0).finally(() => {
      this.layoutQueued = false;
      if (this.layoutDirty) this.queueLayout();
    });
  }
  async reconcileLayout(mode, preset, generation, authority) {
    const contexts = this.contexts, context = contexts?.artifact();
    if (!context || !contexts) return;
    const current = () => this.contexts === contexts && contexts.artifact() === context && generation === this.layoutGeneration && (!authority || contexts.shellAuthorityCurrent(authority));
    if (!current()) return;
    await contexts.evaluate(context, "window.__dsSizing=true");
    try {
      if (!current()) return;
      const camera = mode === "page" && this.layoutState.mode === "page" && this.layoutState.preset === preset ? await this.shellEval("__dsCanvas.getCamera()") : null;
      if (!current()) return;
      if (mode === "fit") {
        const bounds = await this.shellEval("typeof __dsCanvas.getFitBounds==='function'?__dsCanvas.getFitBounds():null");
        if (!current()) return;
        if (!bounds || ![bounds.width, bounds.height].every((n) => Number.isInteger(n) && n >= 100 && n <= 8192)) throw new Error("Renderer contract unavailable: valid current getFitBounds geometry required");
        await this.applyLayout({ mode: "fit", preset: "fit", nominalHeight: bounds.height }, bounds.width, bounds.height, current);
        return;
      }
      const size = this.presetSize(preset);
      if (!size) return;
      const nominal = { mode: "viewport", preset, nominalHeight: size.height };
      await this.applyLayout(nominal, size.width, size.height, current);
      if (!current()) return;
      const measure = async () => {
        await contexts.evaluate(context, "new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))", true);
        if (!current()) return null;
        const geometry = await contexts.evaluate(context, `(()=>{const overlays=[...document.querySelectorAll('[data-ds-overlay]')].map(el=>[el,el.style.display]);try{for(const [el] of overlays)el.style.display='none';return {width:innerWidth,extent:Math.max(document.documentElement.scrollHeight,document.body?.scrollHeight||0),visible:document.documentElement.getBoundingClientRect().width>0};}finally{for(const [el,display] of overlays)el.style.display=display;}})()`);
        return current() ? geometry : null;
      };
      const first = await measure();
      if (!first) return;
      let reason = "";
      if (!first.visible || first.width !== size.width || !Number.isFinite(first.extent) || first.extent < 0) reason = "Document geometry is unavailable; using the nominal viewport.";
      else if (first.extent > 8192) reason = "Page exceeds the 8192px supported bound; using the nominal viewport.";
      const candidate = Math.max(size.height, Math.ceil(first.extent));
      if (!reason) {
        await this.applyLayout(nominal, size.width, candidate, current);
        if (!current()) return;
        const second = await measure();
        if (!second) return;
        if (!second.visible || second.width !== size.width || !Number.isFinite(second.extent) || second.extent > candidate + 1) reason = "Page height grows with its viewport and does not stabilize; using the nominal viewport.";
      }
      if (!current()) return;
      if (reason) await this.applyLayout({ ...nominal, reason }, size.width, size.height, current);
      else {
        await this.applyLayout({ mode: "page", preset, nominalHeight: size.height }, size.width, candidate, current);
        if (current() && camera?.layoutMode === "page") await this.shellEval(`__dsCanvas.restoreCamera(${JSON.stringify({ ...camera, layoutMode: "page", preset, width: size.width, height: candidate, nominalHeight: size.height, reason: "" })})`);
      }
    } finally {
      if (contexts.artifact() === context) await contexts.evaluate(context, "typeof __dsFinishSizing==='function'?__dsFinishSizing():(window.__dsSizing=false)").catch(() => void 0);
    }
  }
  async canvasCommand(command, authority) {
    if (!command || typeof command !== "object") return;
    if (!this.contexts?.shellAuthorityCurrent(authority)) return;
    const value = command;
    if (value.type === "ready") {
      await this.shellEval(SHELL_BRIDGE);
      await this.contexts?.discover();
      await this.contexts?.initializeArtifact();
    } else if (value.type === "viewport" && [value.width, value.height].every((n) => typeof n === "number" && Number.isInteger(n) && n >= 100 && n <= 8192)) {
      ++this.layoutGeneration;
      await this.transaction(() => this.resizeArtifact(value.width, value.height, authority));
    } else if (value.type === "page" && typeof value.id === "string" && value.id.length <= 128) {
      const page = this.pages.find((page2) => page2.id === value.id);
      if (page) await this.navigateGuarded(page.url, authority);
    } else if (value.type === "retry") await this.navigateGuarded(this.requestedUrl, authority);
    else if (value.type === "layout" && (value.mode === "fit" && value.preset === "fit" || value.mode === "page" && typeof value.preset === "string" && !!this.presetSize(value.preset))) {
      const generation = ++this.layoutGeneration;
      await this.transaction(() => this.reconcileLayout(value.mode, value.preset, generation, authority));
    } else if (value.type === "fit-size" && this.layoutState.mode === "fit" && !this.captureInFlight) {
      const generation = ++this.layoutGeneration;
      await this.transaction(() => this.reconcileLayout("fit", "fit", generation, authority));
    }
  }
  async refreshArtifact() {
    const context = this.contexts?.artifact();
    if (this.refreshing || !context) return;
    this.refreshing = true;
    try {
      const info = await this.contexts.evaluate(context, "({url:location.href,title:document.title,ready:document.readyState,layout:document.documentElement.getBoundingClientRect().width>0})");
      if (this.contexts?.artifact() !== context) return;
      const navigation = this.pendingNavigation;
      if (navigation) {
        if (!navigation.responded) return;
        if (navigation.loaderId) {
          if (context === navigation.previous || this.contexts.artifactLoaderId() !== navigation.loaderId) return;
        } else if (info.url !== navigation.target || context !== navigation.previous || this.contexts.artifactSameDocumentVersion() <= navigation.sameDocumentVersion) return;
      }
      if (!isWebSafeUrl(info.url)) {
        if (info.url.startsWith("chrome-error:")) {
          this.canvasError = "The preview could not be displayed. Check the dev server and CSP/X-Frame-Options embedding permissions.";
          await this.shellEval(`__dsCanvas.setStatus({state:'error',message:${JSON.stringify(this.canvasError)}})`);
        }
        return;
      }
      if (info.ready !== "complete" && info.ready !== "interactive" || !info.layout) return;
      this.canvasError = "";
      this.artifactUrl = info.url;
      this.artifactTitle = info.title;
      if (!this.pages.some((page) => page.url === info.url)) this.pages.push({ id: "page-" + (this.pages.length + 1), url: info.url, label: info.title || new URL(info.url).pathname });
      else this.pages = this.pages.map((page) => page.url === info.url ? { ...page, label: info.title || page.label } : page);
      await this.shellEval(`__dsCanvas.setPage({url:${JSON.stringify(info.url)},title:${JSON.stringify(info.title)},pages:${JSON.stringify(this.pages)},navigate:false});__dsCanvas.setStatus({state:'ready'})`);
      await this.evalIn(`window.__dsViewerFlags=${JSON.stringify(this.canvasFlags)}`, false);
      if (context !== this.layoutContext) {
        this.layoutContext = context;
        this.queueLayout();
      }
    } catch {
    } finally {
      this.refreshing = false;
    }
  }
  async waitArtifact() {
    const deadline = Date.now() + 1e4;
    while (Date.now() < deadline && this.cdp) {
      await this.contexts?.discover();
      await this.contexts?.initializeArtifact().catch(() => void 0);
      await this.refreshArtifact();
      if (this.canvasError) return false;
      if (this.artifactUrl) return true;
      await delay(50);
    }
    this.canvasError = "The preview did not become available. Check the dev server and whether CSP/X-Frame-Options permits embedding, then retry.";
    await this.shellEval(`__dsCanvas.setStatus({state:'error',message:${JSON.stringify(this.canvasError)}})`).catch(() => void 0);
    return false;
  }
  async pageInfo(cdp, session) {
    const value = await this.evalIn("JSON.stringify({url:location.href,title:document.title})", false);
    try {
      const parsed = JSON.parse(typeof value === "string" ? value : "{}");
      return { url: String(parsed.url ?? ""), title: String(parsed.title ?? "") };
    } catch {
      return { url: "", title: "" };
    }
  }
  /** Navigate and wait for the load event (resolving after 30s at the latest). */
  async navigate(url) {
    return this.navigateGuarded(url);
  }
  async navigateGuarded(url, authority) {
    if (!isWebSafeUrl(url) || new URL(url).username || new URL(url).password) throw new Error("canvas artifact requires an http(s) URL without credentials");
    const launched = !this.cdp;
    if (launched) {
      this.artifactUrl = "";
      this.artifactTitle = "";
      this.canvasError = "";
      await this.start(url);
    }
    return this.transaction(async () => {
      if (authority && !this.contexts?.shellAuthorityCurrent(authority)) return { url: this.artifactUrl, title: this.artifactTitle, settled: false };
      this.requestedUrl = new URL(url).href;
      if (launched) {
        const settled = await this.waitArtifact();
        if (settled) await this.bringToFront();
        return { url: this.artifactUrl || this.requestedUrl, title: this.artifactTitle, settled };
      }
      const previous = this.contexts?.artifact();
      if (!previous) throw new Error("artifact navigation context is unavailable; retry after the frame becomes available");
      const navigation = { previous, target: this.requestedUrl, sameDocumentVersion: this.contexts.artifactSameDocumentVersion(), responded: false, loaderId: void 0 };
      this.pendingNavigation = navigation;
      this.artifactUrl = "";
      this.artifactTitle = "";
      this.canvasError = "";
      try {
        await this.shellEval(`__dsCanvas.setStatus({state:'loading'});__dsCanvas.setPage({url:${JSON.stringify(this.requestedUrl)},pages:${JSON.stringify(this.pages)},navigate:false})`);
        if (authority && !this.contexts?.shellAuthorityCurrent(authority)) return { url: this.artifactUrl, title: this.artifactTitle, settled: false };
        const result = await this.requireCdp().send("Page.navigate", { url: this.requestedUrl, frameId: previous.frame }, previous.session);
        navigation.loaderId = typeof result.loaderId === "string" ? result.loaderId : void 0;
        navigation.responded = true;
        if (typeof result.errorText === "string" && result.errorText) {
          this.canvasError = "The preview navigation failed: " + result.errorText;
          await this.shellEval(`__dsCanvas.setStatus({state:'error',message:${JSON.stringify(this.canvasError)}})`);
          return { url: this.requestedUrl, title: "", settled: false };
        }
        const settled = await this.waitArtifact();
        if (settled) await this.bringToFront();
        return { url: this.artifactUrl || this.requestedUrl, title: this.artifactTitle, settled };
      } finally {
        if (this.pendingNavigation === navigation) this.pendingNavigation = null;
      }
    });
  }
  /**
   * Ensure the live window exists, then navigate it to `url`. This is the one
   * entry the panel uses: a first call launches the window AT `url` (never
   * about:blank, which would spawn a second window), later calls reuse the
   * existing window and navigate it.
   */
  async open(url) {
    return this.navigate(url);
  }
  /**
   * Go back/forward in the page's history and wait for the destination to
   * settle. Drives CDP's navigation history directly (a `history.back()` via
   * Runtime.evaluate races the destroyed execution context); a same-document
   * navigation fires no load event, so the settle wait is bounded.
   */
  async goHistory(direction) {
    return this.transaction(async () => {
      await this.evalIn(`history.${direction}();true`, false);
      await delay(200);
      const settled = await this.waitArtifact();
      return { url: this.artifactUrl, title: this.artifactTitle, settled };
    });
  }
  /** Apply a batch of input events (already in viewport CSS px). */
  async input(events) {
    return this.transaction(async () => {
      const cdp = this.requireCdp();
      const session = this.requireSession();
      for (const event of events) {
        await this.shellEval("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))", true);
        const rect = await this.shellEval("(()=>{const f=document.getElementById('preview'),r=f.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,cssWidth:f.clientWidth,cssHeight:f.clientHeight}})()");
        if (event.type === "pointer" && event.action === "down" && this.canvasFlags.menu) {
          await this.shellEval("__dsCanvas.dismissMenu()");
          continue;
        }
        if (event.type === "pointer" && (event.modifiers.ctrl || event.modifiers.meta) && this.canvasFlags.pan) {
          if (event.action === "up") await this.evalIn(`window.__dsPickAt(${event.x},${event.y})`, false);
          continue;
        }
        if (event.type === "pointer") {
          const type = event.action === "down" ? "mousePressed" : event.action === "up" ? "mouseReleased" : "mouseMoved";
          await cdp.send(
            "Input.dispatchMouseEvent",
            {
              type,
              x: rect.x + event.x * rect.width / rect.cssWidth,
              y: rect.y + event.y * rect.height / rect.cssHeight,
              button: buttonName(event.button),
              buttons: event.buttons,
              clickCount: event.action === "move" ? 0 : 1,
              modifiers: modifierBits(event.modifiers)
            },
            session
          );
        } else if (event.type === "wheel") {
          await cdp.send(
            "Input.dispatchMouseEvent",
            {
              type: "mouseWheel",
              x: rect.x + event.x * rect.width / rect.cssWidth,
              y: rect.y + event.y * rect.height / rect.cssHeight,
              deltaX: event.deltaX,
              deltaY: event.deltaY,
              modifiers: modifierBits(event.modifiers)
            },
            session
          );
        } else if (event.type === "key") {
          await this.shellEval("document.getElementById('preview').focus()");
          await cdp.send(
            "Input.dispatchKeyEvent",
            {
              type: event.action === "down" ? "keyDown" : "keyUp",
              key: event.key,
              code: event.code,
              modifiers: modifierBits(event.modifiers)
            },
            session
          );
        } else {
          await this.shellEval("document.getElementById('preview').focus()");
          await cdp.send("Input.insertText", { text: event.text }, session);
        }
      }
    });
  }
  /** The emulated viewport size in CSS px. */
  viewport() {
    return { width: this.viewportWidth, height: this.viewportHeight };
  }
  /** Resize the emulated viewport. */
  async resize(width, height) {
    if (![width, height].every((n) => Number.isInteger(n) && n >= 100 && n <= 8192)) throw new Error("artifact viewport must be integer dimensions from 100 to 8192");
    ++this.layoutGeneration;
    return this.transaction(() => this.resizeArtifact(width, height));
  }
  async resizeArtifact(width, height, authority) {
    if (authority && !this.contexts?.shellAuthorityCurrent(authority)) return this.viewport();
    const supportsLayout = await this.shellEval("typeof __dsCanvas.setLayout==='function'");
    if (authority && !this.contexts?.shellAuthorityCurrent(authority)) return this.viewport();
    if (supportsLayout) await this.applyLayout({ mode: "viewport", preset: "custom", nominalHeight: height }, width, height, () => !authority || !!this.contexts?.shellAuthorityCurrent(authority));
    else {
      await this.shellEval(`__dsCanvas.setViewport(${width},${height})`);
      this.layoutState = { mode: "viewport", preset: "custom", nominalHeight: height };
    }
    if (authority && !this.contexts?.shellAuthorityCurrent(authority)) return this.viewport();
    this.viewportWidth = width;
    this.viewportHeight = height;
    return { width, height };
  }
  /**
   * The app window's geometry on screen, via the CDP Browser domain. These
   * requests go to the BROWSER endpoint (no page sessionId). `null` when not
   * started, or when Chrome does not answer (e.g. a dying child).
   */
  async windowBounds() {
    const cdp = this.cdp;
    if (!cdp || !this.targetId) return null;
    try {
      const res = await cdp.send("Browser.getWindowForTarget", { targetId: this.targetId });
      const bounds = res.bounds ?? {};
      const x = Number(bounds.left);
      const y = Number(bounds.top);
      const width = Number(bounds.width);
      const height = Number(bounds.height);
      if (![x, y, width, height].every(Number.isFinite)) return null;
      return { x, y, width, height };
    } catch {
      return null;
    }
  }
  /**
   * Move/resize the app window. Coordinates are screen coordinates and may be
   * negative on macOS (a window above/left of the main display is legal — the
   * offscreen test window relies on it); only the size is floored at
   * MIN_WINDOW_EDGE. `windowState: 'normal'` so a minimized window cannot
   * silently swallow the move.
   */
  async placeWindow(x, y, width, height) {
    const cdp = this.requireCdp();
    if (!this.targetId) throw new Error("browser has no page target");
    const res = await cdp.send("Browser.getWindowForTarget", { targetId: this.targetId });
    const windowId = res.windowId;
    if (typeof windowId !== "number" || windowId < 0) throw new Error("no window for the page target");
    await cdp.send("Browser.setWindowBounds", {
      windowId,
      bounds: {
        left: Math.round(x),
        top: Math.round(y),
        width: Math.max(MIN_WINDOW_EDGE, Math.round(width)),
        height: Math.max(MIN_WINDOW_EDGE, Math.round(height)),
        windowState: "normal"
      }
    });
  }
  /**
   * How many `page` targets Chrome currently reports. Test hook for target
   * acquisition: the `--app` window is REUSED, so the count must stay 1 — a
   * blind createTarget would show up as 2 (a second window).
   */
  async pageTargetCount() {
    const cdp = this.cdp;
    if (!cdp) return 0;
    const res = await cdp.send("Target.getTargets");
    const infos = Array.isArray(res.targetInfos) ? res.targetInfos : [];
    return infos.filter((info) => info.type === "page").length;
  }
  /**
   * The DevTools HTTP `/json/list` targets, for diagnostics and tests. The
   * chromeless regression test reads this same source to prove no
   * `chrome://omnibox-popup` target (i.e. no address bar) exists. Empty when no
   * window is up or the endpoint is unreachable.
   */
  async jsonList() {
    if (this.debuggingPort === null) return [];
    try {
      const res = await fetch(`http://127.0.0.1:${this.debuggingPort}/json/list`);
      return await res.json();
    } catch {
      return [];
    }
  }
  /** The throwaway profile dir while a window is up, else null. Inspection/test seam. */
  profilePath() {
    return this.profileDir;
  }
  /**
   * Public seam for `POST /focus`: raise the live window (see bringToFront)
   * without navigating or reloading the page. Best effort — a request with no
   * window up is a no-op.
   */
  async focus() {
    await this.bringToFront();
  }
  /**
   * Briefly re-flash the element matching `selector` in the live window (the
   * panel drives this while the user hovers a reference row). Runs the injected
   * `window.__dsHighlight`, which reuses the pick outline in a distinct accent
   * and hides it after ~900ms. Returns false — never throws for a page-level
   * miss — when no window is open, the selector is invalid, or nothing matches.
   */
  async highlight(selector) {
    if (!this.cdp) return false;
    const expression = `(typeof window.__dsHighlight === 'function') ? window.__dsHighlight(${JSON.stringify(
      selector
    )}) : false`;
    const value = await this.evaluate(expression);
    return value === true;
  }
  /**
   * Raise the live window so the user can see it. macOS keeps the Chrome bundle
   * already running as an application, so a freshly launched app window lands
   * behind the OpenChamber window (or on another Space) and looks like "nothing
   * opened". Activating the target and asking the page to come to the front is
   * what actually surfaces it; also restores a minimized window. Best effort —
   * the window still exists even if the OS refuses focus.
   */
  async bringToFront() {
    const cdp = this.cdp;
    if (!cdp) return;
    try {
      if (this.targetId) await cdp.send("Target.activateTarget", { targetId: this.targetId });
      await cdp.send("Page.bringToFront", {}, this.sessionId ?? void 0);
    } catch {
    }
    await this.ensureWindowNotMinimized();
  }
  /**
   * A minimized window stops compositing and cannot be captured reliably. A
   * navigate means someone is about to look at the page, so restore a
   * minimized window; maximized/fullscreen stay as the user left them. Best
   * effort — must never fail the navigation.
   */
  async ensureWindowNotMinimized() {
    const cdp = this.cdp;
    if (!cdp || !this.targetId) return;
    try {
      const res = await cdp.send("Browser.getWindowForTarget", { targetId: this.targetId });
      const bounds = res.bounds ?? {};
      if (bounds.windowState === "minimized") {
        await cdp.send("Browser.setWindowBounds", { windowId: res.windowId, bounds: { windowState: "normal" } });
      }
    } catch {
    }
  }
  /**
   * PNG of the current viewport, for the agent's `browser.capture` action — a
   * deterministic, lossless still of the compositor as laid out.
   */
  async capture() {
    return this.transaction(async () => {
      const cdp = this.requireCdp();
      const session = this.requireSession();
      const token = await this.shellEval("__dsCanvas.beginCapture()");
      this.captureInFlight = true;
      try {
        await cdp.send("Emulation.setDeviceMetricsOverride", { width: Math.max(1e3, this.viewportWidth + 48), height: this.viewportHeight + 256, deviceScaleFactor: 1, mobile: false }, session);
        const bounds = await this.shellEval(`__dsCanvas.normalizeCapture(${JSON.stringify(token)})`, true);
        if (bounds.width !== this.viewportWidth || bounds.height !== this.viewportHeight) throw new Error("Canvas capture geometry did not match the artifact viewport");
        const result = await cdp.send(
          "Page.captureScreenshot",
          { format: "png", fromSurface: true, captureBeyondViewport: true, clip: { ...bounds, scale: 1 } },
          session
        );
        const data = typeof result.data === "string" ? result.data : "";
        return {
          png: Buffer.from(data, "base64"),
          width: this.viewportWidth,
          height: this.viewportHeight
        };
      } finally {
        try {
          await cdp.send("Emulation.clearDeviceMetricsOverride", {}, session);
        } finally {
          try {
            await this.shellEval(`__dsCanvas.endCapture(${JSON.stringify(token)})`);
          } finally {
            this.captureInFlight = false;
          }
        }
      }
    });
  }
  /** Evaluate an expression in the page and return its value. */
  async evaluate(expression) {
    return this.evalIn(expression, false);
  }
  async evalIn(expression, awaitPromise) {
    const context = this.contexts?.artifact();
    if (!context || !this.contexts) throw new Error("artifact context is unavailable; check embedding permissions and retry");
    return this.contexts.evaluate(context, expression, awaitPromise);
  }
  /**
   * The in-page probe report. Returns a null-safe default when the probe is
   * absent (e.g. before any navigation on `about:blank`).
   */
  async getProbe() {
    const value = await this.evaluate(PROBE_EXPR);
    if (typeof value !== "string" || value.length === 0) return emptyProbeReport();
    try {
      const parsed = JSON.parse(value);
      return {
        scrollWidth: Number(parsed.scrollWidth ?? 0),
        clientWidth: Number(parsed.clientWidth ?? 0),
        innerWidth: Number(parsed.innerWidth ?? 0),
        innerHeight: Number(parsed.innerHeight ?? 0),
        scrollHeight: Number(parsed.scrollHeight ?? 0),
        cls: Number(parsed.cls ?? 0),
        selectors: Array.isArray(parsed.selectors) ? parsed.selectors : []
      };
    } catch {
      return emptyProbeReport();
    }
  }
  /**
   * Freeze the page for deterministic capture: prefer-reduced-motion, a style
   * that kills animation/transition and the caret, plus a blur and finished
   * animations. Call before `waitForStable()` / `capture()`.
   */
  async applyStableMode() {
    const cdp = this.requireCdp();
    const session = this.contexts?.artifact()?.session;
    if (!session) throw new Error("artifact context is unavailable");
    await cdp.send(
      "Emulation.setEmulatedMedia",
      { features: [{ name: "prefers-reduced-motion", value: "reduce" }] },
      session
    );
    await this.evaluate(
      `(function () {
        var style = document.createElement('style');
        style.textContent = ${JSON.stringify(STABLE_STYLE)};
        (document.head || document.documentElement).appendChild(style);
        return true;
      })()`
    );
    await this.evaluate(
      "document.activeElement && document.activeElement.blur(); document.getAnimations().forEach(a=>{try{a.finish()}catch(e){}})"
    );
  }
  /**
   * Wait until two consecutive PNG captures are byte-identical. Waits for fonts,
   * lets two animation frames pass, then polls `capture()` every `intervalMs`
   * (default 120) up to `timeoutMs` (default 3000). Returns whether it settled.
   */
  async waitForStable(opts) {
    const timeoutMs = opts?.timeoutMs ?? 3e3;
    const intervalMs = opts?.intervalMs ?? 120;
    await this.evalIn(
      "document.fonts && document.fonts.ready ? document.fonts.ready.then(function () { return true; }) : true",
      true
    );
    await this.evalIn(
      "new Promise(function (resolve) { requestAnimationFrame(function () { requestAnimationFrame(function () { resolve(true); }); }); })",
      true
    );
    const deadline = Date.now() + timeoutMs;
    let previous = (await this.capture()).png;
    while (Date.now() < deadline) {
      await delay(intervalMs);
      const next = (await this.capture()).png;
      if (previous.equals(next)) return true;
      previous = next;
    }
    return false;
  }
  /** No live frames any more; kept for browser-control's scroll sizing helper. */
  latestFrame() {
    return null;
  }
  async state() {
    let url = "";
    let title = "";
    if (this.cdp) {
      try {
        const info = await this.pageInfo(this.cdp, this.requireSession());
        url = info.url;
        title = info.title;
      } catch {
      }
    }
    return {
      url,
      title,
      lastPick: this.lastPick,
      pickSeq: this.pickSeq,
      windowOpen: this.closedAt === null && (this.chrome !== null || this.cdp !== null)
    };
  }
  /**
   * Close the live window and QUIT Chrome, removing the throwaway profile.
   *
   * This is what `POST /close` (Design Mode going OFF) calls, and it is the same
   * teardown the user's own window close triggers. After it resolves,
   * `state().windowOpen` is false and a later `start()`/`open()` relaunches a
   * fresh window with a new profile.
   */
  async close() {
    if (this.chrome === null && this.cdp === null) {
      this.closedAt = Date.now();
      return;
    }
    this.closedAt = Date.now();
    await this.quit();
  }
  /** Run the teardown once; concurrent callers (close, stop, target events) join it. */
  quit() {
    if (!this.quitPromise) {
      this.quitting = true;
      this.quitPromise = this.doQuit().catch(() => {
      });
    }
    return this.quitPromise;
  }
  /**
   * The actual shutdown: destroy the page target (as closing the window does),
   * ask the BROWSER endpoint to `Browser.close` (a clean quit that also takes
   * down the `--no-startup-window` background process macOS would otherwise
   * leave), escalate to SIGTERM/SIGKILL on the child as a fallback, then remove
   * the temp profile.
   */
  async doQuit() {
    const cdp = this.cdp;
    if (cdp) {
      if (this.targetId) {
        try {
          await cdp.send("Target.closeTarget", { targetId: this.targetId });
        } catch {
        }
      }
      try {
        await cdp.send("Browser.close");
      } catch {
      }
      cdp.close();
      this.cdp = null;
      this.sessionId = null;
      this.targetId = null;
    }
    const chrome = this.chrome;
    if (chrome) {
      await this.waitForExit(chrome, 1500);
      if (chrome.exitCode === null) {
        try {
          chrome.kill("SIGTERM");
        } catch {
        }
        await this.waitForExit(chrome, 3e3);
      }
      if (chrome.exitCode === null) {
        try {
          chrome.kill("SIGKILL");
        } catch {
        }
        await this.waitForExit(chrome, 2e3);
      }
      this.chrome = null;
    }
    await this.reapProfile();
    this.contexts?.close();
    this.contexts = null;
    await this.viewer?.close();
    this.viewer = null;
  }
  /** Resolve once the child has exited or `timeoutMs` elapses. */
  waitForExit(chrome, timeoutMs) {
    if (chrome.exitCode !== null || chrome.signalCode !== null) return Promise.resolve();
    return new Promise((resolve) => {
      let done2 = false;
      const finish = () => {
        if (done2) return;
        done2 = true;
        chrome.removeListener("exit", finish);
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(finish, timeoutMs);
      chrome.once("exit", finish);
    });
  }
  /** Remove the throwaway profile dir, once Chrome has released it. */
  async reapProfile() {
    const profile = this.profileDir;
    if (!profile) return;
    await fs2.rm(profile, { recursive: true, force: true }).catch(() => {
    });
    if (this.profileDir === profile) this.profileDir = null;
    this.debuggingPort = null;
  }
  /**
   * Detach from the live window and — by default — kill the Chrome child.
   *
   * `kill: false` is the service's DELIBERATE lifetime choice (see
   * surface.stopBrowser): the detached window belongs to the user and must
   * outlive the service, so the service never kills it on shutdown. With
   * `kill: false` the throwaway profile is intentionally left behind, because
   * the surviving Chrome still owns it; the OS temp reaper reclaims it.
   */
  async stop(opts = {}) {
    const kill = opts.kill ?? true;
    if (kill && !this.quitPromise && (this.chrome || this.cdp)) {
      await this.close();
    }
    this.contexts?.close();
    this.contexts = null;
    await this.viewer?.close();
    this.viewer = null;
    if (this.quitPromise) {
      await this.quitPromise;
      this.quitPromise = null;
      this.quitting = false;
    }
    if (this.cdp) {
      this.cdp.close();
      this.cdp = null;
    }
    if (this.chrome) {
      if (kill) {
        try {
          this.chrome.kill("SIGKILL");
        } catch {
        }
      }
      this.chrome = null;
    }
    if (this.profileDir) {
      if (kill) {
        await fs2.rm(this.profileDir, { recursive: true, force: true }).catch(() => {
        });
      }
      this.profileDir = null;
    }
    this.sessionId = null;
    this.targetId = null;
    this.starting = null;
    this.launchUrl = null;
    this.debuggingPort = null;
    this.closedAt = null;
    this.quitting = false;
    this.quitPromise = null;
  }
};

// service/project-server.ts
var PROBE_TIMEOUT_MS = 1500;
var POLL_INTERVAL_MS = 300;
var EARLY_EXIT_MS = 2e3;
var DEFAULT_TIMEOUT_MS = 6e4;
var STOP_TERM_WAIT_MS = 500;
var STOP_KILL_WAIT_MS = 2e3;
var PORT_FREE_WAIT_MS = 2e3;
var STOP_POLL_MS = 50;
var SERVER_STATE_DIR = ".design-studio";
var SERVER_STATE_FILE = "server.json";
var activeSpawns = /* @__PURE__ */ new Map();
var serverRecords = /* @__PURE__ */ new Map();
function serverStatePath(dir) {
  return path3.join(dir, SERVER_STATE_DIR, SERVER_STATE_FILE);
}
async function readServerRecord(dir) {
  try {
    const parsed = JSON.parse(await fs3.readFile(serverStatePath(dir), "utf8"));
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed;
    if (typeof record.pgid !== "number" || !Number.isFinite(record.pgid) || record.pgid <= 0) return null;
    return {
      pgid: record.pgid,
      pid: typeof record.pid === "number" && record.pid > 0 ? record.pid : record.pgid,
      port: typeof record.port === "number" && Number.isFinite(record.port) ? record.port : null,
      startedAt: typeof record.startedAt === "number" ? record.startedAt : 0,
      identity: typeof record.identity === "string" && record.identity.trim() !== "" ? record.identity : void 0
    };
  } catch {
    return null;
  }
}
async function writeServerRecord(dir, record) {
  serverRecords.set(dir, record);
  try {
    await fs3.mkdir(path3.join(dir, SERVER_STATE_DIR), { recursive: true });
    await fs3.writeFile(serverStatePath(dir), JSON.stringify(record), "utf8");
  } catch {
  }
}
async function clearServerRecord(dir) {
  serverRecords.delete(dir);
  try {
    await fs3.rm(serverStatePath(dir), { force: true });
  } catch {
  }
}
async function clearRecordIfSame(dir, pgid) {
  const current = serverRecords.get(dir);
  if (current) {
    if (current.pgid === pgid) await clearServerRecord(dir);
  } else if ((await readServerRecord(dir))?.pgid === pgid) {
    await clearServerRecord(dir);
  }
}
function delay2(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function isLoopbackHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "::1") return true;
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
}
function isLoopbackUrl(rawUrl) {
  try {
    return isLoopbackHost(new URL(rawUrl).hostname);
  } catch {
    return false;
  }
}
async function probeOnce(url) {
  try {
    await fetch(url, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    return true;
  } catch {
    return false;
  }
}
async function isReachable(url) {
  if (await probeOnce(url)) return true;
  const sibling = otherLoopback(url);
  if (sibling && sibling !== url) return probeOnce(sibling);
  return false;
}
function canBindPort(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const probe = createServer2();
    probe.once("error", () => resolve(false));
    probe.listen(port, host, () => {
      probe.close(() => resolve(true));
    });
  });
}
function portFromUrl(url) {
  try {
    const raw = new URL(url).port;
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
}
function groupAlive(pgid) {
  try {
    process.kill(-pgid, 0);
    return true;
  } catch (error) {
    return error.code !== "ESRCH";
  }
}
var execFileAsync = promisify(execFile2);
async function readProcessIdentity(pid) {
  try {
    const { stdout } = await execFileAsync("ps", ["-p", String(pid), "-o", "lstart="]);
    const line = stdout.trim();
    return line === "" ? null : line;
  } catch {
    return null;
  }
}
async function verifyRecordIdentity(record) {
  if (!record.identity) {
    return { verified: false, reason: `the recorded server (pid ${record.pid}) cannot be verified as ours` };
  }
  const identity = await readProcessIdentity(record.pid);
  if (identity === null || identity !== record.identity) {
    return { verified: false, reason: `the recorded server (pid ${record.pid}) cannot be verified as ours` };
  }
  return { verified: true };
}
function signalGroup(pgid, signal) {
  try {
    process.kill(-pgid, signal);
    return true;
  } catch {
    return false;
  }
}
async function waitForGroupGone(pgid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!groupAlive(pgid)) return true;
    await delay2(STOP_POLL_MS);
  }
  return !groupAlive(pgid);
}
async function waitForPortFree(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await canBindPort(port)) return true;
    await delay2(STOP_POLL_MS);
  }
  return canBindPort(port);
}
async function stopDevServer(dir) {
  const key = path3.resolve(dir);
  const record = serverRecords.get(key) ?? await readServerRecord(key);
  if (!record) return { stopped: false };
  const stoppedPgid = record.pgid;
  if (groupAlive(stoppedPgid)) {
    const check = await verifyRecordIdentity(record);
    if (!check.verified) return { stopped: false, error: `${check.reason}; not stopping it` };
    signalGroup(stoppedPgid, "SIGTERM");
    if (!await waitForGroupGone(stoppedPgid, STOP_TERM_WAIT_MS)) {
      signalGroup(stoppedPgid, "SIGKILL");
      if (!await waitForGroupGone(stoppedPgid, STOP_KILL_WAIT_MS)) {
        return {
          stopped: false,
          error: `the dev server process group (pgid ${stoppedPgid}) is still alive after SIGTERM and SIGKILL`
        };
      }
    }
  }
  if (record.port !== null && !await waitForPortFree(record.port, PORT_FREE_WAIT_MS)) {
    return {
      stopped: false,
      error: `port ${record.port} remains in use after the dev server stopped`
    };
  }
  await clearRecordIfSame(key, stoppedPgid);
  return { stopped: true };
}
async function getDevServerStatus(dir) {
  const key = path3.resolve(dir);
  const record = serverRecords.get(key) ?? await readServerRecord(key);
  if (!record) {
    const { config } = await readStudioConfig(key);
    const configuredPort = portFromUrl(typeof config?.url === "string" ? config.url : "");
    if (configuredPort !== null && !await canBindPort(configuredPort)) {
      return {
        up: false,
        port: configuredPort,
        error: `port ${configuredPort} is answered by a process this service did not start`
      };
    }
    return { up: false, port: null };
  }
  if (!groupAlive(record.pgid)) {
    await clearRecordIfSame(key, record.pgid);
    if (record.port !== null && !await canBindPort(record.port)) {
      return {
        up: false,
        port: record.port,
        error: `port ${record.port} is answered by a process this service did not start`
      };
    }
    return { up: false, port: null };
  }
  const check = await verifyRecordIdentity(record);
  if (!check.verified) {
    return {
      up: false,
      port: record.port,
      error: `${check.reason} \u2014 not reporting it as running`
    };
  }
  const up = record.port !== null ? await isReachable(`http://127.0.0.1:${record.port}/`) : false;
  const status = { up, port: record.port };
  if (record.pgid > 0) status.pid = record.pgid;
  return status;
}
async function ensureDevServer(url, options = {}) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { started: false, up: false, error: `invalid URL: ${url}` };
  }
  if (!isLoopbackHost(parsed.hostname)) {
    return {
      started: false,
      up: false,
      error: `refusing to start a dev server for a non-loopback host: ${parsed.hostname}`
    };
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const dir = options.dir;
  if (!dir) {
    if (await isReachable(url)) return { started: false, up: true };
    return {
      started: false,
      up: false,
      error: "the dev server is not running and no project directory was provided to start it"
    };
  }
  const key = path3.resolve(dir);
  const inFlight = activeSpawns.get(key);
  if (inFlight) {
    const joined = await inFlight;
    return { started: false, up: joined.up, ...joined.error ? { error: joined.error } : {} };
  }
  let settle = () => {
  };
  const claimed = new Promise((resolve) => {
    settle = resolve;
  });
  activeSpawns.set(key, claimed);
  const finish = (result) => {
    settle(result);
    return result;
  };
  try {
    if (await isReachable(url)) {
      if (options.ownedOnly !== true) {
        return finish({ started: false, up: true });
      }
      const pinnedPort2 = portFromUrl(url);
      const existing2 = serverRecords.get(key) ?? await readServerRecord(key);
      if (existing2 && pinnedPort2 !== null && existing2.port === pinnedPort2 && groupAlive(existing2.pgid)) {
        const check = await verifyRecordIdentity(existing2);
        if (check.verified) return finish({ started: false, up: true });
      }
      return finish({
        started: false,
        up: false,
        error: pinnedPort2 === null ? "the URL answers, but no server recorded for this project can be verified as ours" : `port ${pinnedPort2} is already in use by another process \u2014 stop it or change the port in .design-studio.json`
      });
    }
    const pinnedPort = portFromUrl(url);
    const existing = serverRecords.get(key) ?? await readServerRecord(key);
    if (existing && pinnedPort !== null && existing.port !== null && existing.port !== pinnedPort && groupAlive(existing.pgid)) {
      const check = await verifyRecordIdentity(existing);
      if (check.verified) {
        return finish({
          started: false,
          up: false,
          error: `the recorded dev server is still running on port ${existing.port} \u2014 stop it before starting port ${pinnedPort}`
        });
      }
      return finish({
        started: false,
        up: false,
        error: `${check.reason} \u2014 not overwriting its record`
      });
    }
    if (existing && pinnedPort !== null && existing.port === pinnedPort && !await canBindPort(pinnedPort) && groupAlive(existing.pgid)) {
      const check = await verifyRecordIdentity(existing);
      if (check.verified) return finish({ started: false, up: true });
    }
    const { config } = await readStudioConfig(key);
    const command = typeof config?.command === "string" ? config.command.trim() : "";
    if (!command) {
      return finish({
        started: false,
        up: false,
        error: 'the dev server is not running and .design-studio.json has no "command" to start it'
      });
    }
    if (pinnedPort !== null && !await canBindPort(pinnedPort)) {
      return finish({
        started: false,
        up: false,
        error: `port ${pinnedPort} is already in use by another process \u2014 stop it or change the port in .design-studio.json`
      });
    }
    return finish(await startAndWait(command, key, url, timeoutMs));
  } finally {
    activeSpawns.delete(key);
  }
}
async function startAndWait(command, dir, url, timeoutMs) {
  const startedAt = Date.now();
  let failure = null;
  let sawUp = false;
  let leader = null;
  let child;
  try {
    child = spawn2(command, { cwd: dir, shell: true, detached: true, stdio: "ignore" });
  } catch (error) {
    return {
      started: false,
      up: false,
      error: `could not start "${command}": ${error instanceof Error ? error.message : String(error)}`
    };
  }
  child.unref();
  leader = typeof child.pid === "number" ? child.pid : null;
  const pid = child.pid;
  if (typeof pid === "number") {
    let identity = await readProcessIdentity(pid);
    if (identity === null) {
      await delay2(50);
      identity = await readProcessIdentity(pid);
    }
    await writeServerRecord(path3.resolve(dir), {
      pgid: pid,
      pid,
      port: portFromUrl(url),
      startedAt: Date.now(),
      ...identity ? { identity } : {}
    });
  }
  child.on("error", (error) => {
    if (failure === null) failure = `could not start "${command}": ${error.message}`;
  });
  child.on("exit", (code, signal) => {
    if (failure === null && !sawUp && Date.now() - startedAt <= EARLY_EXIT_MS) {
      const how = code !== null ? `exit code ${code}` : `signal ${signal}`;
      failure = `the command "${command}" exited right after starting (${how})`;
      if (leader !== null) void clearRecordIfSame(dir, leader);
    }
  });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (failure !== null) return { started: true, up: false, error: failure };
    if (await isReachable(url)) {
      sawUp = true;
      return { started: true, up: true };
    }
    await delay2(POLL_INTERVAL_MS);
  }
  return {
    started: true,
    up: false,
    error: `the command started but ${url} never came up within ${Math.round(timeoutMs / 1e3)}s`
  };
}

// service/surface.ts
var browser = null;
async function ensureBrowser(url) {
  if (!browser) browser = new Browser();
  if (url !== void 0) await browser.start(url);
  return browser;
}
function getBrowser() {
  return browser;
}
async function stopBrowser() {
  if (!browser) return;
  const current = browser;
  browser = null;
  await current.stop({ kill: process.env.DS_KILL_WINDOW_ON_STOP === "1" });
}
function getController() {
  return "none";
}

// service/browser-control.ts
import path5 from "node:path";

// node_modules/@openchamber/sdk/dist/scrollbar-style.js
var GUEST_SCROLLING_ATTRIBUTE = "data-oc-scrolling";
var GUEST_SCROLLBAR_CSS = `
:root {
  --oc-scrollbar-thumb: color-mix(in srgb, var(--oc-muted, currentColor) 40%, transparent);
  --oc-scrollbar-thumb-hover: color-mix(in srgb, var(--oc-muted, currentColor) 65%, transparent);
  scrollbar-gutter: stable;
}
* {
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}
:hover, [${GUEST_SCROLLING_ATTRIBUTE}] {
  scrollbar-color: var(--oc-scrollbar-thumb) transparent;
}
/* Chromium's standard scrollbar properties otherwise override its pseudo-elements. */
@supports selector(::-webkit-scrollbar) {
  *, :hover, [${GUEST_SCROLLING_ATTRIBUTE}] { scrollbar-width: auto; scrollbar-color: auto; }
  ::-webkit-scrollbar { width: 6px; height: 6px; background: transparent; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb {
    background: transparent;
    border-radius: 999px;
    min-width: 24px;
    min-height: 24px;
  }
  :hover::-webkit-scrollbar-thumb, [${GUEST_SCROLLING_ATTRIBUTE}]::-webkit-scrollbar-thumb { background: var(--oc-scrollbar-thumb); }
  ::-webkit-scrollbar-thumb:hover { background: var(--oc-scrollbar-thumb-hover); }
  ::-webkit-scrollbar-corner { background: transparent; }
  ::-webkit-scrollbar-button { display: none; width: 0; height: 0; }
}
@media (forced-colors: active) {
  *, :hover, [${GUEST_SCROLLING_ATTRIBUTE}] { scrollbar-color: auto; }
  ::-webkit-scrollbar-thumb, ::-webkit-scrollbar-thumb:hover { background: CanvasText; }
}
`;
function installGuestScrollbarActivity(doc) {
  const root = doc.documentElement;
  if (root.hasAttribute("data-oc-scrollbar-activity"))
    return;
  root.setAttribute("data-oc-scrollbar-activity", "");
  const timers = /* @__PURE__ */ new WeakMap();
  doc.addEventListener("scroll", (event) => {
    const target = event.target === doc ? root : event.target;
    if (!(target instanceof Element))
      return;
    if (!target.hasAttribute("data-oc-scrolling"))
      target.setAttribute("data-oc-scrolling", "");
    const pending = timers.get(target);
    if (pending !== void 0)
      clearTimeout(pending);
    timers.set(target, setTimeout(() => {
      timers.delete(target);
      target.removeAttribute("data-oc-scrolling");
    }, 1e3));
  }, { capture: true, passive: true });
}
var GUEST_SCROLLBAR_SCRIPT = `(${installGuestScrollbarActivity.toString()})(document);`;

// node_modules/@openchamber/sdk/dist/contract.js
var GUEST_FILE_STAT_KINDS = ["file", "directory", "other", "missing"];
var HOST_REQUEST_ERROR_CODES = [
  "HOST_UNAVAILABLE",
  "HOST_TIMEOUT",
  "HOST_REJECTED",
  "DISCONNECTED",
  "DISABLED",
  "BAD_PATH",
  "NO_INTEGRATION",
  "NO_SERVICE",
  "SERVICE_FAILED",
  "NO_SESSION",
  "SESSION_BUSY",
  "NOT_GRANTED",
  "NO_DIRECTORY",
  "NOT_FOUND",
  "FILE_TOO_LARGE",
  "DENIED",
  "NO_MODEL",
  "MODEL_FAILED",
  "UNSUPPORTED"
];
var SERVICE_STATUS_VALUES = ["stopped", "starting", "ready", "failed"];
var hostRequestErrorCodeSet = new Set(HOST_REQUEST_ERROR_CODES);
var serviceStatusSet = new Set(SERVICE_STATUS_VALUES);
var fileStatKindSet = new Set(GUEST_FILE_STAT_KINDS);

// node_modules/@openchamber/sdk/dist/service-providers.js
var BROWSER_PROVIDER_PATH = "/browser-control";
var BROWSER_CONTROL_ACTIONS = [
  "browser.open",
  "browser.snapshot",
  "browser.click",
  "browser.type",
  "browser.scroll",
  "browser.back",
  "browser.forward",
  "browser.inspect",
  "browser.capture",
  "browser.resize"
];
var BROWSER_VIEWPORT_MODES = ["mobile", "tablet", "desktop", "fill"];
var BROWSER_PROVIDER_IDLE_MS = 10 * 6e4;
var CONTROL_ACTIONS = new Set(BROWSER_CONTROL_ACTIONS);
var isBrowserControlAction = (value) => CONTROL_ACTIONS.has(value);
var readContext = (wire) => {
  const directory = wire?.directory;
  const sessionId = wire?.sessionId;
  return {
    directory: String(directory) === directory && directory.length > 0 ? directory : null,
    sessionId: String(sessionId) === sessionId && sessionId.length > 0 ? sessionId : null
  };
};
var readBrowserProviderRequest = (body) => {
  let wire;
  try {
    const parsed = JSON.parse(body);
    if (Object(parsed) !== parsed || parsed === null)
      return null;
    wire = parsed;
  } catch {
    return null;
  }
  const { requestId, action, parameters, context } = wire;
  if (String(requestId) !== requestId || requestId.length === 0)
    return null;
  if (String(action) !== action || !isBrowserControlAction(action))
    return null;
  if (Object(parameters) !== parameters)
    return null;
  return { requestId, action, parameters, context: readContext(context) };
};

// node_modules/@openchamber/sdk/dist/service-surface.js
var SURFACE_CONTROLLERS = ["none", "agent", "user"];
var CONTROLLERS = new Set(SURFACE_CONTROLLERS);

// service/gates/probe.ts
var INTERACTIVE_TAGS = /* @__PURE__ */ new Set(["a", "button", "input", "select", "textarea", "summary", "option"]);
var INTERACTIVE_ROLES = /* @__PURE__ */ new Set([
  "button",
  "link",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "tab",
  "checkbox",
  "radio",
  "switch",
  "textbox",
  "searchbox",
  "combobox",
  "slider",
  "spinbutton"
]);
function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function isInteractive(el) {
  const tag = (el.tag ?? "").toLowerCase();
  if (INTERACTIVE_TAGS.has(tag)) return true;
  const role = (el.role ?? "").toLowerCase();
  if (role && INTERACTIVE_ROLES.has(role)) return true;
  return typeof el.tabIndex === "number" && el.tabIndex >= 0;
}
function isRendered(el) {
  return !el.styles || el.styles.display !== "none";
}
function hasAccessibleName(el) {
  return nonEmpty(el.label) || nonEmpty(el.ariaLabel);
}
function hasText(el) {
  return hasAccessibleName(el);
}
function headingLevelOf(el) {
  if (typeof el.headingLevel === "number" && el.headingLevel >= 1 && el.headingLevel <= 6) {
    return el.headingLevel;
  }
  const m = /^h([1-6])$/.exec((el.tag ?? "").toLowerCase());
  return m ? parseInt(m[1], 10) : null;
}
function fontSizePx(value) {
  const m = /^([\d.]+)\s*(px|rem|em)?$/i.exec((value ?? "").trim());
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (Number.isNaN(n)) return null;
  const unit = (m[2] ?? "px").toLowerCase();
  if (unit === "px") return n;
  if (unit === "rem" || unit === "em") return n * 16;
  return null;
}
function isLargeText(fontSize, fontWeight) {
  const px = fontSizePx(fontSize);
  if (px === null) return false;
  if (px >= 24) return true;
  const weight = parseInt(fontWeight, 10);
  return px >= 18.66 && Number.isFinite(weight) && weight >= 700;
}
function isFullyTransparent(color) {
  const v = (color ?? "").trim().toLowerCase();
  if (!v || v === "transparent") return true;
  const fn = /^(rgba?|hsla?)\(([^)]*)\)$/.exec(v);
  if (fn) {
    const name = fn[1];
    const body = fn[2];
    if (name.endsWith("a")) {
      const tokens = body.split(",");
      const last = tokens[tokens.length - 1].trim();
      const alpha = last.endsWith("%") ? parseFloat(last) / 100 : parseFloat(last);
      if (alpha === 0) return true;
    } else if (body.includes("/")) {
      const alphaTok = body.split("/")[1].trim();
      const alpha = alphaTok.endsWith("%") ? parseFloat(alphaTok) / 100 : parseFloat(alphaTok);
      if (alpha === 0) return true;
    }
  }
  const hex = /^#([0-9a-f]{4}|[0-9a-f]{8})$/.exec(v);
  if (hex) {
    const h = hex[1];
    const alpha = h.length === 4 ? h[3] : h.slice(6);
    if (alpha === "0" || alpha === "00") return true;
  }
  return false;
}
function rectRight(el) {
  return el.rect.x + el.rect.width;
}
function rectsOverlap(a, b) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}
function rectContains(outer, inner) {
  return outer.x <= inner.x && outer.y <= inner.y && outer.x + outer.width >= inner.x + inner.width && outer.y + outer.height >= inner.y + inner.height;
}
function dedupeFindings(findings) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const f of findings) {
    const key = `${f.id}|${f.selector ?? ""}|${f.evidence}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

// shared/verify-types.ts
var VIEWPORTS = [
  { id: "mobile", label: "Mobile", width: 390, height: 844, mode: "mobile" },
  { id: "tablet", label: "Tablet", width: 768, height: 1024, mode: "tablet" },
  { id: "desktop", label: "Desktop", width: 1280, height: 800, mode: "desktop" },
  { id: "wide", label: "Wide", width: 2048, height: 1152, mode: "wide" }
];
var GATE_ORDER = ["G1", "G4", "G3", "G6", "G5"];
function findingSignature(f) {
  return `${f.gate}|${f.selector ?? ""}|${f.id}|${f.evidence}`;
}
function summarizeFindings(findings) {
  const summary = { p0: 0, p1: 0, p2: 0 };
  for (const f of findings) {
    if (f.severity === "P0") summary.p0++;
    else if (f.severity === "P1") summary.p1++;
    else summary.p2++;
  }
  return summary;
}
function gateStatusFromFindings(gate, findings, opts) {
  const own = findings.filter((f) => f.gate === gate);
  if (own.length === 0) return "pass";
  if (opts?.tolerated) return "warn";
  return "fail";
}

// service/gates/overflow.ts
var TOLERANCE = 1;
function runOverflowGate(probe) {
  const findings = [];
  if (probe.scrollWidth > probe.clientWidth + TOLERANCE) {
    findings.push({
      id: "overflow/horizontal",
      gate: "G1",
      severity: "P0",
      message: `Page scrolls horizontally: the document is ${probe.scrollWidth - probe.clientWidth}px wider than its viewport.`,
      evidence: `scrollWidth ${probe.scrollWidth} > clientWidth ${probe.clientWidth}`
    });
    const docWidth = Math.max(probe.clientWidth, probe.innerWidth);
    for (const el of probe.selectors) {
      const right = rectRight(el);
      const offRight = right > docWidth + TOLERANCE;
      const offLeft = el.rect.x < 0;
      if (!offRight && !offLeft) continue;
      findings.push({
        id: "overflow/element",
        gate: "G1",
        severity: "P0",
        selector: el.selector,
        message: offRight ? `Element extends past the ${docWidth}px document width.` : "Element sits left of the viewport edge.",
        evidence: offRight ? `rect.right ${right} > width ${docWidth}` : `rect.x ${el.rect.x} < 0`
      });
    }
  }
  const unique = dedupeFindings(findings);
  return { gate: "G1", status: gateStatusFromFindings("G1", unique), findings: unique };
}

// service/lint.ts
function clampChannel(n) {
  return Math.max(0, Math.min(255, Math.round(n)));
}
function parseColor(input) {
  const value = input.trim().toLowerCase();
  if (!value) return null;
  if (value === "white") return [255, 255, 255];
  if (value === "black") return [0, 0, 0];
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const rgb = /^rgba?\(\s*([^)]+)\s*\)$/i.exec(value);
  if (rgb) {
    const parts = rgb[1].split(",").map((p) => p.trim());
    if (parts.length < 3) return null;
    const nums = parts.slice(0, 3).map((p) => p.endsWith("%") ? parseFloat(p) / 100 * 255 : parseFloat(p));
    if (nums.some((n) => Number.isNaN(n))) return null;
    return [clampChannel(nums[0]), clampChannel(nums[1]), clampChannel(nums[2])];
  }
  return null;
}
function luminance([r, g, b]) {
  const chan = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}
function contrastRatio(fg, bg) {
  const a = parseColor(fg);
  const b = parseColor(bg);
  if (!a || !b) return null;
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return Math.round((hi + 0.05) / (lo + 0.05) * 100) / 100;
}

// service/gates/a11y.ts
var NORMAL_MIN = 4.5;
var LARGE_MIN = 3;
function runA11yGate(probe) {
  const findings = [];
  let skippedTransparent = 0;
  for (const el of probe.selectors) {
    if (!isRendered(el)) continue;
    const styles = el.styles;
    if (styles && hasText(el)) {
      if (isFullyTransparent(styles.backgroundColor)) {
        skippedTransparent++;
      } else {
        const ratio = contrastRatio(styles.color, styles.backgroundColor);
        if (ratio !== null) {
          const large = isLargeText(styles.fontSize, styles.fontWeight);
          const min = large ? LARGE_MIN : NORMAL_MIN;
          if (ratio < min) {
            findings.push({
              id: large ? "a11y/contrast-large" : "a11y/contrast",
              gate: "G3",
              severity: "P0",
              selector: el.selector,
              message: `${large ? "Large" : "Normal"} text contrast ${ratio}:1 is below the ${min}:1 minimum.`,
              evidence: `${styles.color} on ${styles.backgroundColor} = ${ratio}:1`
            });
          }
        }
      }
    }
    if (el.ariaHidden !== true && isInteractive(el) && !hasAccessibleName(el)) {
      findings.push({
        id: "a11y/name",
        gate: "G3",
        severity: "P0",
        selector: el.selector,
        message: "Interactive element has no accessible name.",
        evidence: `${el.tag} name empty`
      });
    }
    if ((el.tag ?? "").toLowerCase() === "img" && el.hasAlt !== true) {
      findings.push({
        id: "a11y/img-alt",
        gate: "G3",
        severity: "P0",
        selector: el.selector,
        message: "Image is missing an alt attribute.",
        evidence: "img alt missing"
      });
    }
  }
  const unique = dedupeFindings(findings);
  const note = skippedTransparent > 0 ? `${skippedTransparent} text element(s) on a transparent background were not contrast-checked.` : void 0;
  return { gate: "G3", status: gateStatusFromFindings("G3", unique), findings: unique, ...note ? { note } : {} };
}

// service/gates/semantics.ts
function runSemanticsGate(probe) {
  const findings = [];
  const headings = probe.selectors.map((el) => ({ el, level: headingLevelOf(el) })).filter((h) => h.level !== null);
  const h1Count = headings.filter((h) => h.level === 1).length;
  if (h1Count !== 1) {
    findings.push({
      id: "semantics/h1-count",
      gate: "G6",
      severity: "P1",
      message: `Expected exactly one <h1>, found ${h1Count}.`,
      evidence: `h1 count ${h1Count}`
    });
  }
  let prev = 0;
  for (const { el, level } of headings) {
    if (prev > 0 && level > prev + 1) {
      findings.push({
        id: "semantics/heading-order",
        gate: "G6",
        severity: "P1",
        selector: el.selector,
        message: `Heading level jumps from h${prev} to h${level}.`,
        evidence: `h${prev} -> h${level}`
      });
    }
    prev = level;
  }
  for (const el of probe.selectors) {
    if (!isRendered(el)) continue;
    if (el.ariaHidden === true) continue;
    if (isInteractive(el) && !hasAccessibleName(el)) {
      findings.push({
        id: "semantics/unlabelled-control",
        gate: "G6",
        severity: "P0",
        selector: el.selector,
        message: "Interactive element has no accessible name.",
        evidence: `${el.tag} name empty`
      });
    }
  }
  for (const el of probe.selectors) {
    if (el.ariaHidden === true && typeof el.tabIndex === "number" && el.tabIndex >= 0) {
      findings.push({
        id: "semantics/aria-hidden-focus",
        gate: "G6",
        severity: "P1",
        selector: el.selector,
        message: "Element is hidden from assistive technology but still focusable.",
        evidence: `aria-hidden tabindex ${el.tabIndex}`
      });
    }
  }
  const unique = dedupeFindings(findings);
  return { gate: "G6", status: gateStatusFromFindings("G6", unique), findings: unique };
}

// service/gates/tokens.ts
function blankComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "));
}
function lineOf(text, index) {
  let line = 1;
  const end = Math.min(index, text.length);
  for (let i = 0; i < end; i++) if (text[i] === "\n") line++;
  return line;
}
function isTokenSelector(selector) {
  const s = selector.trim().toLowerCase();
  if (!s) return false;
  return /:root\b/.test(s) || /\[data-theme\b/.test(s) || /\[data-color-scheme\b/.test(s) || /(?:^|[\s,>+~])\.theme\b/.test(s) || /(?:^|[\s,>+~])\.dark\b/.test(s) || /prefers-color-scheme/.test(s);
}
function tokenScopeRanges(text) {
  const ranges = [];
  const stack = [];
  let prelude = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") {
      const parentToken = stack.length > 0 ? stack[stack.length - 1].token : false;
      stack.push({ token: parentToken || isTokenSelector(prelude), start: i });
      prelude = "";
    } else if (ch === "}") {
      const block = stack.pop();
      if (block && block.token) ranges.push([block.start, i]);
      prelude = "";
    } else if (ch === ";") {
      prelude = "";
    } else {
      prelude += ch;
    }
  }
  return ranges;
}
function normalizeColor(value) {
  const v = (value ?? "").trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,8})$/.exec(v);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.replace(/./g, (c) => c + c);
    else if (h.length === 4) h = h.slice(0, 3).replace(/./g, (c) => c + c);
    else if (h.length === 6) {
    } else if (h.length === 8) h = h.slice(0, 6);
    else return null;
    return `#${h}`;
  }
  const rgb = parseColor(v);
  if (rgb) return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  return null;
}
var VAR_RE = /var\(\s*(--[A-Za-z0-9_-]+)/g;
var COLOR_RE = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})\b|(?:rgba?|hsla?)\([^)]*\)/gi;
function runTokensGate(input) {
  const findings = [];
  const tokens = input.tokens ?? {};
  const defined = new Set(Object.keys(tokens));
  const tokenByColor = /* @__PURE__ */ new Map();
  for (const [name, value] of Object.entries(tokens)) {
    const norm = normalizeColor(value);
    if (norm && !tokenByColor.has(norm)) tokenByColor.set(norm, name);
  }
  for (const file of input.files ?? []) {
    const text = blankComments(file.text ?? "");
    const ranges = tokenScopeRanges(text);
    const inTokenScope = (index) => ranges.some(([start, end]) => index >= start && index <= end);
    let m;
    VAR_RE.lastIndex = 0;
    while (m = VAR_RE.exec(text)) {
      const name = m[1];
      if (defined.has(name)) continue;
      findings.push({
        id: "tokens/undefined-var",
        gate: "G4",
        severity: "P0",
        message: `var(${name}) is referenced but not defined.`,
        evidence: `${file.path}:${lineOf(text, m.index)}`
      });
    }
    COLOR_RE.lastIndex = 0;
    while (m = COLOR_RE.exec(text)) {
      if (inTokenScope(m.index)) continue;
      const literal = m[0];
      const norm = normalizeColor(literal);
      const token = norm ? tokenByColor.get(norm) : void 0;
      const line = lineOf(text, m.index);
      if (token) {
        findings.push({
          id: "tokens/token-literal",
          gate: "G4",
          severity: "P1",
          message: `Colour ${literal} is defined by ${token}; use var(${token}) instead.`,
          evidence: `${file.path}:${line}`
        });
      } else {
        findings.push({
          id: "tokens/raw-color",
          gate: "G4",
          severity: "P1",
          message: `Raw colour ${literal} used outside a token/theme scope.`,
          evidence: `${file.path}:${line}`
        });
      }
    }
  }
  const unique = dedupeFindings(findings);
  return { gate: "G4", status: gateStatusFromFindings("G4", unique), findings: unique };
}

// service/gates/layout.ts
var MIN_TARGET = 24;
var TOUCH_TARGET = 44;
var MAX_CLS = 0.1;
function runLayoutGate(probe) {
  const findings = [];
  const interactive = probe.selectors.filter(
    (el) => isRendered(el) && isInteractive(el) && (el.rect.width > 0 || el.rect.height > 0)
  );
  let belowTouch = 0;
  for (const el of interactive) {
    const { width, height } = el.rect;
    if (width < MIN_TARGET || height < MIN_TARGET) {
      findings.push({
        id: "layout/tap-target",
        gate: "G5",
        severity: "P1",
        selector: el.selector,
        message: `Tap target ${width}\xD7${height}px is smaller than ${MIN_TARGET}\xD7${MIN_TARGET}px.`,
        evidence: `${width}x${height} < ${MIN_TARGET}x${MIN_TARGET}`
      });
    }
    if (width < TOUCH_TARGET || height < TOUCH_TARGET) belowTouch++;
  }
  for (let i = 0; i < interactive.length; i++) {
    for (let j = i + 1; j < interactive.length; j++) {
      const a = interactive[i];
      const b = interactive[j];
      if (!rectsOverlap(a.rect, b.rect)) continue;
      if (rectContains(a.rect, b.rect) || rectContains(b.rect, a.rect)) continue;
      findings.push({
        id: "layout/overlap",
        gate: "G5",
        severity: "P2",
        selector: a.selector,
        message: `Interactive elements overlap: ${a.selector} and ${b.selector}.`,
        evidence: `${a.selector} \u2229 ${b.selector}`
      });
    }
  }
  if (probe.cls > MAX_CLS) {
    findings.push({
      id: "layout/shift",
      gate: "G5",
      severity: "P1",
      message: `Cumulative layout shift ${probe.cls} exceeds ${MAX_CLS}.`,
      evidence: `cls ${probe.cls}`
    });
  }
  const unique = dedupeFindings(findings);
  const note = belowTouch > 0 ? `${belowTouch} tap target(s) are below the ${TOUCH_TARGET}px touch guideline.` : void 0;
  return { gate: "G5", status: gateStatusFromFindings("G5", unique), findings: unique, ...note ? { note } : {} };
}

// service/gates/index.ts
function runGateReport(probe, ctx = {}) {
  const byGate = {
    G1: runOverflowGate(probe),
    G4: runTokensGate({ files: ctx.files ?? [], tokens: ctx.tokens ?? {} }),
    G3: runA11yGate(probe),
    G6: runSemanticsGate(probe),
    G5: runLayoutGate(probe)
  };
  return GATE_ORDER.filter((gate) => byGate[gate] !== void 0).map((gate) => byGate[gate]);
}

// service/verify.ts
import { promises as fs4 } from "node:fs";
import path4 from "node:path";
var DEFAULT_DEADLINE_MS = 10 * 6e4;
var MAX_ITERATIONS = 40;
var SOURCE_EXT = /* @__PURE__ */ new Set([
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".html",
  ".htm",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".vue",
  ".svelte",
  ".svg"
]);
var SKIP_DIRS = /* @__PURE__ */ new Set(["node_modules", "dist", "build", "coverage", ".git", ".design-studio"]);
var MAX_FILES = 200;
var MAX_FILE_BYTES = 2e5;
var MAX_TOTAL_BYTES = 2e6;
var TOKEN_RE = /(--[A-Za-z0-9_-]+)\s*:\s*([^;{}]+);/g;
function parseTokens(text) {
  const tokens = {};
  let m;
  TOKEN_RE.lastIndex = 0;
  while (m = TOKEN_RE.exec(text)) tokens[m[1]] = m[2].trim();
  return tokens;
}
async function walkSources(root, dir, out) {
  if (out.length >= MAX_FILES) return;
  let entries;
  try {
    entries = await fs4.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (out.length >= MAX_FILES) return;
    if (entry.name.startsWith(".")) continue;
    const abs = path4.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walkSources(root, abs, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!SOURCE_EXT.has(path4.extname(entry.name).toLowerCase())) continue;
    try {
      const stat = await fs4.stat(abs);
      if (stat.size > MAX_FILE_BYTES) continue;
      const text = await fs4.readFile(abs, "utf8");
      out.push({ path: path4.relative(root, abs).split(path4.sep).join("/"), text });
    } catch {
    }
  }
}
async function gatherGateContext(dir) {
  if (!dir) return { files: [], tokens: {} };
  const files = [];
  await walkSources(dir, dir, files);
  let total = 0;
  const bounded = [];
  for (const file of files) {
    if (total + file.text.length > MAX_TOTAL_BYTES) break;
    total += file.text.length;
    bounded.push(file);
  }
  let tokens = {};
  try {
    tokens = parseTokens(await fs4.readFile(path4.join(dir, "tokens.css"), "utf8"));
  } catch {
  }
  return { files: bounded, tokens };
}
function tagFindings(gates, viewportId) {
  return gates.map((gate) => ({
    ...gate,
    findings: gate.findings.map((finding) => ({
      ...finding,
      evidence: `@${viewportId} ${finding.evidence}`
    }))
  }));
}
var STATUS_RANK = {
  pass: 0,
  skipped: 1,
  warn: 2,
  fail: 3
};
function mergeGates(perViewport) {
  const merged = /* @__PURE__ */ new Map();
  for (const gates of perViewport) {
    for (const gate of gates) {
      const current = merged.get(gate.gate);
      if (!current) {
        merged.set(gate.gate, {
          gate: gate.gate,
          status: gate.status,
          findings: [...gate.findings],
          ...gate.note ? { note: gate.note } : {}
        });
        continue;
      }
      current.findings.push(...gate.findings);
      if (STATUS_RANK[gate.status] > STATUS_RANK[current.status]) current.status = gate.status;
      if (gate.note) current.note = current.note ? `${current.note}; ${gate.note}` : gate.note;
    }
  }
  return GATE_ORDER.filter((gate) => merged.has(gate)).map((gate) => merged.get(gate));
}
function detectOscillation(history2, current) {
  const previous = history2[history2.length - 1];
  const older = history2[history2.length - 2];
  if (!previous || !older) return { reappeared: [], flipped: [] };
  const reappeared = [];
  for (const signature of current.signatures) {
    if (older.signatures.has(signature) && !previous.signatures.has(signature)) {
      reappeared.push(signature);
    }
  }
  const flipped = [];
  for (const gate of GATE_ORDER) {
    const a = older.gateStatus[gate];
    const b = previous.gateStatus[gate];
    const c = current.gateStatus[gate];
    if (a !== void 0 && a === c && b !== void 0 && b !== a) flipped.push(gate);
  }
  return { reappeared, flipped };
}
var history = [];
var lastReport = null;
function getLastReport() {
  return lastReport;
}
function providerVerification(url, gates, viewports = [], note) {
  return {
    url,
    ranAt: (/* @__PURE__ */ new Date()).toISOString(),
    viewports,
    gates: gates.map((gate) => ({
      gate: gate.gate,
      status: gate.status,
      summary: summarizeFindings(gate.findings)
    })),
    ...note ? { note } : {}
  };
}
function providerVerificationFromReport(report) {
  return providerVerification(
    report.url,
    report.gates,
    report.viewports,
    report.halted?.reason
  );
}
async function runVerification(opts) {
  const dir = opts.dir;
  if (dir !== null && !path4.isAbsolute(dir)) throw new Error("dir must be an absolute project path");
  let matrix = opts.viewports && opts.viewports.length ? VIEWPORTS.filter((v) => opts.viewports.includes(v.id)) : [...VIEWPORTS];
  if (matrix.length === 0) matrix = [...VIEWPORTS];
  const maxIterations = opts.maxIterations ?? MAX_ITERATIONS;
  const deadlineMs = opts.deadlineMs ?? DEFAULT_DEADLINE_MS;
  const started = Date.now();
  const browser2 = await ensureBrowser();
  const restore = browser2.viewport();
  const camera = await browser2.getCamera();
  try {
    if (opts.navigate !== false) await browser2.navigate(opts.url);
    await browser2.applyStableMode();
    const ctx = await gatherGateContext(dir);
    const perViewport = [];
    const halts = [];
    let iterations = 0;
    for (const viewport of matrix) {
      if (getController() === "user") {
        halts.push({
          guard: "control",
          reason: "the user is controlling the shared browser; the viewport matrix stopped before resizing. Wait for control to return, then retry the browser action."
        });
        break;
      }
      if (iterations >= maxIterations) {
        halts.push({ guard: "iterations", reason: `stopped after ${iterations} viewport iteration(s)` });
        break;
      }
      if (Date.now() - started > deadlineMs) {
        halts.push({ guard: "deadline", reason: `wall-clock budget of ${deadlineMs}ms exceeded` });
        break;
      }
      iterations++;
      await browser2.resize(viewport.width, viewport.height);
      await browser2.applyStableMode();
      const probe = await browser2.getProbe();
      perViewport.push(tagFindings(runGateReport(probe, ctx), viewport.id));
    }
    const gates = mergeGates(perViewport);
    const summary = summarizeFindings(gates.flatMap((gate) => gate.findings));
    const snapshot = {
      signatures: new Set(gates.flatMap((gate) => gate.findings.map(findingSignature))),
      gateStatus: Object.fromEntries(gates.map((gate) => [gate.gate, gate.status]))
    };
    const oscillation = detectOscillation(history, snapshot);
    history.push(snapshot);
    if (history.length > 3) history.shift();
    if (oscillation.reappeared.length > 0 || oscillation.flipped.length > 0) {
      halts.push({
        guard: "oscillation",
        reason: [
          oscillation.reappeared.length > 0 ? `${oscillation.reappeared.length} finding(s) reappeared after being fixed` : "",
          oscillation.flipped.length > 0 ? `gate(s) ${oscillation.flipped.join(", ")} flipped back and forth` : ""
        ].filter(Boolean).join("; "),
        signatures: oscillation.reappeared
      });
    }
    const report = {
      url: opts.url,
      ranAt: (/* @__PURE__ */ new Date()).toISOString(),
      viewports: matrix.slice(0, iterations).map((viewport) => viewport.id),
      gates,
      summary,
      iterations,
      ...halts.length > 0 ? { halted: halts[0] } : {}
    };
    lastReport = report;
    return report;
  } finally {
    if (getController() !== "user" && (await browser2.state()).windowOpen) {
      try {
        await browser2.resize(restore.width, restore.height);
      } finally {
        await browser2.restoreCamera(camera);
      }
    }
  }
}

// service/browser-control.ts
var NO_MODIFIERS = { alt: false, ctrl: false, meta: false, shift: false };
var MODE_SIZES = {
  mobile: { width: 390, height: 844 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 800 },
  fill: null
};
var MAX_SNAPSHOT_ELEMENTS = 300;
var MAX_SNAPSHOT_TEXT = 2e4;
var MAX_PROBLEMS = 20;
var MAX_LABEL = 120;
var STYLE_KEYS = [
  "display",
  "position",
  "width",
  "height",
  "color",
  "backgroundColor",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "letterSpacing",
  "textAlign",
  "margin",
  "padding",
  "border",
  "borderRadius",
  "boxShadow",
  "gap",
  "flexDirection",
  "justifyContent",
  "alignItems",
  "gridTemplateColumns",
  "opacity",
  "zIndex",
  "overflow",
  "transform"
];
function fail(error) {
  return { ok: false, error };
}
function done(data) {
  return { ok: true, data };
}
function delay3(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function summarize(width, height) {
  for (const mode of BROWSER_VIEWPORT_MODES) {
    const size = MODE_SIZES[mode];
    if (size && size.width === width && size.height === height) return { mode, width, height };
  }
  return { mode: "custom", width, height };
}
function viewportToken(summary) {
  if (summary.mode !== "custom") return summary.mode;
  return `${summary.width ?? 0}x${summary.height ?? 0}`;
}
function projectDir(context) {
  const dir = context.directory;
  return dir && path5.isAbsolute(dir) ? dir : null;
}
function requireSelector(value, action) {
  if (!value || !value.trim()) {
    throw new ActionError(`The ${action} action needs a CSS selector; pass one in "selector".`);
  }
  return value;
}
var ActionError = class extends Error {
};
async function pageUrl(browser2) {
  const state = await browser2.state();
  return { url: state.url, title: state.title };
}
async function scrollMetrics(browser2) {
  try {
    const raw = await browser2.evaluate(
      "JSON.stringify({ scrollY: window.scrollY || 0, maxScrollY: Math.max(0, document.documentElement.scrollHeight - window.innerHeight) })"
    );
    if (typeof raw === "string") {
      const parsed = JSON.parse(raw);
      return { scrollY: Number(parsed.scrollY) || 0, maxScrollY: Number(parsed.maxScrollY) || 0 };
    }
  } catch {
  }
  return { scrollY: 0, maxScrollY: 0 };
}
async function matrixVerification(browser2, dir, url) {
  const restore = browser2.viewport();
  const camera = await browser2.getCamera();
  let heldByUser = false;
  try {
    const report = await runVerification({ dir, url, navigate: false });
    if (report.halted?.guard === "control") {
      heldByUser = true;
      return { error: report.halted.reason };
    }
    return { verification: providerVerificationFromReport(report) };
  } finally {
    if (!heldByUser) {
      try {
        await browser2.resize(restore.width, restore.height);
      } finally {
        await browser2.restoreCamera(camera);
      }
    }
  }
}
async function currentViewportVerification(browser2, dir, url) {
  const probe = await browser2.getProbe();
  const ctx = await gatherGateContext(dir);
  const gates = runGateReport(probe, ctx);
  const { width, height } = browser2.viewport();
  return providerVerification(url, gates, [viewportToken(summarize(width, height))]);
}
async function handleResize(browser2, params, dir) {
  const size = MODE_SIZES[params.viewport];
  if (size) await browser2.resize(size.width, size.height);
  const { width, height } = browser2.viewport();
  const summary = summarize(width, height);
  const url = (await pageUrl(browser2)).url;
  const data = {
    viewport: summary,
    verification: await currentViewportVerification(browser2, dir, url)
  };
  return done(data);
}
async function handleOpen(browser2, params, dir) {
  const nav = await browser2.navigate(params.url);
  if (params.viewport) {
    const size = MODE_SIZES[params.viewport];
    if (size) await browser2.resize(size.width, size.height);
  }
  await browser2.applyStableMode();
  await browser2.waitForStable();
  const { width, height } = browser2.viewport();
  const url = nav.url || params.url;
  const matrix = await matrixVerification(browser2, dir, url);
  if ("error" in matrix) return fail(matrix.error);
  const data = {
    url,
    title: nav.title,
    opened: true,
    settled: nav.settled,
    viewport: summarize(width, height),
    verification: matrix.verification
  };
  return done(data);
}
function inViewport(el, probe) {
  const vw = probe.innerWidth || probe.clientWidth;
  const vh = probe.innerHeight;
  const { x, y, width, height } = el.rect;
  if (width <= 0 || height <= 0) return false;
  return x < vw && y < vh && x + width > 0 && y + height > 0;
}
function toSnapshotElement(el, probe) {
  const element = {
    selector: el.selector,
    tag: el.tag,
    bounds: { x: el.rect.x, y: el.rect.y, width: el.rect.width, height: el.rect.height }
  };
  if (inViewport(el, probe)) element.inViewport = true;
  if (el.role) element.role = el.role;
  const label = el.label || el.ariaLabel;
  if (label) element.label = label;
  if (isInteractive(el) && !hasAccessibleName(el)) element.missingAccessibleName = true;
  return element;
}
function problemsFromGates(gates) {
  const problems = [];
  for (const gate of gates) {
    if (gate.status !== "fail") continue;
    for (const finding of gate.findings) {
      problems.push({
        level: finding.severity === "P0" ? "error" : "warning",
        message: `${finding.gate} ${finding.id}: ${finding.message}`,
        source: "design-studio"
      });
      if (problems.length >= MAX_PROBLEMS) return problems;
    }
  }
  return problems;
}
async function handleSnapshot(browser2, params, dir) {
  const selector = params.selector?.trim() || void 0;
  if (selector) {
    const exists = await browser2.evaluate(
      `!!document.querySelector(${JSON.stringify(selector)})`
    );
    if (exists !== true) {
      return fail(`No element matches ${selector}. Check the selector, or omit it to snapshot the whole page.`);
    }
  }
  const probe = await browser2.getProbe();
  const elements = probe.selectors;
  const interactiveCount = elements.filter((el) => isInteractive(el)).length;
  const capped = elements.slice(0, MAX_SNAPSHOT_ELEMENTS);
  const textRaw = await browser2.evaluate(
    `(function () { var el = ${selector ? `document.querySelector(${JSON.stringify(selector)})` : "document.body"}; return (el && (el.innerText || el.textContent)) || ''; })()`
  );
  const fullText = typeof textRaw === "string" ? textRaw : "";
  const text = fullText.slice(0, MAX_SNAPSHOT_TEXT);
  const metrics = await scrollMetrics(browser2);
  const { url, title } = await pageUrl(browser2);
  const ctx = await gatherGateContext(dir);
  const gates = runGateReport(probe, ctx);
  const problems = problemsFromGates(gates);
  const viewport = summarize(browser2.viewport().width, browser2.viewport().height);
  const data = {
    url,
    title,
    scope: selector ?? "page",
    scrollY: metrics.scrollY,
    maxScrollY: metrics.maxScrollY,
    text,
    elements: capped.map((el) => toSnapshotElement(el, probe)),
    viewport,
    verification: providerVerification(url, gates, [viewportToken(viewport)])
  };
  if (fullText.length > text.length) {
    data.textTruncated = true;
    data.textTotalChars = fullText.length;
  }
  if (elements.length > capped.length) data.elementsTruncated = true;
  if (interactiveCount > 0) data.interactiveElementsOnPage = interactiveCount;
  if (problems.length > 0) data.consoleProblems = problems;
  return done(data);
}
async function handleInspect(browser2, params) {
  const selector = requireSelector(params.selector, "browser.inspect");
  const raw = await browser2.evaluate(
    `(function () {
      var el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      var cs = getComputedStyle(el);
      var keys = ${JSON.stringify(STYLE_KEYS)};
      var styles = {};
      for (var i = 0; i < keys.length; i++) styles[keys[i]] = cs[keys[i]];
      var r = el.getBoundingClientRect();
      var label = (el.getAttribute('aria-label') || el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, ${MAX_LABEL});
      return JSON.stringify({
        tag: el.tagName.toLowerCase(),
        label: label,
        bounds: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) },
        styles: styles,
        vw: window.innerWidth,
        vh: window.innerHeight
      });
    })()`
  );
  if (typeof raw !== "string") {
    return fail(`No element matches ${selector}. Check the selector and try again.`);
  }
  const parsed = JSON.parse(raw);
  const { x, y, width, height } = parsed.bounds;
  const data = {
    selector,
    tag: parsed.tag,
    label: parsed.label,
    bounds: parsed.bounds,
    inViewport: x < parsed.vw && y < parsed.vh && x + width > 0 && y + height > 0,
    styles: parsed.styles
  };
  return done(data);
}
async function handleCapture(browser2, _params, dir) {
  const shot = await browser2.capture();
  const { width, height } = browser2.viewport();
  const summary = summarize(width, height);
  const { url, title } = await pageUrl(browser2);
  const matrix = await matrixVerification(browser2, dir, url);
  if ("error" in matrix) return fail(matrix.error);
  const data = {
    base64: shot.png.toString("base64"),
    mime: "image/png",
    width,
    height,
    url,
    title,
    viewport: summary,
    verification: matrix.verification
  };
  return done(data);
}
async function handleClick(browser2, params) {
  const selector = params.selector?.trim();
  const text = params.text?.trim();
  if (!selector && !text) {
    return fail('The browser.click action needs a "selector" or "text" to find the element.');
  }
  const script = selector ? `(function () {
        var el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        el.scrollIntoView({ block: 'center', inline: 'nearest' });
        el.click();
        return JSON.stringify({ clicked: ${JSON.stringify(selector)}, label: (el.getAttribute('aria-label') || el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, ${MAX_LABEL}), url: location.href });
      })()` : `(function () {
        var needle = ${JSON.stringify(text)}.toLowerCase();
        var nodes = document.querySelectorAll('a,button,[role="button"],[role="link"],input[type="submit"],input[type="button"],summary,label');
        for (var i = 0; i < nodes.length; i++) {
          var el = nodes[i];
          var label = (el.getAttribute('aria-label') || el.value || el.textContent || '').replace(/\\s+/g, ' ').trim();
          if (label.toLowerCase().indexOf(needle) >= 0) {
            el.scrollIntoView({ block: 'center', inline: 'nearest' });
            el.click();
            return JSON.stringify({ clicked: label.slice(0, ${MAX_LABEL}), label: label.slice(0, ${MAX_LABEL}), url: location.href });
          }
        }
        return null;
      })()`;
  const raw = await browser2.evaluate(script);
  if (typeof raw !== "string") {
    return fail(
      selector ? `No element matches ${selector}. Check the selector and try again.` : `No clickable element contains the text "${text}". Try a different text or a CSS selector.`
    );
  }
  const parsed = JSON.parse(raw);
  const data = { clicked: parsed.clicked, label: parsed.label, url: parsed.url };
  return done(data);
}
async function handleType(browser2, params) {
  const selector = requireSelector(params.selector, "browser.type");
  const found = await browser2.evaluate(
    `(function () {
      var el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
      el.focus();
      return el.tagName.toLowerCase();
    })()`
  );
  if (!found) {
    return fail(`No element matches ${selector}. Check the selector and try again.`);
  }
  await browser2.input([{ type: "text", text: params.value }]);
  if (params.submit) {
    await browser2.input([
      { type: "key", action: "down", key: "Enter", code: "Enter", modifiers: NO_MODIFIERS },
      { type: "key", action: "up", key: "Enter", code: "Enter", modifiers: NO_MODIFIERS }
    ]);
    await browser2.waitForStable();
  }
  const url = (await pageUrl(browser2)).url;
  const data = { selector, url };
  return done(data);
}
async function wheelBy(browser2, deltaY) {
  const { width, height } = browser2.viewport();
  const frame = browser2.latestFrame();
  const fx = frame?.width && frame.width > 0 ? frame.width : width;
  const fy = frame?.height && frame.height > 0 ? frame.height : height;
  await browser2.input([
    { type: "wheel", x: Math.round(fx / 2), y: Math.round(fy / 2), deltaX: 0, deltaY, modifiers: NO_MODIFIERS }
  ]);
  await delay3(150);
}
async function handleScroll(browser2, params) {
  const selector = params.selector?.trim();
  const direction = params.direction ?? "down";
  const { width, height } = browser2.viewport();
  let scrolledTo;
  if (selector) {
    const found = await browser2.evaluate(
      `(function () {
        var el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        el.scrollIntoView({ block: 'center', inline: 'nearest' });
        return true;
      })()`
    );
    if (!found) return fail(`No element matches ${selector}. Check the selector and try again.`);
    scrolledTo = selector;
  } else if (direction === "top") {
    await browser2.evaluate("window.scrollTo(0, 0); true");
  } else if (direction === "bottom") {
    await browser2.evaluate("window.scrollTo(0, document.documentElement.scrollHeight); true");
  } else {
    await wheelBy(browser2, direction === "up" ? -height : height);
  }
  const metrics = await scrollMetrics(browser2);
  const data = {
    scrollY: metrics.scrollY,
    maxScrollY: metrics.maxScrollY,
    atTop: metrics.scrollY <= 0,
    atBottom: metrics.scrollY >= metrics.maxScrollY - 1,
    direction
  };
  if (scrolledTo) data.scrolledTo = scrolledTo;
  return done(data);
}
async function handleHistory(browser2, direction) {
  const nav = await browser2.goHistory(direction);
  const data = { url: nav.url, title: nav.title };
  return done(data);
}
async function handleBrowserControl(_req, body) {
  const request = readBrowserProviderRequest(body);
  if (!request) {
    return fail(
      `Unrecognized browser-control request. Send { requestId, action, parameters } with action one of: ${BROWSER_CONTROL_ACTIONS.join(", ")}.`
    );
  }
  try {
    const browser2 = await ensureBrowser();
    const dir = projectDir(request.context);
    switch (request.action) {
      case "browser.open":
        return await handleOpen(browser2, request.parameters, dir);
      case "browser.snapshot":
        return await handleSnapshot(browser2, request.parameters, dir);
      case "browser.click":
        return await handleClick(browser2, request.parameters);
      case "browser.type":
        return await handleType(browser2, request.parameters);
      case "browser.scroll":
        return await handleScroll(browser2, request.parameters);
      case "browser.back":
        return await handleHistory(browser2, "back");
      case "browser.forward":
        return await handleHistory(browser2, "forward");
      case "browser.inspect":
        return await handleInspect(browser2, request.parameters);
      case "browser.capture":
        return await handleCapture(browser2, request.parameters, dir);
      case "browser.resize":
        return await handleResize(browser2, request.parameters, dir);
    }
  } catch (error) {
    if (error instanceof ActionError) return fail(error.message);
    const detail = error instanceof Error ? error.message : "unknown error";
    const hint = /not started|no attached session/i.test(detail) ? "No live window is open yet \u2014 call browser.open with a url first." : "Make sure Chrome is installed, then try again.";
    return fail(`The browser action failed: ${detail}. ${hint}`);
  }
}

// service/verify-routes.ts
import path6 from "node:path";
var MAX_BODY_BYTES = 1e6;
function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(text),
    "cache-control": "no-store"
  });
  res.end(text);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
async function readJson(req) {
  try {
    const parsed = JSON.parse(await readBody(req));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}
async function handleRun(req, res) {
  const body = await readJson(req);
  if (!body) {
    sendJson(res, 400, { error: "body must be JSON" });
    return;
  }
  const dir = body.dir;
  const url = body.url;
  if (typeof dir !== "string" || !path6.isAbsolute(dir)) {
    sendJson(res, 400, { error: "dir must be an absolute project path" });
    return;
  }
  if (typeof url !== "string" || url === "") {
    sendJson(res, 400, { error: "url is required" });
    return;
  }
  const report = await runVerification({
    dir,
    url,
    ...Array.isArray(body.viewports) ? { viewports: body.viewports.filter((v) => typeof v === "string") } : {}
  });
  sendJson(res, 200, report);
}
function handleReport(_req, res) {
  const report = getLastReport();
  if (!report) {
    sendJson(res, 404, { error: "no verification has run yet" });
    return;
  }
  sendJson(res, 200, report);
}
async function handleVerifyRequest(req, res) {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const pathname = url.pathname;
  if (pathname === "/verify" && req.method === "POST") {
    await handleRun(req, res);
    return true;
  }
  if (pathname === "/verify/report" && req.method === "GET") {
    handleReport(req, res);
    return true;
  }
  return false;
}

// service/harness-plugin.ts
import { promises as fs5 } from "node:fs";
import path7 from "node:path";

// shared/harness-text.ts
var CRAFT_RULES = {
  typography: [
    "- Build one modular scale (base \xD71.2, or \xD71.25 for airier layouts) and take every size from it.",
    "- Ship 6\u20138 sizes total; do not invent a new size per section.",
    "- Pair a distinct display face with a readable body face, and keep each role to one family.",
    "- Set body line-height near 1.5 and tighten only display text.",
    "- Keep body measure to roughly 45\u201375 characters per line.",
    "- Let weight, size and color carry hierarchy before you reach for decoration.",
    "- Use tabular numerals for tables, prices, timers and any aligned data.",
    "- Limit to two or three weights per family; resist faux-bold."
  ].join("\n"),
  color: [
    "- Keep 70\u201390% of the palette neutral; let structure do the work.",
    "- Spend one accent on 5\u201310% of a screen, used at most twice as a fill or emphasis.",
    "- Reserve semantic colors (success/warn/danger/info) for 0\u20135% and only for meaning.",
    "- Guarantee contrast of 4.5:1 for body text and 3:1 for large text and UI edges.",
    "- Never encode meaning in color alone; add an icon, label or weight change.",
    "- Derive surfaces from one neutral ramp rather than stacking unrelated grays.",
    "- Test the palette in both light and dark before committing.",
    "- Choose an accent that fits the direction; do not fall back to framework default."
  ].join("\n"),
  "anti-slop": [
    "- Do not use the default indigo/violet accent that every starter kit ships.",
    "- Do not build hero sections from two-stop gradient backgrounds.",
    "- Do not use emoji as icons; draw or pick a coherent icon set.",
    "- Do not invent metrics, testimonials or logos the brief did not supply.",
    '- Do not pad copy with filler like "lorem ipsum" or "seamless, powerful solution".',
    "- Avoid the generic card with a colored left border and a shadow.",
    "- Avoid stock centered-everything layouts with no alignment logic.",
    "- If a pattern feels like a template default, redesign it deliberately."
  ].join("\n"),
  states: [
    "- Render every data surface in all five states: Loading, Empty, Error, Populated, Edge.",
    "- Give Loading a skeleton or spinner, and a fallback message after ~15s.",
    "- Make Empty states explain what belongs here and how to fill it.",
    "- Make Error states say what failed and offer the next action.",
    "- Cover Edge cases: one item, many items, very long strings, missing fields.",
    "- Give forms explicit Untouched, Dirty and Submitted-pending states.",
    "- Disable or show progress on submit, then confirm success or surface failure.",
    "- Validate on blur, not on every keystroke."
  ].join("\n"),
  motion: [
    "- Animate only to explain change, never as decoration.",
    "- Keep UI transitions under 300ms; longer motion needs a reason.",
    "- Make motion interruptible: a new input cancels the running one.",
    "- Honor prefers-reduced-motion and provide a static equivalent.",
    "- Move along a clear path; avoid bounce and overshoot on functional elements.",
    "- Stagger lists slightly, but never block reading on animation completion."
  ].join("\n"),
  accessibility: [
    "- Give every interactive element a visible :focus-visible treatment.",
    "- Label every input; a placeholder is not a label.",
    "- Provide a complete keyboard path, with no focus traps.",
    "- Use semantic elements first and ARIA only to fill the gaps.",
    "- Keep contrast at AA: 4.5:1 body, 3:1 large text and UI.",
    "- Give images meaningful alt text, and decorative images an empty alt.",
    "- Announce dynamic updates through a live region."
  ].join("\n"),
  "laws-of-ux": [
    "- Hick: cut the number of simultaneous choices; group or defer the rest.",
    "- Miller: keep working sets near 7\xB12, and lean toward ~4 for menus.",
    "- Fitts: make primary targets large and near where the pointer already is.",
    "- von Restorff: style the one thing that must stand out; mute the rest.",
    "- Peak-End: invest in the strongest moment and the final step.",
    "- Tesler: absorb complexity in the product so the user faces less of it."
  ].join("\n"),
  responsive: [
    "- Define named breakpoints (e.g. sm/md/lg/xl) and reuse them everywhere.",
    "- Reflow, do not merely shrink: change column counts and stacking per breakpoint.",
    "- Test the awkward widths, not just the presets: 320, 375, 768, 1024, 1440.",
    "- Keep tap targets at least 44px on touch layouts.",
    "- Clamp fluid type and spacing so extremes stay legible.",
    "- Never let horizontal scroll appear on a normal content page."
  ].join("\n"),
  verification: [
    "- Never call a change done until you have seen it render at every breakpoint: mobile 390, desktop 1280, wide 2048.",
    "- Also check the awkward widths where relevant: 320, 375, 1024, 1440.",
    "- Horizontal scroll on a normal content page is a defect, not a style choice.",
    "- Fix the cheapest deterministic failure first; never restyle to hide an overflow or a contrast error.",
    "- Use only tokens from tokens.css / DESIGN.md; a hardcoded colour or spacing value is a defect.",
    "- Keep tap targets at least 24px (44px on touch), headings in order, every control labelled.",
    "- Done means the gates pass at every breakpoint \u2014 not that it looks right at one width."
  ].join("\n")
};
var ALL_CRAFT_RULE_IDS = [
  "typography",
  "color",
  "anti-slop",
  "states",
  "motion",
  "accessibility",
  "laws-of-ux",
  "responsive",
  "verification"
];
function defaultCraft(ids) {
  const chosen = ids && ids.length > 0 ? ids : ALL_CRAFT_RULE_IDS;
  return chosen.map((id) => `### ${id}
${CRAFT_RULES[id]}`).join("\n\n");
}
var VERIFY_PROTOCOL = [
  "Before editing, state the change's acceptance criteria in one line.",
  "After each edit verify in this order (cheap/deterministic first): overflow \u2192 design tokens \u2192 accessibility \u2192 semantics \u2192 layout. Use the browser tool: `browser.capture` / `browser.open` returns a `verification` block covering every viewport (mobile, tablet, desktop, wide) with each gate's status.",
  "Fix every P0 before starting a new gate tier; re-run the same gates after a fix.",
  "Budget: at most 5 fix/verify iterations OR 10 minutes, whichever comes first. Then stop and report.",
  "Never mark the work done while any P0 remains. Report the gate table and state the breakpoints you checked.",
  "Oscillation: if a finding you already fixed reappears, or a gate flips across two iterations, STOP and hand back with both states. Do not keep looping.",
  "The 0\u201310 critique is advisory only; never treat it as pass/fail and never optimise for it."
].join("\n");
var IDENTITY = "You are an expert designer. HTML is your tool, not your medium: the medium is the intent, the system and the craft of the page.";
var DESIGN_AUTHORITY = [
  "DESIGN.md and tokens.css (when present) are the project design system and are",
  "authoritative: follow them over any conflicting instinct, and do not invent colours,",
  "spacing or type values outside them. A hardcoded value that a token already covers is a defect."
].join(" ");
var DESIGN_WORKSPACE_NOTE = [
  "The selected registered design project itself is the workspace for new design sessions.",
  "Keep the current session directory: do not create a per-chat child workspace or move the session automatically.",
  "Inspect and reuse the existing app, design system and .design-studio.json; do not assume the workspace is empty or scaffold over existing work.",
  "Existing sessions already in legacy child directories stay there unless the user explicitly requests a move."
].join(" ");
var VERIFY_MANDATE = [
  "Verify at every stage, not only at the end: after each edit, before showing work, and before calling",
  "anything done. Run the cheap deterministic gates first and never claim success without having seen the",
  "page render at the breakpoints the protocol names."
].join(" ");
function harnessRulesText() {
  return [
    IDENTITY,
    "",
    "# Design Studio harness",
    "This session is a Design Studio session. These rules are mandatory for every edit and every reply.",
    "",
    "## Design system authority",
    DESIGN_AUTHORITY,
    "",
    "## Craft rules",
    defaultCraft(),
    "",
    "## Verification protocol",
    VERIFY_PROTOCOL,
    "",
    "## Mandate",
    VERIFY_MANDATE
  ].join("\n");
}

// service/harness-plugin.ts
var HARNESS_PLUGIN_REL = ".opencode/plugin/design-studio-harness.ts";
var HARNESS_PLUGIN_ID = "design-studio-harness";
var HARNESS_MARKER = "design-studio harness \u2014 generated, do not edit";
var EDIT_TOOLS = ["edit", "write", "patch", "multiedit", "apply_patch"];
function harnessPluginSource() {
  const rules = harnessRulesText();
  const nudge = [
    "A file was just edited in this Design Studio session.",
    "Before continuing: verify the change with the browser tool at every viewport (mobile, tablet, desktop, wide),",
    "fix every P0 before starting a new gate tier, and do not mark the work done while any P0 remains.",
    "If a finding you already fixed reappears, stop and hand back with both states instead of looping.",
    VERIFY_MANDATE
  ].join(" ");
  const line = (value) => JSON.stringify(value);
  return [
    `// ${HARNESS_MARKER}`,
    "//",
    "// Generated by the OpenChamber Design Studio extension. Rewritten in place when a",
    "// design session starts; any manual edit is lost on the next write. Change the",
    "// rules in the extension (shared/harness-text.ts), not here.",
    "//",
    "// Side effects of this file living in the project:",
    "//  \xB7 OpenCode discovers `.opencode/plugin/*.ts` and loads it into every session",
    "//    for this project automatically.",
    "//  \xB7 It imports nothing, so it adds no",
    "//    dependency and needs no `node_modules` install. If `.opencode/` is not",
    "//    tracked, add it to `.gitignore`.",
    "//",
    "// What it does:",
    "//  \xB7 Pushes the Design Studio harness rules into every model turn (identity,",
    "//    design-system authority, craft rules, verification protocol, mandate).",
    "//  \xB7 Flags the session after a completed edit/write/patch so the next turn",
    "//    carries an explicit verification nudge.",
    "//  \xB7 Preserves the selected project workspace; never creates or moves sessions.",
    "",
    `const HARNESS_RULES = ${line(rules)}`,
    "",
    `const VERIFY_NUDGE = ${line(nudge)}`,
    "",
    `const WORKSPACE_NOTE = ${line(DESIGN_WORKSPACE_NOTE)}`,
    "",
    `const EDIT_TOOLS = new Set(${JSON.stringify(EDIT_TOOLS)})`,
    "",
    "export default {",
    `  id: ${line(HARNESS_PLUGIN_ID)},`,
    "  async setup(ctx) {",
    "    // Sessions share one plugin instance, so track nudges per session id.",
    "    const pending = new Set()",
    "",
    '    await ctx.session.hook("context", async (event) => {',
    '      event.system.push({ type: "text", text: WORKSPACE_NOTE })',
    '      event.system.push({ type: "text", text: HARNESS_RULES })',
    "      if (pending.has(event.sessionID)) {",
    "        pending.delete(event.sessionID)",
    '        event.system.push({ type: "text", text: VERIFY_NUDGE })',
    "      }",
    "    })",
    "",
    '    await ctx.tool.hook("execute.after", (event) => {',
    '      if (event.status !== "completed") return',
    "      if (!EDIT_TOOLS.has(event.tool)) return",
    "      pending.add(event.sessionID)",
    "    })",
    "  },",
    "}",
    ""
  ].join("\n");
}
async function writeHarnessPlugin(projectDir2) {
  const rootAbs = path7.resolve(projectDir2);
  const abs = path7.resolve(rootAbs, HARNESS_PLUGIN_REL);
  if (abs !== rootAbs && !abs.startsWith(rootAbs + path7.sep)) {
    throw new Error("path outside project");
  }
  const source = harnessPluginSource();
  let existing = null;
  try {
    existing = await fs5.readFile(abs, "utf8");
  } catch {
    existing = null;
  }
  if (existing !== null) {
    if (!existing.includes(HARNESS_MARKER)) {
      throw new Error(`refusing to overwrite ${HARNESS_PLUGIN_REL}: it was not generated by Design Studio`);
    }
    if (existing === source) {
      return { path: HARNESS_PLUGIN_REL, created: false, updated: false, changed: false };
    }
    await fs5.writeFile(abs, source, "utf8");
    return { path: HARNESS_PLUGIN_REL, created: false, updated: true, changed: true };
  }
  await fs5.mkdir(path7.dirname(abs), { recursive: true });
  await fs5.writeFile(abs, source, "utf8");
  return { path: HARNESS_PLUGIN_REL, created: true, updated: false, changed: true };
}

// service/project-files.ts
import { promises as fs6, constants } from "node:fs";
import path8 from "node:path";
async function resolveReferencePath(dir, input) {
  const controls = /[\u0000-\u001f\u007f-\u009f]/;
  if (typeof dir !== "string" || !path8.isAbsolute(dir) || controls.test(dir)) {
    throw new Error("Source directory must be a valid absolute project path. Select a project and try again.");
  }
  if (typeof input !== "string" || input.trim() === "") {
    throw new Error("Paste a non-empty accessible file path.");
  }
  if (controls.test(input)) {
    throw new Error("File paths cannot contain control characters. Paste a valid file path.");
  }
  let sourceDirectory;
  try {
    sourceDirectory = await fs6.realpath(dir);
    if (!(await fs6.stat(sourceDirectory)).isDirectory()) throw new Error("not a directory");
  } catch {
    throw new Error("Source project directory is not accessible. Select an accessible project and try again.");
  }
  const absolute = path8.isAbsolute(input);
  const inside = (target) => {
    const relative = path8.relative(sourceDirectory, target);
    return relative !== ".." && !relative.startsWith(".." + path8.sep) && !path8.isAbsolute(relative);
  };
  const candidate = path8.resolve(sourceDirectory, input);
  if (!absolute && !inside(candidate)) {
    throw new Error("Relative file path is outside the source project. Paste its absolute path to select an external file.");
  }
  let canonical;
  try {
    canonical = await fs6.realpath(candidate);
  } catch {
    throw new Error("File not found or not accessible. Check the pasted path and its permissions.");
  }
  if (!absolute && !inside(canonical)) {
    throw new Error("Relative file path resolves outside the source project through a symlink. Paste its absolute path to select an external file.");
  }
  try {
    const stat = await fs6.stat(canonical);
    if (!stat.isFile()) throw new Error("not a regular file");
  } catch (error) {
    if (error instanceof Error && error.message === "not a regular file") {
      throw new Error("Reference must be a regular file, not a directory or special file. Paste a file path.");
    }
    throw new Error("File is not accessible. Check the pasted path and its permissions.");
  }
  try {
    await fs6.access(canonical, constants.R_OK);
  } catch {
    throw new Error("File is not readable. Check its permissions or paste another file path.");
  }
  return { path: canonical, sourceDirectory };
}
var SKIP_DIRS2 = /* @__PURE__ */ new Set(["node_modules", "dist", "build"]);
var DEFAULT_FILE_LIMIT = 500;
var MAX_FILE_LIMIT = 2e3;
function shouldSkipDir(name) {
  return name.startsWith(".") || SKIP_DIRS2.has(name);
}
function isInside(root, target) {
  return target === root || target.startsWith(root + path8.sep);
}
async function listProjectFiles(dir, limit) {
  if (typeof dir !== "string" || !path8.isAbsolute(dir)) {
    throw new Error("dir must be an absolute path");
  }
  if (limit !== void 0 && (!Number.isInteger(limit) || limit < 1)) {
    throw new Error("limit must be a positive integer");
  }
  const cap = Math.min(limit ?? DEFAULT_FILE_LIMIT, MAX_FILE_LIMIT);
  const rootAbs = path8.resolve(dir);
  const rootReal = await fs6.realpath(rootAbs);
  const found = [];
  const visitedDirs = /* @__PURE__ */ new Set([rootReal]);
  const walk = async (absDir) => {
    if (found.length >= cap) return;
    let entries;
    try {
      entries = await fs6.readdir(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const entry of entries) {
      if (found.length >= cap) return;
      const abs = path8.join(absDir, entry.name);
      if (entry.isSymbolicLink()) {
        let real;
        try {
          real = await fs6.realpath(abs);
        } catch {
          continue;
        }
        if (!isInside(rootReal, real)) continue;
        let stat;
        try {
          stat = await fs6.stat(real);
        } catch {
          continue;
        }
        if (stat.isDirectory()) {
          if (shouldSkipDir(entry.name) || visitedDirs.has(real)) continue;
          visitedDirs.add(real);
          await walk(abs);
        } else if (stat.isFile()) {
          found.push(path8.relative(rootAbs, abs));
        }
        continue;
      }
      if (entry.isDirectory()) {
        if (shouldSkipDir(entry.name)) continue;
        await walk(abs);
      } else if (entry.isFile()) {
        found.push(path8.relative(rootAbs, abs));
      }
    }
  };
  await walk(rootAbs);
  return found.map((rel) => rel.split(path8.sep).join("/")).sort((a, b) => a < b ? -1 : a > b ? 1 : 0).slice(0, cap);
}

// service/scaffold.ts
import { spawn as spawn3 } from "node:child_process";
import { promises as fs7 } from "node:fs";
import path9 from "node:path";

// shared/design-systems.ts
var DESIGN_SYSTEMS = [
  {
    id: "apple",
    name: "Apple",
    category: "Media & Consumer",
    description: "Consumer electronics. Premium white space, SF Pro, cinematic imagery.",
    tokens: {
      "--bg": "#ffffff",
      "--surface": "#f5f5f7",
      "--surface-warm": "#fbfbfd",
      "--fg": "#1d1d1f",
      "--fg-2": "#424245",
      "--muted": "#6e6e73",
      "--meta": "#86868b",
      "--border": "#d2d2d7",
      "--border-soft": "#e8e8ed",
      "--accent": "#0071e3",
      "--accent-on": "#ffffff",
      "--accent-hover": "#0077ed",
      "--accent-active": "#0066cc",
      "--success": "#16a34a",
      "--warn": "#eab308",
      "--danger": "#dc2626",
      "--font-display": '"SF Pro Display", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif',
      "--font-body": '"SF Pro Text", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif',
      "--font-mono": '"SF Mono", ui-monospace, "JetBrains Mono", Menlo, Monaco, Consolas, monospace',
      "--text-xs": "12px",
      "--text-sm": "14px",
      "--text-base": "17px",
      "--text-lg": "21px",
      "--text-xl": "28px",
      "--text-2xl": "40px",
      "--text-3xl": "56px",
      "--text-4xl": "80px",
      "--leading-body": "1.47",
      "--leading-tight": "1.05",
      "--tracking-display": "-0.015em",
      "--space-1": "4px",
      "--space-2": "8px",
      "--space-3": "12px",
      "--space-4": "16px",
      "--space-5": "20px",
      "--space-6": "24px",
      "--space-8": "32px",
      "--space-12": "48px",
      "--section-y-desktop": "100px",
      "--section-y-tablet": "64px",
      "--section-y-phone": "40px",
      "--radius-sm": "8px",
      "--radius-md": "12px",
      "--radius-lg": "18px",
      "--radius-pill": "980px",
      "--elev-flat": "none",
      "--elev-ring": "0 0 0 1px var(--border)",
      "--elev-raised": "0 12px 32px rgba(0, 0, 0, 0.08)",
      "--focus-ring": "0 0 0 4px color-mix(in oklab, var(--accent), transparent 65%)",
      "--motion-fast": "150ms",
      "--motion-base": "220ms",
      "--ease-standard": "cubic-bezier(0.28, 0, 0.22, 1)",
      "--container-max": "1024px",
      "--container-gutter-desktop": "22px",
      "--container-gutter-tablet": "18px",
      "--container-gutter-phone": "16px"
    },
    designMd: "# Design System Inspired by Apple\n\n> Category: Media & Consumer\n> Consumer electronics. Premium white space, SF Pro, cinematic imagery.\n\n## 1. Visual Theme & Atmosphere\n\nApple's web language is a precision editorial system that alternates between gallery-like calm and retail-density information blocks. The visual tone stays restrained: broad neutral canvases, quiet chrome, and product imagery given almost all of the expressive weight. The interface is engineered to disappear so hardware, materials, and finish options become the narrative foreground.\n\nAcross the five analyzed pages, the rhythm is consistent but not monolithic. Marketing surfaces (homepage and Environment) use cinematic black-and-light chaptering, while commerce surfaces (Store and Shop flows) introduce tighter spacing, more utility controls, and denser card stacks without breaking the core brand grammar. The result is one system with two gears: showcase mode and transaction mode."
  },
  {
    id: "linear-app",
    name: "Linear",
    category: "Productivity & SaaS",
    description: "Project management. Ultra-minimal, precise, purple accent.",
    tokens: {
      "--bg": "#08090a",
      "--surface": "#191a1b",
      "--surface-warm": "var(--surface)",
      "--fg": "#f7f8f8",
      "--fg-2": "#d0d6e0",
      "--muted": "#8a8f98",
      "--meta": "#62666d",
      "--border": "rgba(255, 255, 255, 0.08)",
      "--border-soft": "rgba(255, 255, 255, 0.05)",
      "--accent": "#5e6ad2",
      "--accent-on": "#ffffff",
      "--accent-hover": "#828fff",
      "--accent-active": "#4752c4",
      "--success": "#27a644",
      "--warn": "#eab308",
      "--danger": "#dc2626",
      "--font-display": '"Inter Variable", "Inter", "SF Pro Display", -apple-system, system-ui, "Segoe UI", Roboto, sans-serif',
      "--font-body": '"Inter Variable", "Inter", "SF Pro Display", -apple-system, system-ui, "Segoe UI", Roboto, sans-serif',
      "--font-mono": '"Berkeley Mono", ui-monospace, "SF Mono", Menlo, Monaco, Consolas, monospace',
      "--text-xs": "12px",
      "--text-sm": "14px",
      "--text-base": "16px",
      "--text-lg": "18px",
      "--text-xl": "24px",
      "--text-2xl": "32px",
      "--text-3xl": "48px",
      "--text-4xl": "72px",
      "--leading-body": "1.5",
      "--leading-tight": "1.00",
      "--tracking-display": "-0.022em",
      "--space-1": "4px",
      "--space-2": "8px",
      "--space-3": "12px",
      "--space-4": "16px",
      "--space-5": "20px",
      "--space-6": "24px",
      "--space-8": "32px",
      "--space-12": "48px",
      "--section-y-desktop": "80px",
      "--section-y-tablet": "48px",
      "--section-y-phone": "32px",
      "--radius-sm": "6px",
      "--radius-md": "8px",
      "--radius-lg": "12px",
      "--radius-pill": "9999px",
      "--elev-flat": "none",
      "--elev-ring": "0 0 0 1px var(--border)",
      "--elev-raised": "rgba(0, 0, 0, 0.4) 0px 2px 4px, 0 0 0 1px rgba(255, 255, 255, 0.05)",
      "--focus-ring": "0 0 0 2px color-mix(in oklab, var(--accent), transparent 30%), 0 4px 12px rgba(0, 0, 0, 0.1)",
      "--motion-fast": "150ms",
      "--motion-base": "200ms",
      "--ease-standard": "cubic-bezier(0.2, 0, 0, 1)",
      "--container-max": "1200px",
      "--container-gutter-desktop": "24px",
      "--container-gutter-tablet": "16px",
      "--container-gutter-phone": "12px"
    },
    designMd: "# Design System Inspired by Linear\n\n> Category: Productivity & SaaS\n> Project management. Ultra-minimal, precise, purple accent.\n\n## 1. Visual Theme & Atmosphere\n\nLinear's website is a masterclass in dark-mode-first product design \u2014 a near-black canvas (`#08090a`) where content emerges from darkness like starlight. The overall impression is one of extreme precision engineering: every element exists in a carefully calibrated hierarchy of luminance, from barely-visible borders (`rgba(255,255,255,0.05)`) to soft, luminous text (`#f7f8f8`). This is not a dark theme applied to a light design \u2014 it is darkness as the native medium, where information density is managed through subtle gradations of white opacity rather than color variation."
  },
  {
    id: "stripe",
    name: "Stripe",
    category: "Fintech & Crypto",
    description: "Payment infrastructure. Signature purple gradients, weight-300 elegance.",
    tokens: {
      "--bg": "#ffffff",
      "--surface": "#ffffff",
      "--surface-warm": "#f6f9fc",
      "--fg": "#061b31",
      "--fg-2": "#273951",
      "--muted": "#64748d",
      "--meta": "var(--muted)",
      "--border": "#e5edf5",
      "--border-soft": "var(--border)",
      "--accent": "#533afd",
      "--accent-on": "#ffffff",
      "--accent-hover": "#4434d4",
      "--accent-active": "#2e2b8c",
      "--success": "#15be53",
      "--warn": "#9b6829",
      "--danger": "#ea2261",
      "--font-display": '"sohne-var", "S\xF6hne", "Sohne", "SF Pro Display", -apple-system, BlinkMacSystemFont, system-ui, "Helvetica Neue", Arial, sans-serif',
      "--font-body": '"sohne-var", "S\xF6hne", "Sohne", "SF Pro Display", -apple-system, BlinkMacSystemFont, system-ui, "Helvetica Neue", Arial, sans-serif',
      "--font-mono": '"SourceCodePro", "Source Code Pro", ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Monaco, Consolas, monospace',
      "--text-xs": "12px",
      "--text-sm": "14px",
      "--text-base": "16px",
      "--text-lg": "18px",
      "--text-xl": "22px",
      "--text-2xl": "32px",
      "--text-3xl": "48px",
      "--text-4xl": "56px",
      "--leading-body": "1.40",
      "--leading-tight": "1.10",
      "--tracking-display": "-0.02em",
      "--space-1": "4px",
      "--space-2": "8px",
      "--space-3": "12px",
      "--space-4": "16px",
      "--space-5": "20px",
      "--space-6": "24px",
      "--space-8": "32px",
      "--space-12": "48px",
      "--section-y-desktop": "96px",
      "--section-y-tablet": "64px",
      "--section-y-phone": "40px",
      "--radius-sm": "4px",
      "--radius-md": "6px",
      "--radius-lg": "8px",
      "--radius-pill": "9999px",
      "--elev-flat": "none",
      "--elev-ring": "0 0 0 1px var(--border)",
      "--elev-raised": "rgba(50, 50, 93, 0.25) 0px 30px 45px -30px, rgba(0, 0, 0, 0.10) 0px 18px 36px -18px",
      "--focus-ring": "0 0 0 2px var(--accent), 0 0 0 5px color-mix(in oklab, var(--accent), transparent 75%)",
      "--motion-fast": "150ms",
      "--motion-base": "200ms",
      "--ease-standard": "cubic-bezier(0.2, 0, 0, 1)",
      "--container-max": "1080px",
      "--container-gutter-desktop": "32px",
      "--container-gutter-tablet": "24px",
      "--container-gutter-phone": "16px"
    },
    designMd: "# Design System Inspired by Stripe\n\n> Category: Fintech & Crypto\n> Payment infrastructure. Signature purple gradients, weight-300 elegance.\n\n## 1. Visual Theme & Atmosphere\n\nStripe's website is the gold standard of fintech design -- a system that manages to feel simultaneously technical and luxurious, precise and warm. The page opens on a clean white canvas (`#ffffff`) with deep navy headings (`#061b31`) and a signature purple (`#533afd`) that functions as both brand anchor and interactive accent. This isn't the cold, clinical purple of enterprise software; it's a rich, saturated violet that reads as confident and premium. The overall impression is of a financial institution redesigned by a world-class type foundry."
  },
  {
    id: "vercel",
    name: "Vercel",
    category: "Developer Tools",
    description: "Frontend deployment. Black and white precision, Geist font.",
    tokens: {
      "--bg": "#ffffff",
      "--surface": "#ffffff",
      "--surface-warm": "var(--surface)",
      "--fg": "#171717",
      "--fg-2": "#4d4d4d",
      "--muted": "#666666",
      "--meta": "#808080",
      "--border": "rgba(0, 0, 0, 0.08)",
      "--border-soft": "rgba(0, 0, 0, 0.04)",
      "--accent": "#0070f3",
      "--accent-on": "#ffffff",
      "--accent-hover": "color-mix(in oklab, var(--accent), black 8%)",
      "--accent-active": "color-mix(in oklab, var(--accent), black 14%)",
      "--success": "#16a34a",
      "--warn": "#eab308",
      "--danger": "#dc2626",
      "--font-display": '"Geist", "Geist Sans", -apple-system, "Segoe UI", Arial, sans-serif',
      "--font-body": '"Geist", "Geist Sans", -apple-system, "Segoe UI", Arial, sans-serif',
      "--font-mono": '"Geist Mono", ui-monospace, "SF Mono", "Roboto Mono", Menlo, Monaco, "Liberation Mono", "DejaVu Sans Mono", "Courier New", monospace',
      "--text-xs": "12px",
      "--text-sm": "14px",
      "--text-base": "16px",
      "--text-lg": "20px",
      "--text-xl": "24px",
      "--text-2xl": "32px",
      "--text-3xl": "40px",
      "--text-4xl": "48px",
      "--leading-body": "1.5",
      "--leading-tight": "1.1",
      "--tracking-display": "-0.05em",
      "--space-1": "4px",
      "--space-2": "8px",
      "--space-3": "12px",
      "--space-4": "16px",
      "--space-5": "20px",
      "--space-6": "24px",
      "--space-8": "32px",
      "--space-12": "48px",
      "--section-y-desktop": "96px",
      "--section-y-tablet": "64px",
      "--section-y-phone": "48px",
      "--radius-sm": "6px",
      "--radius-md": "8px",
      "--radius-lg": "12px",
      "--radius-pill": "9999px",
      "--elev-flat": "none",
      "--elev-ring": "0 0 0 1px var(--border)",
      "--elev-raised": "0 0 0 1px rgba(0, 0, 0, 0.08), 0 2px 2px rgba(0, 0, 0, 0.04), 0 8px 8px -8px rgba(0, 0, 0, 0.04), 0 0 0 1px #fafafa",
      "--focus-ring": "0 0 0 2px var(--accent)",
      "--motion-fast": "150ms",
      "--motion-base": "200ms",
      "--ease-standard": "cubic-bezier(0.2, 0, 0, 1)",
      "--container-max": "1200px",
      "--container-gutter-desktop": "24px",
      "--container-gutter-tablet": "16px",
      "--container-gutter-phone": "12px"
    },
    designMd: "# Design System Inspired by Vercel\n\n> Category: Developer Tools\n> Frontend deployment. Black and white precision, Geist font.\n\n## 1. Visual Theme & Atmosphere\n\nVercel's website is the visual thesis of developer infrastructure made invisible \u2014 a design system so restrained it borders on philosophical. The page is overwhelmingly white (`#ffffff`) with near-black (`#171717`) text, creating a gallery-like emptiness where every element earns its pixel. This isn't minimalism as decoration; it's minimalism as engineering principle. The Geist design system treats the interface like a compiler treats code \u2014 every unnecessary token is stripped away until only structure remains."
  },
  {
    id: "notion",
    name: "Notion",
    category: "Productivity & SaaS",
    description: "All-in-one workspace. Warm minimalism, serif headings, soft surfaces.",
    tokens: {
      "--bg": "#ffffff",
      "--surface": "#f6f5f4",
      "--surface-warm": "var(--surface)",
      "--fg": "rgba(0, 0, 0, 0.95)",
      "--fg-2": "#31302e",
      "--muted": "#615d59",
      "--meta": "#a39e98",
      "--border": "rgba(0, 0, 0, 0.1)",
      "--border-soft": "rgba(0, 0, 0, 0.06)",
      "--accent": "#0075de",
      "--accent-on": "#ffffff",
      "--accent-hover": "#005bab",
      "--accent-active": "color-mix(in oklab, var(--accent), black 14%)",
      "--success": "#1aae39",
      "--warn": "#dd5b00",
      "--danger": "#dc2626",
      "--font-display": '"NotionInter", "Inter", -apple-system, system-ui, "Segoe UI", Helvetica, Arial, sans-serif',
      "--font-body": '"NotionInter", "Inter", -apple-system, system-ui, "Segoe UI", Helvetica, Arial, sans-serif',
      "--font-mono": 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Monaco, Consolas, monospace',
      "--text-xs": "12px",
      "--text-sm": "14px",
      "--text-base": "16px",
      "--text-lg": "20px",
      "--text-xl": "26px",
      "--text-2xl": "40px",
      "--text-3xl": "48px",
      "--text-4xl": "64px",
      "--leading-body": "1.5",
      "--leading-tight": "1.00",
      "--tracking-display": "-0.033em",
      "--space-1": "4px",
      "--space-2": "8px",
      "--space-3": "12px",
      "--space-4": "16px",
      "--space-5": "20px",
      "--space-6": "24px",
      "--space-8": "32px",
      "--space-12": "48px",
      "--section-y-desktop": "80px",
      "--section-y-tablet": "48px",
      "--section-y-phone": "32px",
      "--radius-sm": "4px",
      "--radius-md": "8px",
      "--radius-lg": "12px",
      "--radius-pill": "9999px",
      "--elev-flat": "none",
      "--elev-ring": "0 0 0 1px var(--border)",
      "--elev-raised": "rgba(0, 0, 0, 0.04) 0px 4px 18px, rgba(0, 0, 0, 0.027) 0px 2px 7.85px, rgba(0, 0, 0, 0.02) 0px 0.8px 2.93px, rgba(0, 0, 0, 0.01) 0px 0.175px 1.04px",
      "--focus-ring": "0 0 0 3px rgba(9, 127, 232, 0.3)",
      "--motion-fast": "150ms",
      "--motion-base": "200ms",
      "--ease-standard": "cubic-bezier(0.2, 0, 0, 1)",
      "--container-max": "1200px",
      "--container-gutter-desktop": "24px",
      "--container-gutter-tablet": "16px",
      "--container-gutter-phone": "12px"
    },
    designMd: "# Design System Inspired by Notion\n\n> Category: Productivity & SaaS\n> All-in-one workspace. Warm minimalism, serif headings, soft surfaces.\n\n## 1. Visual Theme & Atmosphere\n\nNotion's website embodies the philosophy of the tool itself: a blank canvas that gets out of your way. The design system is built on warm neutrals rather than cold grays, creating a distinctly approachable minimalism that feels like quality paper rather than sterile glass. The page canvas is pure white (`#ffffff`) but the text isn't pure black -- it's a warm near-black (`rgba(0,0,0,0.95)`) that softens the reading experience imperceptibly. The warm gray scale (`#f6f5f4`, `#31302e`, `#615d59`, `#a39e98`) carries subtle yellow-brown undertones, giving the interface a tactile, almost analog warmth."
  },
  {
    id: "shadcn",
    name: "Shadcn",
    category: "Modern & Minimal",
    description: "Shadcn/ui-inspired design with minimal, clean components, monochrome palette, and utility-first patterns.",
    tokens: {
      "--bg": "#ffffff",
      "--surface": "#ffffff",
      "--surface-warm": "var(--surface)",
      "--fg": "#111827",
      "--fg-2": "var(--fg)",
      "--muted": "#64748b",
      "--meta": "var(--muted)",
      "--border": "#e5e7eb",
      "--border-soft": "var(--border)",
      "--accent": "#000000",
      "--accent-on": "#ffffff",
      "--accent-hover": "color-mix(in oklab, var(--accent), white 10%)",
      "--accent-active": "color-mix(in oklab, var(--accent), white 18%)",
      "--success": "#16a34a",
      "--warn": "#d97706",
      "--danger": "#dc2626",
      "--font-display": '"Geist", "Geist Sans", -apple-system, system-ui, "Segoe UI", Arial, sans-serif',
      "--font-body": '"Geist", "Geist Sans", -apple-system, system-ui, "Segoe UI", Arial, sans-serif',
      "--font-mono": '"Fira Code", ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Monaco, Consolas, monospace',
      "--text-xs": "12px",
      "--text-sm": "14px",
      "--text-base": "16px",
      "--text-lg": "20px",
      "--text-xl": "24px",
      "--text-2xl": "32px",
      "--text-3xl": "40px",
      "--text-4xl": "48px",
      "--leading-body": "1.5",
      "--leading-tight": "1.2",
      "--tracking-display": "-0.02em",
      "--space-1": "4px",
      "--space-2": "8px",
      "--space-3": "12px",
      "--space-4": "16px",
      "--space-5": "20px",
      "--space-6": "24px",
      "--space-8": "32px",
      "--space-12": "48px",
      "--section-y-desktop": "96px",
      "--section-y-tablet": "64px",
      "--section-y-phone": "48px",
      "--radius-sm": "6px",
      "--radius-md": "8px",
      "--radius-lg": "12px",
      "--radius-pill": "9999px",
      "--elev-flat": "none",
      "--elev-ring": "0 0 0 1px var(--border)",
      "--elev-raised": "0 1px 2px 0 color-mix(in oklab, var(--fg), transparent 92%), 0 1px 3px 0 color-mix(in oklab, var(--fg), transparent 88%)",
      "--focus-ring": "0 0 0 2px var(--bg), 0 0 0 4px var(--accent)",
      "--motion-fast": "150ms",
      "--motion-base": "200ms",
      "--ease-standard": "cubic-bezier(0.2, 0, 0, 1)",
      "--container-max": "1280px",
      "--container-gutter-desktop": "24px",
      "--container-gutter-tablet": "16px",
      "--container-gutter-phone": "16px"
    },
    designMd: "# Design System Inspired by Shadcn\n\n> Category: Modern & Minimal\n> Shadcn/ui-inspired design with minimal, clean components, monochrome palette, and utility-first patterns.\n\n## 1. Visual Theme & Atmosphere\n\nShadcn/ui-inspired design with minimal, clean components, monochrome palette, and utility-first patterns.\n\n- **Visual style:** minimal, clean\n- **Color stance:** primary, secondary\n- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.\n\n## 2. Color\n\n- **Primary:** `#000000` \u2014 Token from style foundations.\n- **Secondary:** `#111111` \u2014 Token from style foundations.\n- **Success:** `#16A34A` \u2014 Token from style foundations.\n- **Warning:** `#D97706` \u2014 Token from style foundations.\n- **Danger:** `#DC2626` \u2014 Token from style foundations.\n- **Surface:** `#FFFFFF` \u2014 Token from style foundations.\n- **Text:** `#111827` \u2014 Token from style foundations.\n- **Neutral:** `#FFFFFF` \u2014 Derived from the surface token for official format compatibility.\n\n- Favor Primary (#000000) for CTA emphasis.\n- Use Surface (#FFFFFF) for large backgrounds and cards.\n- Keep body copy on Text (#111827) for legibility.\n\n## 3. Typography"
  },
  {
    id: "material",
    name: "Material",
    category: "Professional & Corporate",
    description: "Google's Material Design with layered surfaces, dynamic theming, built-in motion, and responsive cross-platform patterns.",
    tokens: {
      "--bg": "#f8fafd",
      "--surface": "#ffffff",
      "--surface-warm": "#e8f0fe",
      "--fg": "#202124",
      "--fg-2": "#3c4043",
      "--muted": "#5f6368",
      "--meta": "#1a73e8",
      "--border": "#dadce0",
      "--border-soft": "#edf0f2",
      "--accent": "#1a73e8",
      "--accent-on": "#ffffff",
      "--accent-hover": "color-mix(in oklab, var(--accent), black 8%)",
      "--accent-active": "color-mix(in oklab, var(--accent), black 14%)",
      "--success": "#188038",
      "--warn": "#f9ab00",
      "--danger": "#d93025",
      "--font-display": '"Google Sans", Roboto, Arial, sans-serif',
      "--font-body": "Roboto, Arial, sans-serif",
      "--font-mono": '"Roboto Mono", ui-monospace, Menlo, monospace',
      "--text-xs": "12px",
      "--text-sm": "14px",
      "--text-base": "16px",
      "--text-lg": "18px",
      "--text-xl": "24px",
      "--text-2xl": "32px",
      "--text-3xl": "48px",
      "--text-4xl": "64px",
      "--leading-body": "1.5",
      "--leading-tight": "1.12",
      "--tracking-display": "0",
      "--space-1": "4px",
      "--space-2": "8px",
      "--space-3": "12px",
      "--space-4": "16px",
      "--space-5": "20px",
      "--space-6": "24px",
      "--space-8": "32px",
      "--space-12": "48px",
      "--section-y-desktop": "96px",
      "--section-y-tablet": "68px",
      "--section-y-phone": "48px",
      "--radius-sm": "4px",
      "--radius-md": "12px",
      "--radius-lg": "24px",
      "--radius-pill": "9999px",
      "--elev-flat": "none",
      "--elev-ring": "0 0 0 1px var(--border)",
      "--elev-raised": "0 3px 8px rgba(60, 64, 67, 0.18)",
      "--focus-ring": "0 0 0 4px rgba(26, 115, 232, 0.24)",
      "--motion-fast": "150ms",
      "--motion-base": "250ms",
      "--ease-standard": "cubic-bezier(0.2, 0, 0, 1)",
      "--container-max": "1200px",
      "--container-gutter-desktop": "36px",
      "--container-gutter-tablet": "24px",
      "--container-gutter-phone": "16px"
    },
    designMd: "# Design System Inspired by Material\n\n> Category: Professional & Corporate\n> Google's Material Design with layered surfaces, dynamic theming, built-in motion, and responsive cross-platform patterns.\n\n## 1. Visual Theme & Atmosphere\n\nGoogle's Material Design with layered surfaces, dynamic theming, built-in motion, and responsive cross-platform patterns.\n\n- **Visual style:** modern, minimal, clean\n- **Color stance:** primary, secondary, neutral, success, warning, danger\n- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.\n\n## 2. Color\n\n- **Primary:** `#6442D6` \u2014 Token from style foundations.\n- **Secondary:** `#C8B3FD` \u2014 Token from style foundations.\n- **Success:** `#16A34A` \u2014 Token from style foundations.\n- **Warning:** `#D97706` \u2014 Token from style foundations.\n- **Danger:** `#DC2626` \u2014 Token from style foundations.\n- **Surface:** `#FFFFFF` \u2014 Token from style foundations.\n- **Text:** `#111827` \u2014 Token from style foundations.\n- **Neutral:** `#FFFFFF` \u2014 Derived from the surface token for official format compatibility.\n\n- Favor Primary (#6442D6) for CTA emphasis.\n- Use Surface (#FFFFFF) for large backgrounds and cards."
  },
  {
    id: "github",
    name: "GitHub",
    category: "Developer Tools",
    description: "Code-forward platform. Functional density, blue-on-white precision, Primer foundations.",
    tokens: {
      "--bg": "#ffffff",
      "--surface": "#f6f8fa",
      "--surface-warm": "var(--surface)",
      "--fg": "#1f2328",
      "--fg-2": "#1f2328",
      "--muted": "#656d76",
      "--meta": "#656d76",
      "--border": "#d0d7de",
      "--border-soft": "#d8dee4",
      "--accent": "#0969da",
      "--accent-on": "#ffffff",
      "--accent-hover": "#0550ae",
      "--accent-active": "color-mix(in oklab, var(--accent), black 14%)",
      "--success": "#1a7f37",
      "--warn": "#9a6700",
      "--danger": "#cf222e",
      "--font-display": '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"',
      "--font-body": '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"',
      "--font-mono": 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
      "--text-xs": "12px",
      "--text-sm": "14px",
      "--text-base": "14px",
      "--text-lg": "16px",
      "--text-xl": "20px",
      "--text-2xl": "24px",
      "--text-3xl": "28px",
      "--text-4xl": "32px",
      "--leading-body": "1.5",
      "--leading-tight": "1.25",
      "--tracking-display": "-0.01em",
      "--space-1": "4px",
      "--space-2": "8px",
      "--space-3": "12px",
      "--space-4": "16px",
      "--space-5": "20px",
      "--space-6": "24px",
      "--space-8": "32px",
      "--space-12": "48px",
      "--section-y-desktop": "64px",
      "--section-y-tablet": "48px",
      "--section-y-phone": "32px",
      "--radius-sm": "6px",
      "--radius-md": "6px",
      "--radius-lg": "12px",
      "--radius-pill": "9999px",
      "--elev-flat": "none",
      "--elev-ring": "0 0 0 1px var(--border)",
      "--elev-raised": "0 1px 3px rgba(31, 35, 40, 0.12), 0 8px 24px rgba(66, 74, 83, 0.12)",
      "--focus-ring": "0 0 0 3px rgba(9, 105, 218, 0.3)",
      "--motion-fast": "80ms",
      "--motion-base": "200ms",
      "--ease-standard": "ease-out",
      "--container-max": "1280px",
      "--container-gutter-desktop": "24px",
      "--container-gutter-tablet": "16px",
      "--container-gutter-phone": "16px"
    },
    designMd: "# Design System Inspired by GitHub\n\n> Category: Developer Tools\n> Code-forward platform. Functional density, blue-on-white precision, Primer foundations.\n\n## 1. Visual Theme & Atmosphere\n\nGitHub's surface is engineered, not decorated. Every pixel announces a stance: this is a tool for people who care about diffs, builds, and pull requests. The page background is a clean `#ffffff` (light) or `#0d1117` (dark), with content arranged on dense rectangular panes separated by hairline borders rather than negative space. Information density is the brand \u2014 list rows, code lines, repository headers, and notification cards are all packed close together so a power user can scan a hundred items without scrolling.\n\nThe signature accents are the **Primer blue** (`#0969da`) for links and primary actions, and **GitHub green** (`#1a7f37`) for merged states, success, and the merge button itself. Both feel slightly muted compared to consumer-product blues and greens \u2014 saturated enough to read against the dense gray text, restrained enough to disappear into the background when several appear in one viewport."
  },
  {
    id: "bento",
    name: "Bento",
    category: "Layout & Structure",
    description: "Modular grid layout with card-like blocks, clear hierarchy, soft spacing, and subtle visual contrast for organized, scannable interfaces.",
    tokens: {
      "--bg": "#f5f8ff",
      "--surface": "#ffffff",
      "--surface-warm": "#eaf1ff",
      "--fg": "#101828",
      "--fg-2": "#344054",
      "--muted": "#667085",
      "--meta": "#2563eb",
      "--border": "#d7e0ef",
      "--border-soft": "#edf2f8",
      "--accent": "#2563eb",
      "--accent-on": "#ffffff",
      "--accent-hover": "color-mix(in oklab, var(--accent), black 8%)",
      "--accent-active": "color-mix(in oklab, var(--accent), black 14%)",
      "--success": "#16a34a",
      "--warn": "#f59e0b",
      "--danger": "#ef4444",
      "--font-display": "Inter, system-ui, sans-serif",
      "--font-body": "Inter, system-ui, sans-serif",
      "--font-mono": '"SF Mono", ui-monospace, Menlo, monospace',
      "--text-xs": "12px",
      "--text-sm": "14px",
      "--text-base": "16px",
      "--text-lg": "18px",
      "--text-xl": "24px",
      "--text-2xl": "36px",
      "--text-3xl": "54px",
      "--text-4xl": "76px",
      "--leading-body": "1.52",
      "--leading-tight": "1.06",
      "--tracking-display": "-0.025em",
      "--space-1": "4px",
      "--space-2": "8px",
      "--space-3": "12px",
      "--space-4": "16px",
      "--space-5": "20px",
      "--space-6": "24px",
      "--space-8": "32px",
      "--space-12": "48px",
      "--section-y-desktop": "96px",
      "--section-y-tablet": "68px",
      "--section-y-phone": "48px",
      "--radius-sm": "10px",
      "--radius-md": "16px",
      "--radius-lg": "24px",
      "--radius-pill": "9999px",
      "--elev-flat": "none",
      "--elev-ring": "0 0 0 1px var(--border)",
      "--elev-raised": "0 20px 52px rgba(16, 24, 40, 0.11)",
      "--focus-ring": "0 0 0 4px rgba(37, 99, 235, 0.22)",
      "--motion-fast": "150ms",
      "--motion-base": "240ms",
      "--ease-standard": "cubic-bezier(0.2, 0, 0, 1)",
      "--container-max": "1180px",
      "--container-gutter-desktop": "36px",
      "--container-gutter-tablet": "24px",
      "--container-gutter-phone": "16px"
    },
    designMd: "# Design System Inspired by Bento\n\n> Category: Layout & Structure\n> Modular grid layout with card-like blocks, clear hierarchy, soft spacing, and subtle visual contrast for organized, scannable interfaces.\n\n## 1. Visual Theme & Atmosphere\n\nModular grid layout with card-like blocks, clear hierarchy, soft spacing, and subtle visual contrast for organized, scannable interfaces.\n\n- **Visual style:** modern, clean\n- **Color stance:** primary, neutral, success, warning, danger\n- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.\n\n## 2. Color\n\n- **Primary:** `#FAD4C0` \u2014 Token from style foundations.\n- **Secondary:** `#80A1C1` \u2014 Token from style foundations.\n- **Success:** `#16A34A` \u2014 Token from style foundations.\n- **Warning:** `#D97706` \u2014 Token from style foundations.\n- **Danger:** `#DC2626` \u2014 Token from style foundations.\n- **Surface:** `#FFF5E6` \u2014 Token from style foundations.\n- **Text:** `#111827` \u2014 Token from style foundations.\n- **Neutral:** `#FFF5E6` \u2014 Derived from the surface token for official format compatibility.\n\n- Favor Primary (#FAD4C0) for CTA emphasis.\n- Use Surface (#FFF5E6) for large backgrounds and cards."
  },
  {
    id: "editorial",
    name: "Editorial",
    category: "Creative & Artistic",
    description: "Magazine-inspired editorial layout with refined serif typography, structured grids, and elegant reading experiences.",
    tokens: {
      "--bg": "#fbf7f0",
      "--surface": "#fffdf8",
      "--surface-warm": "#f1e6d6",
      "--fg": "#1f1a16",
      "--fg-2": "#4b4038",
      "--muted": "#7d7168",
      "--meta": "#9a5a2f",
      "--border": "#ded3c5",
      "--border-soft": "#eee5da",
      "--accent": "#9a5a2f",
      "--accent-on": "#ffffff",
      "--accent-hover": "color-mix(in oklab, var(--accent), black 8%)",
      "--accent-active": "color-mix(in oklab, var(--accent), black 14%)",
      "--success": "#4f8a4f",
      "--warn": "#c9822f",
      "--danger": "#b33a3a",
      "--font-display": 'Georgia, "Times New Roman", serif',
      "--font-body": '"Source Serif Pro", Georgia, serif',
      "--font-mono": '"IBM Plex Mono", ui-monospace, Menlo, monospace',
      "--text-xs": "12px",
      "--text-sm": "14px",
      "--text-base": "18px",
      "--text-lg": "21px",
      "--text-xl": "30px",
      "--text-2xl": "44px",
      "--text-3xl": "66px",
      "--text-4xl": "92px",
      "--leading-body": "1.65",
      "--leading-tight": "1",
      "--tracking-display": "-0.02em",
      "--space-1": "4px",
      "--space-2": "8px",
      "--space-3": "12px",
      "--space-4": "16px",
      "--space-5": "20px",
      "--space-6": "24px",
      "--space-8": "32px",
      "--space-12": "48px",
      "--section-y-desktop": "112px",
      "--section-y-tablet": "80px",
      "--section-y-phone": "56px",
      "--radius-sm": "4px",
      "--radius-md": "8px",
      "--radius-lg": "12px",
      "--radius-pill": "9999px",
      "--elev-flat": "none",
      "--elev-ring": "0 0 0 1px var(--border)",
      "--elev-raised": "0 20px 50px rgba(31, 26, 22, 0.12)",
      "--focus-ring": "0 0 0 4px rgba(154, 90, 47, 0.24)",
      "--motion-fast": "180ms",
      "--motion-base": "280ms",
      "--ease-standard": "cubic-bezier(0.22, 1, 0.36, 1)",
      "--container-max": "1120px",
      "--container-gutter-desktop": "36px",
      "--container-gutter-tablet": "24px",
      "--container-gutter-phone": "16px"
    },
    designMd: "# Design System Inspired by Editorial\n\n> Category: Creative & Artistic\n> Magazine-inspired editorial layout with refined serif typography, structured grids, and elegant reading experiences.\n\n## 1. Visual Theme & Atmosphere\n\nMagazine-inspired editorial layout with refined serif typography, structured grids, and elegant reading experiences.\n\n- **Visual style:** modern, editorial\n- **Color stance:** primary, secondary, neutral, success\n- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.\n\n## 2. Color\n\n- **Primary:** `#111111` \u2014 Token from style foundations.\n- **Secondary:** `#F1F1F1` \u2014 Token from style foundations.\n- **Success:** `#16A34A` \u2014 Token from style foundations.\n- **Warning:** `#D97706` \u2014 Token from style foundations.\n- **Danger:** `#DC2626` \u2014 Token from style foundations.\n- **Surface:** `#FFFFFF` \u2014 Token from style foundations.\n- **Text:** `#111827` \u2014 Token from style foundations.\n- **Neutral:** `#FFFFFF` \u2014 Derived from the surface token for official format compatibility.\n\n- Favor Primary (#111111) for CTA emphasis.\n- Use Surface (#FFFFFF) for large backgrounds and cards."
  },
  {
    id: "warm-editorial",
    name: "Warm Editorial",
    category: "Starter",
    description: "A serif-led magazine aesthetic. Terracotta accent on warm off-white paper \u2014",
    tokens: {
      "--bg": "#fbf6ee",
      "--surface": "#fffdf8",
      "--surface-warm": "#f1e3cf",
      "--fg": "#201914",
      "--fg-2": "#4c4037",
      "--muted": "#7a6d63",
      "--meta": "#9b5b32",
      "--border": "#ded2c3",
      "--border-soft": "#eee4d7",
      "--accent": "#9b5b32",
      "--accent-on": "#ffffff",
      "--accent-hover": "color-mix(in oklab, var(--accent), black 8%)",
      "--accent-active": "color-mix(in oklab, var(--accent), black 14%)",
      "--success": "#4f8a4f",
      "--warn": "#c9822f",
      "--danger": "#b33a3a",
      "--font-display": 'Georgia, "Times New Roman", serif',
      "--font-body": "Inter, system-ui, sans-serif",
      "--font-mono": '"SF Mono", ui-monospace, Menlo, monospace',
      "--text-xs": "12px",
      "--text-sm": "14px",
      "--text-base": "17px",
      "--text-lg": "20px",
      "--text-xl": "28px",
      "--text-2xl": "42px",
      "--text-3xl": "64px",
      "--text-4xl": "88px",
      "--leading-body": "1.62",
      "--leading-tight": "1",
      "--tracking-display": "-0.025em",
      "--space-1": "4px",
      "--space-2": "8px",
      "--space-3": "12px",
      "--space-4": "16px",
      "--space-5": "20px",
      "--space-6": "24px",
      "--space-8": "32px",
      "--space-12": "48px",
      "--section-y-desktop": "112px",
      "--section-y-tablet": "80px",
      "--section-y-phone": "56px",
      "--radius-sm": "10px",
      "--radius-md": "16px",
      "--radius-lg": "24px",
      "--radius-pill": "9999px",
      "--elev-flat": "none",
      "--elev-ring": "0 0 0 1px var(--border)",
      "--elev-raised": "0 20px 52px rgba(32, 25, 20, 0.12)",
      "--focus-ring": "0 0 0 4px rgba(155, 91, 50, 0.24)",
      "--motion-fast": "150ms",
      "--motion-base": "240ms",
      "--ease-standard": "cubic-bezier(0.2, 0, 0, 1)",
      "--container-max": "1180px",
      "--container-gutter-desktop": "36px",
      "--container-gutter-tablet": "24px",
      "--container-gutter-phone": "16px"
    },
    designMd: "# Warm Editorial\n\n> Category: Starter\n> A serif-led magazine aesthetic. Terracotta accent on warm off-white paper \u2014\n> good for long-form, editorial, and brand-led marketing pages.\n\n## Visual Theme & Atmosphere\nWarm, unhurried, magazine-like. Think \"a New Yorker interview column online.\" Generous whitespace, long-form readability, restrained chrome. Playful but never novelty.\n\n## Color Palette & Roles\n- **Background:** `#FAF7F2` (warm off-white paper)\n- **Foreground:** `#1C1A17` (near-black, slightly warm)\n- **Accent (primary):** `#C0512F` (terracotta) \u2014 used for links, primary CTAs, 1 hero element max per page\n- **Accent (secondary):** `#2F5B4F` (forest) \u2014 section dividers, tags\n- **Muted:** `#8A817A` (mid-warm-grey) \u2014 timestamps, metadata\n- **Surface:** `#FFFFFF` \u2014 elevated cards only\nNever use pure black or pure white anywhere user-facing.\n\n## Typography Rules\n- **Display / headings:** \"GT Sectra\" or fallback serif (`'GT Sectra', 'Times New Roman', serif`)\n- **Body:** \"S\xF6hne\" or fallback sans (`'S\xF6hne', -apple-system, system-ui, sans-serif`)\n- **Mono:** `'JetBrains Mono', ui-monospace, monospace` for code only\n- Scale (px): 12 \xB7 14 \xB7 16 \xB7 20 \xB7 28 \xB7 40 \xB7 56 \xB7 80"
  },
  {
    id: "paper",
    name: "Paper",
    category: "Retro & Nostalgic",
    description: "Paper-textured, print-inspired design with minimal colors, clean serif/sans typography, and tactile surface qualities.",
    tokens: {
      "--bg": "#faf3df",
      "--surface": "#fffaf0",
      "--surface-warm": "#efe0bd",
      "--fg": "#211b12",
      "--fg-2": "#504737",
      "--muted": "#7c7160",
      "--meta": "#8f5d24",
      "--border": "#ddd0b4",
      "--border-soft": "#eee3cd",
      "--accent": "#8f5d24",
      "--accent-on": "#ffffff",
      "--accent-hover": "color-mix(in oklab, var(--accent), black 8%)",
      "--accent-active": "color-mix(in oklab, var(--accent), black 14%)",
      "--success": "#5b8d42",
      "--warn": "#c27b22",
      "--danger": "#a64036",
      "--font-display": 'Georgia, "Times New Roman", serif',
      "--font-body": "Inter, system-ui, sans-serif",
      "--font-mono": '"SF Mono", ui-monospace, Menlo, monospace',
      "--text-xs": "12px",
      "--text-sm": "14px",
      "--text-base": "17px",
      "--text-lg": "20px",
      "--text-xl": "28px",
      "--text-2xl": "42px",
      "--text-3xl": "64px",
      "--text-4xl": "88px",
      "--leading-body": "1.62",
      "--leading-tight": "1",
      "--tracking-display": "-0.025em",
      "--space-1": "4px",
      "--space-2": "8px",
      "--space-3": "12px",
      "--space-4": "16px",
      "--space-5": "20px",
      "--space-6": "24px",
      "--space-8": "32px",
      "--space-12": "48px",
      "--section-y-desktop": "112px",
      "--section-y-tablet": "80px",
      "--section-y-phone": "56px",
      "--radius-sm": "10px",
      "--radius-md": "16px",
      "--radius-lg": "24px",
      "--radius-pill": "9999px",
      "--elev-flat": "none",
      "--elev-ring": "0 0 0 1px var(--border)",
      "--elev-raised": "0 18px 42px rgba(33, 27, 18, 0.12)",
      "--focus-ring": "0 0 0 4px rgba(143, 93, 36, 0.24)",
      "--motion-fast": "150ms",
      "--motion-base": "240ms",
      "--ease-standard": "cubic-bezier(0.2, 0, 0, 1)",
      "--container-max": "1180px",
      "--container-gutter-desktop": "36px",
      "--container-gutter-tablet": "24px",
      "--container-gutter-phone": "16px"
    },
    designMd: "# Design System Inspired by Paper\n\n> Category: Retro & Nostalgic\n> Paper-textured, print-inspired design with minimal colors, clean serif/sans typography, and tactile surface qualities.\n\n## 1. Visual Theme & Atmosphere\n\nPaper-textured, print-inspired design with minimal colors, clean serif/sans typography, and tactile surface qualities.\n\n- **Visual style:** minimal, clean\n- **Color stance:** primary, neutral, success, warning, danger\n- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.\n\n## 2. Color\n\n- **Primary:** `#111111` \u2014 Token from style foundations.\n- **Secondary:** `#8B5CF6` \u2014 Token from style foundations.\n- **Success:** `#16A34A` \u2014 Token from style foundations.\n- **Warning:** `#D97706` \u2014 Token from style foundations.\n- **Danger:** `#DC2626` \u2014 Token from style foundations.\n- **Surface:** `#FFFFFF` \u2014 Token from style foundations.\n- **Text:** `#111827` \u2014 Token from style foundations.\n- **Neutral:** `#FFFFFF` \u2014 Derived from the surface token for official format compatibility.\n\n- Favor Primary (#111111) for CTA emphasis.\n- Use Surface (#FFFFFF) for large backgrounds and cards."
  },
  {
    id: "brutalism",
    name: "Brutalism",
    category: "Bold & Expressive",
    description: "Raw, anti-design aesthetic inspired by concrete architecture with unadorned elements, jarring layouts, and functional minimalism.",
    tokens: {
      "--bg": "#f5f1e8",
      "--surface": "#ffffff",
      "--surface-warm": "#ffef5a",
      "--fg": "#000000",
      "--fg-2": "#222222",
      "--muted": "#555555",
      "--meta": "#000000",
      "--border": "#000000",
      "--border-soft": "#000000",
      "--accent": "#ffef5a",
      "--accent-on": "#000000",
      "--accent-hover": "color-mix(in oklab, var(--accent), black 8%)",
      "--accent-active": "color-mix(in oklab, var(--accent), black 14%)",
      "--success": "#00b050",
      "--warn": "#ff8c00",
      "--danger": "#ff2b2b",
      "--font-display": "Arial Black, Impact, sans-serif",
      "--font-body": "Arial, Helvetica, sans-serif",
      "--font-mono": '"Courier New", ui-monospace, monospace',
      "--text-xs": "12px",
      "--text-sm": "14px",
      "--text-base": "17px",
      "--text-lg": "20px",
      "--text-xl": "28px",
      "--text-2xl": "42px",
      "--text-3xl": "64px",
      "--text-4xl": "88px",
      "--leading-body": "1.35",
      "--leading-tight": "0.98",
      "--tracking-display": "0",
      "--space-1": "4px",
      "--space-2": "8px",
      "--space-3": "12px",
      "--space-4": "16px",
      "--space-5": "20px",
      "--space-6": "24px",
      "--space-8": "32px",
      "--space-12": "48px",
      "--section-y-desktop": "88px",
      "--section-y-tablet": "64px",
      "--section-y-phone": "44px",
      "--radius-sm": "0px",
      "--radius-md": "0px",
      "--radius-lg": "0px",
      "--radius-pill": "9999px",
      "--elev-flat": "none",
      "--elev-ring": "0 0 0 1px var(--border)",
      "--elev-raised": "8px 8px 0 #000000",
      "--focus-ring": "0 0 0 4px #000000, 0 0 0 8px #ffef5a",
      "--motion-fast": "90ms",
      "--motion-base": "140ms",
      "--ease-standard": "steps(2, end)",
      "--container-max": "1160px",
      "--container-gutter-desktop": "36px",
      "--container-gutter-tablet": "24px",
      "--container-gutter-phone": "16px"
    },
    designMd: "# Design System Inspired by Brutalism\n\n> Category: Bold & Expressive\n> Raw, anti-design aesthetic inspired by concrete architecture with unadorned elements, jarring layouts, and functional minimalism.\n\n## 1. Visual Theme & Atmosphere\n\nRaw, anti-design aesthetic inspired by concrete architecture with unadorned elements, jarring layouts, and functional minimalism.\n\n- **Visual style:** bold\n- **Color stance:** primary, secondary, neutral, success, warning, danger\n- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.\n\n## 2. Color\n\n- **Primary:** `#DD614C` \u2014 Token from style foundations.\n- **Secondary:** `#DAA144` \u2014 Token from style foundations.\n- **Success:** `#16A34A` \u2014 Token from style foundations.\n- **Warning:** `#D97706` \u2014 Token from style foundations.\n- **Danger:** `#DC2626` \u2014 Token from style foundations.\n- **Surface:** `#FFFFFF` \u2014 Token from style foundations.\n- **Text:** `#111827` \u2014 Token from style foundations.\n- **Neutral:** `#FFFFFF` \u2014 Derived from the surface token for official format compatibility.\n\n- Favor Primary (#DD614C) for CTA emphasis.\n- Use Surface (#FFFFFF) for large backgrounds and cards."
  },
  {
    id: "neobrutalism",
    name: "Neobrutalism",
    category: "Bold & Expressive",
    description: "Modern take on brutalism with bold borders, vivid accent colors, and raw, high-contrast layouts on warm surfaces.",
    tokens: {
      "--bg": "#fff4cf",
      "--surface": "#fffaf0",
      "--surface-warm": "#ffdca8",
      "--fg": "#2a1810",
      "--fg-2": "#593625",
      "--muted": "#8a6652",
      "--meta": "#d24b1f",
      "--border": "#d9aa7a",
      "--border-soft": "#efd0ab",
      "--accent": "#d24b1f",
      "--accent-on": "#ffffff",
      "--accent-hover": "color-mix(in oklab, var(--accent), black 8%)",
      "--accent-active": "color-mix(in oklab, var(--accent), black 14%)",
      "--success": "#3d8f4f",
      "--warn": "#f2a93b",
      "--danger": "#b83a2f",
      "--font-display": "Arial Black, Impact, sans-serif",
      "--font-body": "Inter, system-ui, sans-serif",
      "--font-mono": '"SF Mono", ui-monospace, Menlo, monospace',
      "--text-xs": "12px",
      "--text-sm": "14px",
      "--text-base": "16px",
      "--text-lg": "18px",
      "--text-xl": "24px",
      "--text-2xl": "36px",
      "--text-3xl": "54px",
      "--text-4xl": "76px",
      "--leading-body": "1.52",
      "--leading-tight": "1.06",
      "--tracking-display": "0",
      "--space-1": "4px",
      "--space-2": "8px",
      "--space-3": "12px",
      "--space-4": "16px",
      "--space-5": "20px",
      "--space-6": "24px",
      "--space-8": "32px",
      "--space-12": "48px",
      "--section-y-desktop": "96px",
      "--section-y-tablet": "68px",
      "--section-y-phone": "48px",
      "--radius-sm": "4px",
      "--radius-md": "8px",
      "--radius-lg": "12px",
      "--radius-pill": "9999px",
      "--elev-flat": "none",
      "--elev-ring": "0 0 0 1px var(--border)",
      "--elev-raised": "6px 6px 0 rgba(42, 24, 16, 0.26)",
      "--focus-ring": "0 0 0 4px rgba(210, 75, 31, 0.28)",
      "--motion-fast": "150ms",
      "--motion-base": "240ms",
      "--ease-standard": "cubic-bezier(0.2, 0, 0, 1)",
      "--container-max": "1180px",
      "--container-gutter-desktop": "36px",
      "--container-gutter-tablet": "24px",
      "--container-gutter-phone": "16px"
    },
    designMd: "# Design System Inspired by Neobrutalism\n\n> Category: Bold & Expressive\n> Modern take on brutalism with bold borders, vivid accent colors, and raw, high-contrast layouts on warm surfaces.\n\n## 1. Visual Theme & Atmosphere\n\nModern take on brutalism with bold borders, vivid accent colors, and raw, high-contrast layouts on warm surfaces.\n\n- **Visual style:** modern, clean, high-contrast\n- **Color stance:** primary, neutral, success, warning, danger\n- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.\n\n## 2. Color\n\n- **Primary:** `#FDC800` \u2014 Token from style foundations.\n- **Secondary:** `#432DD7` \u2014 Token from style foundations.\n- **Success:** `#16A34A` \u2014 Token from style foundations.\n- **Warning:** `#D97706` \u2014 Token from style foundations.\n- **Danger:** `#DC2626` \u2014 Token from style foundations.\n- **Surface:** `#FBFBF9` \u2014 Token from style foundations.\n- **Text:** `#1C293C` \u2014 Token from style foundations.\n- **Neutral:** `#FBFBF9` \u2014 Derived from the surface token for official format compatibility.\n\n- Favor Primary (#FDC800) for CTA emphasis.\n- Use Surface (#FBFBF9) for large backgrounds and cards."
  },
  {
    id: "mono",
    name: "Mono",
    category: "Modern & Minimal",
    description: "Monospace-driven, matrix-inspired design with high-contrast elements, compact density, and a hacker-chic aesthetic.",
    tokens: {
      "--bg": "#ffffff",
      "--surface": "#f7f7f7",
      "--surface-warm": "#eeeeee",
      "--fg": "#111111",
      "--fg-2": "#3a3a3a",
      "--muted": "#707070",
      "--meta": "#111111",
      "--border": "#d9d9d9",
      "--border-soft": "#eeeeee",
      "--accent": "#111111",
      "--accent-on": "#ffffff",
      "--accent-hover": "color-mix(in oklab, var(--accent), black 8%)",
      "--accent-active": "color-mix(in oklab, var(--accent), black 14%)",
      "--success": "#168a46",
      "--warn": "#b7791f",
      "--danger": "#c53030",
      "--font-display": '"IBM Plex Mono", ui-monospace, monospace',
      "--font-body": '"IBM Plex Mono", ui-monospace, monospace',
      "--font-mono": '"IBM Plex Mono", ui-monospace, monospace',
      "--text-xs": "11px",
      "--text-sm": "12px",
      "--text-base": "14px",
      "--text-lg": "16px",
      "--text-xl": "20px",
      "--text-2xl": "28px",
      "--text-3xl": "40px",
      "--text-4xl": "56px",
      "--leading-body": "1.45",
      "--leading-tight": "1.06",
      "--tracking-display": "-0.025em",
      "--space-1": "4px",
      "--space-2": "8px",
      "--space-3": "12px",
      "--space-4": "16px",
      "--space-5": "20px",
      "--space-6": "24px",
      "--space-8": "32px",
      "--space-12": "48px",
      "--section-y-desktop": "80px",
      "--section-y-tablet": "60px",
      "--section-y-phone": "42px",
      "--radius-sm": "4px",
      "--radius-md": "8px",
      "--radius-lg": "12px",
      "--radius-pill": "9999px",
      "--elev-flat": "none",
      "--elev-ring": "0 0 0 1px var(--border)",
      "--elev-raised": "0 16px 40px rgba(0, 0, 0, 0.10)",
      "--focus-ring": "0 0 0 3px rgba(17, 17, 17, 0.18)",
      "--motion-fast": "100ms",
      "--motion-base": "180ms",
      "--ease-standard": "cubic-bezier(0.2, 0, 0, 1)",
      "--container-max": "1280px",
      "--container-gutter-desktop": "36px",
      "--container-gutter-tablet": "24px",
      "--container-gutter-phone": "16px"
    },
    designMd: "# Design System Inspired by Mono\n\n> Category: Modern & Minimal\n> Monospace-driven, matrix-inspired design with high-contrast elements, compact density, and a hacker-chic aesthetic.\n\n## 1. Visual Theme & Atmosphere\n\nMonospace-driven, matrix-inspired design with high-contrast elements, compact density, and a hacker-chic aesthetic.\n\n- **Visual style:** minimal, clean, high-contrast, playful, matrix\n- **Color stance:** primary, secondary, success, warning, danger, info\n- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.\n\n## 2. Color\n\n- **Primary:** `#37F712` \u2014 Token from style foundations.\n- **Secondary:** `#00A6F4` \u2014 Token from style foundations.\n- **Success:** `#00A63D` \u2014 Token from style foundations.\n- **Warning:** `#FE9900` \u2014 Token from style foundations.\n- **Danger:** `#FF2157` \u2014 Token from style foundations.\n- **Surface:** `#E7E5E4` \u2014 Token from style foundations.\n- **Text:** `#78716B` \u2014 Token from style foundations.\n- **Neutral:** `#E7E5E4` \u2014 Derived from the surface token for official format compatibility.\n\n- Favor Primary (#37F712) for CTA emphasis.\n- Use Surface (#E7E5E4) for large backgrounds and cards."
  },
  {
    id: "minimal",
    name: "Minimal",
    category: "Modern & Minimal",
    description: "Stripped-back design emphasizing whitespace, clean typography, and restrained color for maximum clarity and focus.",
    tokens: {
      "--bg": "#ffffff",
      "--surface": "#fafafa",
      "--surface-warm": "#f5f5f5",
      "--fg": "#111111",
      "--fg-2": "#3a3a3a",
      "--muted": "#777777",
      "--meta": "#111111",
      "--border": "#e2e2e2",
      "--border-soft": "#eeeeee",
      "--accent": "#111111",
      "--accent-on": "#ffffff",
      "--accent-hover": "color-mix(in oklab, var(--accent), black 8%)",
      "--accent-active": "color-mix(in oklab, var(--accent), black 14%)",
      "--success": "#168a46",
      "--warn": "#b7791f",
      "--danger": "#c53030",
      "--font-display": "Inter, system-ui, sans-serif",
      "--font-body": "Inter, system-ui, sans-serif",
      "--font-mono": '"SF Mono", ui-monospace, Menlo, monospace',
      "--text-xs": "12px",
      "--text-sm": "14px",
      "--text-base": "16px",
      "--text-lg": "18px",
      "--text-xl": "22px",
      "--text-2xl": "32px",
      "--text-3xl": "48px",
      "--text-4xl": "64px",
      "--leading-body": "1.55",
      "--leading-tight": "1.08",
      "--tracking-display": "-0.02em",
      "--space-1": "4px",
      "--space-2": "8px",
      "--space-3": "12px",
      "--space-4": "16px",
      "--space-5": "20px",
      "--space-6": "24px",
      "--space-8": "32px",
      "--space-12": "48px",
      "--section-y-desktop": "112px",
      "--section-y-tablet": "80px",
      "--section-y-phone": "56px",
      "--radius-sm": "2px",
      "--radius-md": "4px",
      "--radius-lg": "8px",
      "--radius-pill": "9999px",
      "--elev-flat": "none",
      "--elev-ring": "0 0 0 1px var(--border)",
      "--elev-raised": "0 12px 30px rgba(0, 0, 0, 0.08)",
      "--focus-ring": "0 0 0 3px rgba(17, 17, 17, 0.18)",
      "--motion-fast": "140ms",
      "--motion-base": "220ms",
      "--ease-standard": "cubic-bezier(0.2, 0, 0, 1)",
      "--container-max": "1120px",
      "--container-gutter-desktop": "36px",
      "--container-gutter-tablet": "24px",
      "--container-gutter-phone": "16px"
    },
    designMd: "# Design System Inspired by Minimal\n\n> Category: Modern & Minimal\n> Stripped-back design emphasizing whitespace, clean typography, and restrained color for maximum clarity and focus.\n\n## 1. Visual Theme & Atmosphere\n\nStripped-back design emphasizing whitespace, clean typography, and restrained color for maximum clarity and focus.\n\n- **Visual style:** minimal, clean, bold\n- **Color stance:** primary, neutral, success, warning, danger\n- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.\n\n## 2. Color\n\n- **Primary:** `#0C0C09` \u2014 Token from style foundations.\n- **Secondary:** `#312C85` \u2014 Token from style foundations.\n- **Success:** `#16A34A` \u2014 Token from style foundations.\n- **Warning:** `#D97706` \u2014 Token from style foundations.\n- **Danger:** `#DC2626` \u2014 Token from style foundations.\n- **Surface:** `#F4F4F1` \u2014 Token from style foundations.\n- **Text:** `#0C0C09` \u2014 Token from style foundations.\n- **Neutral:** `#F4F4F1` \u2014 Derived from the surface token for official format compatibility.\n\n- Favor Primary (#0C0C09) for CTA emphasis.\n- Use Surface (#F4F4F1) for large backgrounds and cards."
  },
  {
    id: "glassmorphism",
    name: "Glassmorphism",
    category: "Morphism & Effects",
    description: "Frosted glass effect with translucent layers, subtle blur, and luminous borders for depth and modern elegance.",
    tokens: {
      "--bg": "#eef6ff",
      "--surface": "rgba(255, 255, 255, 0.74)",
      "--surface-warm": "rgba(238, 246, 255, 0.72)",
      "--fg": "#102033",
      "--fg-2": "#34465f",
      "--muted": "#60708a",
      "--meta": "#4f8cff",
      "--border": "rgba(255, 255, 255, 0.64)",
      "--border-soft": "rgba(255, 255, 255, 0.38)",
      "--accent": "#4f8cff",
      "--accent-on": "#ffffff",
      "--accent-hover": "color-mix(in oklab, var(--accent), black 8%)",
      "--accent-active": "color-mix(in oklab, var(--accent), black 14%)",
      "--success": "#22c55e",
      "--warn": "#f59e0b",
      "--danger": "#ef4444",
      "--font-display": "Inter, system-ui, sans-serif",
      "--font-body": "Inter, system-ui, sans-serif",
      "--font-mono": '"SF Mono", ui-monospace, Menlo, monospace',
      "--text-xs": "12px",
      "--text-sm": "14px",
      "--text-base": "16px",
      "--text-lg": "18px",
      "--text-xl": "24px",
      "--text-2xl": "36px",
      "--text-3xl": "54px",
      "--text-4xl": "76px",
      "--leading-body": "1.55",
      "--leading-tight": "1.04",
      "--tracking-display": "-0.025em",
      "--space-1": "4px",
      "--space-2": "8px",
      "--space-3": "12px",
      "--space-4": "16px",
      "--space-5": "20px",
      "--space-6": "24px",
      "--space-8": "32px",
      "--space-12": "48px",
      "--section-y-desktop": "104px",
      "--section-y-tablet": "72px",
      "--section-y-phone": "52px",
      "--radius-sm": "16px",
      "--radius-md": "24px",
      "--radius-lg": "36px",
      "--radius-pill": "9999px",
      "--elev-flat": "none",
      "--elev-ring": "0 0 0 1px var(--border)",
      "--elev-raised": "0 24px 80px rgba(79, 140, 255, 0.18)",
      "--focus-ring": "0 0 0 4px rgba(79, 140, 255, 0.28)",
      "--motion-fast": "180ms",
      "--motion-base": "280ms",
      "--ease-standard": "cubic-bezier(0.22, 1, 0.36, 1)",
      "--container-max": "1180px",
      "--container-gutter-desktop": "36px",
      "--container-gutter-tablet": "24px",
      "--container-gutter-phone": "16px"
    },
    designMd: "# Design System Inspired by Glassmorphism\n\n> Category: Morphism & Effects\n> Frosted glass effect with translucent layers, subtle blur, and luminous borders for depth and modern elegance.\n\n## 1. Visual Theme & Atmosphere\n\nFrosted glass effect with translucent layers, subtle blur, and luminous borders for depth and modern elegance.\n\n- **Visual style:** clean, high-contrast, bold, enterprise, liquidglass effect, glassmorphism\n- **Color stance:** primary, neutral, success, warning, danger, info, surface/subtle layers\n- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.\n\n## 2. Color\n\n- **Primary:** `#1856FF` \u2014 Token from style foundations.\n- **Secondary:** `#3A344E` \u2014 Token from style foundations.\n- **Success:** `#07CA6B` \u2014 Token from style foundations.\n- **Warning:** `#E89558` \u2014 Token from style foundations.\n- **Danger:** `#EA2143` \u2014 Token from style foundations.\n- **Surface:** `#FFFFFF` \u2014 Token from style foundations.\n- **Text:** `#141414` \u2014 Token from style foundations.\n- **Neutral:** `#FFFFFF` \u2014 Derived from the surface token for official format compatibility.\n\n- Favor Primary (#1856FF) for CTA emphasis."
  },
  {
    id: "luxury",
    name: "Luxury",
    category: "Professional & Corporate",
    description: "High-end dark aesthetic with bold headings, monochromatic palette, and premium feel for luxury brand experiences.",
    tokens: {
      "--bg": "#080706",
      "--surface": "#151310",
      "--surface-warm": "#241e14",
      "--fg": "#fff8ea",
      "--fg-2": "#d8cdb7",
      "--muted": "#9f927c",
      "--meta": "#c6a15b",
      "--border": "#3a3020",
      "--border-soft": "#282217",
      "--accent": "#c6a15b",
      "--accent-on": "#080706",
      "--accent-hover": "color-mix(in oklab, var(--accent), black 8%)",
      "--accent-active": "color-mix(in oklab, var(--accent), black 14%)",
      "--success": "#5fa36a",
      "--warn": "#d8a94f",
      "--danger": "#d85a52",
      "--font-display": '"Didot", "Bodoni 72", Georgia, serif',
      "--font-body": '"Avenir Next", Inter, sans-serif',
      "--font-mono": '"SF Mono", ui-monospace, Menlo, monospace',
      "--text-xs": "12px",
      "--text-sm": "14px",
      "--text-base": "16px",
      "--text-lg": "19px",
      "--text-xl": "28px",
      "--text-2xl": "44px",
      "--text-3xl": "68px",
      "--text-4xl": "96px",
      "--leading-body": "1.6",
      "--leading-tight": "0.98",
      "--tracking-display": "-0.015em",
      "--space-1": "4px",
      "--space-2": "8px",
      "--space-3": "12px",
      "--space-4": "16px",
      "--space-5": "20px",
      "--space-6": "24px",
      "--space-8": "32px",
      "--space-12": "48px",
      "--section-y-desktop": "120px",
      "--section-y-tablet": "84px",
      "--section-y-phone": "60px",
      "--radius-sm": "8px",
      "--radius-md": "14px",
      "--radius-lg": "24px",
      "--radius-pill": "9999px",
      "--elev-flat": "none",
      "--elev-ring": "0 0 0 1px var(--border)",
      "--elev-raised": "0 30px 90px rgba(0, 0, 0, 0.52)",
      "--focus-ring": "0 0 0 4px rgba(198, 161, 91, 0.30)",
      "--motion-fast": "180ms",
      "--motion-base": "300ms",
      "--ease-standard": "cubic-bezier(0.16, 1, 0.3, 1)",
      "--container-max": "1160px",
      "--container-gutter-desktop": "36px",
      "--container-gutter-tablet": "24px",
      "--container-gutter-phone": "16px"
    },
    designMd: "# Design System Inspired by Luxury\n\n> Category: Professional & Corporate\n> High-end dark aesthetic with bold headings, monochromatic palette, and premium feel for luxury brand experiences.\n\n## 1. Visual Theme & Atmosphere\n\nHigh-end dark aesthetic with bold headings, monochromatic palette, and premium feel for luxury brand experiences.\n\n- **Visual style:** modern, bold, big headings\n- **Color stance:** primary\n- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.\n\n## 2. Color\n\n- **Primary:** `#FAFAFA` \u2014 Token from style foundations.\n- **Secondary:** `#FAFAFA` \u2014 Token from style foundations.\n- **Success:** `#16A34A` \u2014 Token from style foundations.\n- **Warning:** `#D97706` \u2014 Token from style foundations.\n- **Danger:** `#DC2626` \u2014 Token from style foundations.\n- **Surface:** `#000000` \u2014 Token from style foundations.\n- **Text:** `#FFFFFF` \u2014 Token from style foundations.\n- **Neutral:** `#000000` \u2014 Derived from the surface token for official format compatibility.\n\n- Favor Primary (#FAFAFA) for CTA emphasis.\n- Use Surface (#000000) for large backgrounds and cards.\n- Keep body copy on Text (#FFFFFF) for legibility.\n\n## 3. Typography"
  },
  {
    id: "doodle",
    name: "Doodle",
    category: "Creative & Artistic",
    description: "Hand-drawn, sketch-like style with doodles, handwritten fonts, and imperfect lines for a playful, informal feel.",
    tokens: {
      "--bg": "#fff8d7",
      "--surface": "#ffffff",
      "--surface-warm": "#ffef9f",
      "--fg": "#1d1836",
      "--fg-2": "#4c426c",
      "--muted": "#796f91",
      "--meta": "#ff6b00",
      "--border": "#eadfba",
      "--border-soft": "#f5eccd",
      "--accent": "#ff6b00",
      "--accent-on": "#ffffff",
      "--accent-hover": "color-mix(in oklab, var(--accent), black 8%)",
      "--accent-active": "color-mix(in oklab, var(--accent), black 14%)",
      "--success": "#2e9d57",
      "--warn": "#ffb020",
      "--danger": "#e5484d",
      "--font-display": '"Comic Sans MS", "Trebuchet MS", sans-serif',
      "--font-body": '"Comic Sans MS", "Trebuchet MS", sans-serif',
      "--font-mono": '"SF Mono", ui-monospace, Menlo, monospace',
      "--text-xs": "12px",
      "--text-sm": "14px",
      "--text-base": "16px",
      "--text-lg": "18px",
      "--text-xl": "24px",
      "--text-2xl": "36px",
      "--text-3xl": "54px",
      "--text-4xl": "76px",
      "--leading-body": "1.52",
      "--leading-tight": "1.06",
      "--tracking-display": "-0.025em",
      "--space-1": "4px",
      "--space-2": "8px",
      "--space-3": "12px",
      "--space-4": "16px",
      "--space-5": "20px",
      "--space-6": "24px",
      "--space-8": "32px",
      "--space-12": "48px",
      "--section-y-desktop": "96px",
      "--section-y-tablet": "68px",
      "--section-y-phone": "48px",
      "--radius-sm": "10px",
      "--radius-md": "16px",
      "--radius-lg": "24px",
      "--radius-pill": "9999px",
      "--elev-flat": "none",
      "--elev-ring": "0 0 0 1px var(--border)",
      "--elev-raised": "0 18px 44px rgba(29, 24, 54, 0.14)",
      "--focus-ring": "0 0 0 4px rgba(255, 107, 0, 0.26)",
      "--motion-fast": "150ms",
      "--motion-base": "240ms",
      "--ease-standard": "cubic-bezier(0.2, 0, 0, 1)",
      "--container-max": "1180px",
      "--container-gutter-desktop": "36px",
      "--container-gutter-tablet": "24px",
      "--container-gutter-phone": "16px"
    },
    designMd: "# Design System Inspired by Doodle\n\n> Category: Creative & Artistic\n> Hand-drawn, sketch-like style with doodles, handwritten fonts, and imperfect lines for a playful, informal feel.\n\n## 1. Visual Theme & Atmosphere\n\nHand-drawn, sketch-like style with doodles, handwritten fonts, and imperfect lines for a playful, informal feel.\n\n- **Visual style:** playful\n- **Color stance:** primary, secondary, neutral, success, warning, danger\n- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.\n\n## 2. Color\n\n- **Primary:** `#49B6E5` \u2014 Token from style foundations.\n- **Secondary:** `#263D5B` \u2014 Token from style foundations.\n- **Success:** `#16A34A` \u2014 Token from style foundations.\n- **Warning:** `#D97706` \u2014 Token from style foundations.\n- **Danger:** `#DC2626` \u2014 Token from style foundations.\n- **Surface:** `#FFFFFF` \u2014 Token from style foundations.\n- **Text:** `#111827` \u2014 Token from style foundations.\n- **Neutral:** `#FFFFFF` \u2014 Derived from the surface token for official format compatibility.\n\n- Favor Primary (#49B6E5) for CTA emphasis.\n- Use Surface (#FFFFFF) for large backgrounds and cards."
  },
  {
    id: "trading-terminal",
    name: "Trading Terminal Design System",
    category: "Themed & Unique",
    description: "Bloomberg-style financial trading terminal. Dark-only, data-dense, cyan/coral buy/sell signals. Everything readable at a glance from two meters away.",
    tokens: {
      "--bg": "#070b12",
      "--surface": "#101826",
      "--surface-warm": "#162238",
      "--fg": "#f8fafc",
      "--fg-2": "#cbd5e1",
      "--muted": "#8492a6",
      "--meta": "#38bdf8",
      "--border": "#263246",
      "--border-soft": "#1c2638",
      "--accent": "#38bdf8",
      "--accent-on": "#03111a",
      "--accent-hover": "color-mix(in oklab, var(--accent), black 8%)",
      "--accent-active": "color-mix(in oklab, var(--accent), black 14%)",
      "--success": "#22c55e",
      "--warn": "#f59e0b",
      "--danger": "#ef4444",
      "--font-display": "Inter, system-ui, sans-serif",
      "--font-body": "Inter, system-ui, sans-serif",
      "--font-mono": '"Roboto Mono", "SF Mono", ui-monospace, Menlo, monospace',
      "--text-xs": "11px",
      "--text-sm": "12px",
      "--text-base": "14px",
      "--text-lg": "16px",
      "--text-xl": "20px",
      "--text-2xl": "28px",
      "--text-3xl": "40px",
      "--text-4xl": "56px",
      "--leading-body": "1.45",
      "--leading-tight": "1.08",
      "--tracking-display": "-0.01em",
      "--space-1": "4px",
      "--space-2": "8px",
      "--space-3": "12px",
      "--space-4": "16px",
      "--space-5": "20px",
      "--space-6": "24px",
      "--space-8": "32px",
      "--space-12": "48px",
      "--section-y-desktop": "80px",
      "--section-y-tablet": "60px",
      "--section-y-phone": "42px",
      "--radius-sm": "4px",
      "--radius-md": "8px",
      "--radius-lg": "12px",
      "--radius-pill": "9999px",
      "--elev-flat": "none",
      "--elev-ring": "0 0 0 1px var(--border)",
      "--elev-raised": "0 24px 80px rgba(0, 0, 0, 0.42)",
      "--focus-ring": "0 0 0 4px rgba(56, 189, 248, 0.28)",
      "--motion-fast": "90ms",
      "--motion-base": "160ms",
      "--ease-standard": "cubic-bezier(0.2, 0, 0, 1)",
      "--container-max": "1320px",
      "--container-gutter-desktop": "36px",
      "--container-gutter-tablet": "24px",
      "--container-gutter-phone": "16px"
    },
    designMd: "# Trading Terminal Design System\n\n> Category: Themed & Unique\n> Bloomberg-style financial trading terminal. Dark-only, data-dense, cyan/coral buy/sell signals. Everything readable at a glance from two meters away.\n\n## 1. Visual Theme & Atmosphere\n\nA professional-grade financial data terminal. Dense, information-rich layouts designed for traders who need to monitor multiple markets simultaneously. Dark surfaces reduce eye strain during long sessions. Cyan accent (#00D4AA) signals positive/buy, coral (#FF4757) signals negative/sell. Everything readable at a glance from two meters away.\n\n- **Visual style:** dense, data-first, professional\n- **Color stance:** dark surfaces with high-contrast data colors\n- **Design intent:** keep outputs recognizable to this style family while preserving usability and readability\n\n### Prior Art\n\nBloomberg Terminal, Refinitiv Eikon, FactSet, TradingView Pro. All share: dark-only surfaces, monospace data fonts, tabular layouts with no decorative spacing, and color-coded buy/sell signals.\n\n## 2. Color Palette & Roles\n\n### Surface Palette\n\n| Token | Hex | Usage |\n|-------|-----|-------|\n| Background | `#0D0D0D` | Primary canvas |"
  },
  {
    id: "corporate",
    name: "Corporate",
    category: "Professional & Corporate",
    description: "Professional, brand-aligned design with structured grids, minimalist layouts, and consistent enterprise patterns.",
    tokens: {
      "--bg": "#f5f8ff",
      "--surface": "#ffffff",
      "--surface-warm": "#eaf1ff",
      "--fg": "#101828",
      "--fg-2": "#344054",
      "--muted": "#667085",
      "--meta": "#2563eb",
      "--border": "#d7e0ef",
      "--border-soft": "#edf2f8",
      "--accent": "#2563eb",
      "--accent-on": "#ffffff",
      "--accent-hover": "color-mix(in oklab, var(--accent), black 8%)",
      "--accent-active": "color-mix(in oklab, var(--accent), black 14%)",
      "--success": "#16a34a",
      "--warn": "#f59e0b",
      "--danger": "#ef4444",
      "--font-display": "Inter, system-ui, sans-serif",
      "--font-body": "Inter, system-ui, sans-serif",
      "--font-mono": '"SF Mono", ui-monospace, Menlo, monospace',
      "--text-xs": "12px",
      "--text-sm": "14px",
      "--text-base": "16px",
      "--text-lg": "18px",
      "--text-xl": "24px",
      "--text-2xl": "36px",
      "--text-3xl": "54px",
      "--text-4xl": "76px",
      "--leading-body": "1.52",
      "--leading-tight": "1.06",
      "--tracking-display": "-0.025em",
      "--space-1": "4px",
      "--space-2": "8px",
      "--space-3": "12px",
      "--space-4": "16px",
      "--space-5": "20px",
      "--space-6": "24px",
      "--space-8": "32px",
      "--space-12": "48px",
      "--section-y-desktop": "96px",
      "--section-y-tablet": "68px",
      "--section-y-phone": "48px",
      "--radius-sm": "10px",
      "--radius-md": "16px",
      "--radius-lg": "24px",
      "--radius-pill": "9999px",
      "--elev-flat": "none",
      "--elev-ring": "0 0 0 1px var(--border)",
      "--elev-raised": "0 20px 52px rgba(16, 24, 40, 0.11)",
      "--focus-ring": "0 0 0 4px rgba(37, 99, 235, 0.22)",
      "--motion-fast": "150ms",
      "--motion-base": "240ms",
      "--ease-standard": "cubic-bezier(0.2, 0, 0, 1)",
      "--container-max": "1180px",
      "--container-gutter-desktop": "36px",
      "--container-gutter-tablet": "24px",
      "--container-gutter-phone": "16px"
    },
    designMd: "# Design System Inspired by Corporate\n\n> Category: Professional & Corporate\n> Professional, brand-aligned design with structured grids, minimalist layouts, and consistent enterprise patterns.\n\n## 1. Visual Theme & Atmosphere\n\nProfessional, brand-aligned design with structured grids, minimalist layouts, and consistent enterprise patterns.\n\n- **Visual style:** enterprise, premium\n- **Color stance:** primary, neutral, success, warning, danger\n- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.\n\n## 2. Color\n\n- **Primary:** `#3B82F6` \u2014 Token from style foundations.\n- **Secondary:** `#8B5CF6` \u2014 Token from style foundations.\n- **Success:** `#16A34A` \u2014 Token from style foundations.\n- **Warning:** `#D97706` \u2014 Token from style foundations.\n- **Danger:** `#DC2626` \u2014 Token from style foundations.\n- **Surface:** `#FFFFFF` \u2014 Token from style foundations.\n- **Text:** `#111827` \u2014 Token from style foundations.\n- **Neutral:** `#FFFFFF` \u2014 Derived from the surface token for official format compatibility.\n\n- Favor Primary (#3B82F6) for CTA emphasis.\n- Use Surface (#FFFFFF) for large backgrounds and cards."
  },
  {
    id: "neon",
    name: "Neon",
    category: "Morphism & Effects",
    description: "Electric neon glow effects with high-contrast color pairings for bold, attention-grabbing interfaces.",
    tokens: {
      "--bg": "#070711",
      "--surface": "#111126",
      "--surface-warm": "#1e1540",
      "--fg": "#f8f7ff",
      "--fg-2": "#d6ccff",
      "--muted": "#9d8ad4",
      "--meta": "#c084fc",
      "--border": "#34265e",
      "--border-soft": "#241c42",
      "--accent": "#c084fc",
      "--accent-on": "#13051f",
      "--accent-hover": "color-mix(in oklab, var(--accent), black 8%)",
      "--accent-active": "color-mix(in oklab, var(--accent), black 14%)",
      "--success": "#39ff88",
      "--warn": "#fff34d",
      "--danger": "#ff4d8d",
      "--font-display": "Inter, system-ui, sans-serif",
      "--font-body": "Inter, system-ui, sans-serif",
      "--font-mono": '"SF Mono", ui-monospace, Menlo, monospace',
      "--text-xs": "12px",
      "--text-sm": "14px",
      "--text-base": "16px",
      "--text-lg": "18px",
      "--text-xl": "24px",
      "--text-2xl": "36px",
      "--text-3xl": "54px",
      "--text-4xl": "76px",
      "--leading-body": "1.52",
      "--leading-tight": "1.06",
      "--tracking-display": "-0.025em",
      "--space-1": "4px",
      "--space-2": "8px",
      "--space-3": "12px",
      "--space-4": "16px",
      "--space-5": "20px",
      "--space-6": "24px",
      "--space-8": "32px",
      "--space-12": "48px",
      "--section-y-desktop": "96px",
      "--section-y-tablet": "68px",
      "--section-y-phone": "48px",
      "--radius-sm": "10px",
      "--radius-md": "16px",
      "--radius-lg": "24px",
      "--radius-pill": "9999px",
      "--elev-flat": "none",
      "--elev-ring": "0 0 0 1px var(--border)",
      "--elev-raised": "0 24px 80px rgba(192, 132, 252, 0.22)",
      "--focus-ring": "0 0 0 4px rgba(192, 132, 252, 0.32)",
      "--motion-fast": "150ms",
      "--motion-base": "240ms",
      "--ease-standard": "cubic-bezier(0.2, 0, 0, 1)",
      "--container-max": "1180px",
      "--container-gutter-desktop": "36px",
      "--container-gutter-tablet": "24px",
      "--container-gutter-phone": "16px"
    },
    designMd: "# Design System Inspired by Neon\n\n> Category: Morphism & Effects\n> Electric neon glow effects with high-contrast color pairings for bold, attention-grabbing interfaces.\n\n## 1. Visual Theme & Atmosphere\n\nElectric neon glow effects with high-contrast color pairings for bold, attention-grabbing interfaces.\n\n- **Visual style:** high-contrast\n- **Color stance:** primary, secondary\n- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.\n\n## 2. Color\n\n- **Primary:** `#BBF351` \u2014 Token from style foundations.\n- **Secondary:** `#00BCFF` \u2014 Token from style foundations.\n- **Success:** `#16A34A` \u2014 Token from style foundations.\n- **Warning:** `#D97706` \u2014 Token from style foundations.\n- **Danger:** `#DC2626` \u2014 Token from style foundations.\n- **Surface:** `#FFFFFF` \u2014 Token from style foundations.\n- **Text:** `#111827` \u2014 Token from style foundations.\n- **Neutral:** `#FFFFFF` \u2014 Derived from the surface token for official format compatibility.\n\n- Favor Primary (#BBF351) for CTA emphasis.\n- Use Surface (#FFFFFF) for large backgrounds and cards.\n- Keep body copy on Text (#111827) for legibility.\n\n## 3. Typography\n\n- **Scale:** 14/16/18/24/32/40"
  }
];

// service/scaffold.ts
var PORT_SCAN_START = 5200;
var PORT_SCAN_END = 5999;
var INSTALL_TIMEOUT_MS = 18e4;
function scanOffset(start, end, offset) {
  const size = end - start + 1;
  if (size <= 0) return 0;
  const base = typeof offset === "number" && Number.isFinite(offset) ? Math.floor(offset) : Math.floor(Math.random() * size);
  return (base % size + size) % size;
}
async function findFreePort(start, end, offset) {
  const size = end - start + 1;
  if (size <= 0) return null;
  const from = scanOffset(start, end, offset);
  for (let step = 0; step < size; step += 1) {
    const port = start + (from + step) % size;
    if (await canBindPort(port)) return port;
  }
  return null;
}
function projectName(dir) {
  const base = path9.basename(path9.resolve(dir)).toLowerCase();
  const slug = base.replace(/[^a-z0-9._-]+/g, "-").replace(/^[-._]+|[-._]+$/g, "");
  if (!slug) return "design-project";
  return /^[a-z0-9]/.test(slug) ? slug : `design-${slug}`;
}
function esc(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function tail(text, n = 20) {
  const lines = text.trimEnd().split("\n");
  return lines.slice(Math.max(0, lines.length - n)).join("\n");
}
function packageJson(name, port) {
  return `${JSON.stringify(
    {
      name,
      private: true,
      version: "0.0.0",
      type: "module",
      scripts: {
        dev: `vite --host --strictPort --port ${port}`,
        build: "vite build",
        preview: `vite preview --host --strictPort --port ${port}`
      },
      devDependencies: { vite: "^5.4.0" }
    },
    null,
    2
  )}
`;
}
function indexHtml(name, brief) {
  const lede = brief ? esc(brief) : "Replace this hero with the brief&#39;s opening moment and keep every value a token.";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(name)}</title>
    <link rel="stylesheet" href="./tokens.css" />
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <header class="site-header">
      <span class="brand">${esc(name)}</span>
      <nav class="site-nav" aria-label="Primary">
        <a href="#hero">Start</a>
        <a href="#content">Content</a>
      </nav>
    </header>

    <main>
      <!-- HERO SLOT: the agent replaces this block with the brief's opening moment. -->
      <section class="hero" id="hero">
        <p class="eyebrow">Design project</p>
        <h1 class="hero__title">${esc(name)}</h1>
        <p class="hero__lede">${lede}</p>
        <div class="hero__actions">
          <a class="button button--primary" href="#content">Get started</a>
          <a class="button" href="#content">Learn more</a>
        </div>
      </section>

      <!-- CONTENT SLOT: sections for the brief go here. -->
      <section class="content" id="content" aria-label="Content">
        <h2>Content</h2>
        <p>Fill this area with the sections the brief calls for.</p>
      </section>
    </main>

    <footer class="site-footer">
      <p>Built with the Design Studio harness.</p>
    </footer>
  </body>
</html>
`;
}
var TOKENS_CSS = `/* tokens.css \u2014 the design system's single source of values.
   Every colour, space and type value in styles.css must come from here. */
:root {
  color-scheme: dark;

  /* Surfaces and ink */
  --bg: #0e1116;
  --surface: #161b22;
  --fg: #e6edf3;
  --muted: #8b949e;
  --border: #262d36;
  --accent: #4c8dff;

  /* Type */
  --font-sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --step--1: 0.875rem;
  --step-0: 1rem;
  --step-1: 1.25rem;
  --step-2: 1.563rem;
  --step-3: 1.953rem;
  --step-4: 2.441rem;
  --leading-tight: 1.15;
  --leading-body: 1.55;

  /* Space and shape */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 16px;
  --space-4: 24px;
  --space-5: 40px;
  --space-6: 64px;
  --radius: 10px;
  --measure: 68ch;
}
`;
var STYLES_CSS = `/* styles.css \u2014 base layer and the starter skeleton.
   Use tokens from tokens.css; a hardcoded value a token covers is a defect. */
*,
*::before,
*::after {
  box-sizing: border-box;
}

html {
  -webkit-text-size-adjust: 100%;
}

body {
  margin: 0;
  min-height: 100vh;
  background: var(--bg);
  color: var(--fg);
  font-family: var(--font-sans);
  font-size: var(--step-0);
  line-height: var(--leading-body);
  -webkit-font-smoothing: antialiased;
}

a {
  color: inherit;
}

:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.site-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--border);
}

.brand {
  font-weight: 600;
  letter-spacing: -0.01em;
}

.site-nav {
  display: flex;
  gap: var(--space-4);
}

.site-nav a {
  color: var(--muted);
  text-decoration: none;
}

.site-nav a:hover {
  color: var(--fg);
}

.hero {
  max-width: var(--measure);
  margin: 0 auto;
  padding: var(--space-6) var(--space-5);
}

.eyebrow {
  margin: 0 0 var(--space-2);
  color: var(--muted);
  font-size: var(--step--1);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.hero__title {
  margin: 0 0 var(--space-3);
  font-size: clamp(var(--step-3), 6vw, var(--step-4));
  line-height: var(--leading-tight);
  letter-spacing: -0.02em;
}

.hero__lede {
  margin: 0 0 var(--space-5);
  max-width: var(--measure);
  color: var(--muted);
  font-size: var(--step-1);
}

.hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 0 var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--fg);
  font: inherit;
  text-decoration: none;
}

.button--primary {
  border-color: transparent;
  background: var(--accent);
  color: var(--bg);
}

.content {
  max-width: var(--measure);
  margin: 0 auto;
  padding: 0 var(--space-5) var(--space-6);
  color: var(--muted);
}

.content h2 {
  color: var(--fg);
  font-size: var(--step-2);
}

.site-footer {
  padding: var(--space-5);
  border-top: 1px solid var(--border);
  color: var(--muted);
  font-size: var(--step--1);
}
`;
var DESIGN_MD = `# Design system

**This file and \`tokens.css\` are authoritative for this project.** Follow them over
any conflicting instinct. Do not invent colours, spacing or type values that are
not expressed as tokens; a hardcoded value a token already covers is a defect.

## Tokens

The single source of values is \`tokens.css\`:
\`--bg\`, \`--surface\`, \`--fg\`, \`--muted\`, \`--border\`, \`--accent\`, the type
steps (\`--step-*\`), and the space scale (\`--space-*\`).

## Rules for every screen

- Colour comes from the tokens above; no ad-hoc hex values.
- Type comes from the modular scale; no invented sizes.
- Spacing comes from \`--space-*\`; no magic numbers.
- Every interactive element has a visible \`:focus-visible\` treatment and a 44px
  touch target.
- Render data surfaces in all five states: Loading, Empty, Error, Populated, Edge.
`;
var AUTHORITY_STATEMENT = `## Authority

**This file and \`tokens.css\` are authoritative for this project.** Follow them over
any conflicting instinct. Do not invent colours, spacing or type values that are
not expressed as tokens; a hardcoded value a token already covers is a defect.

## Rules for every screen

- Colour comes from the tokens in \`tokens.css\`; no ad-hoc hex values.
- Type comes from the scale; no invented sizes.
- Spacing comes from the space tokens; no magic numbers.
- Every interactive element has a visible \`:focus-visible\` treatment and a 44px
  touch target.
- Render data surfaces in all five states: Loading, Empty, Error, Populated, Edge.
`;
function resolveDesignSystem(id) {
  if (typeof id !== "string") return null;
  const wanted = id.trim();
  if (!wanted) return null;
  return DESIGN_SYSTEMS.find((preset) => preset.id === wanted) ?? null;
}
function presetTokensCss(preset) {
  const decls = Object.entries(preset.tokens).map(([name, value]) => `  ${name}: ${value};`).join("\n");
  return `/* tokens.css \u2014 ${preset.name} design system (id: ${preset.id}).
   Every colour, space and type value in styles.css must come from here. */
:root {
${decls}
}
`;
}
function presetDesignMd(preset) {
  return `${preset.designMd.trimEnd()}

${AUTHORITY_STATEMENT}`;
}
async function scaffoldProject(options) {
  const dir = options.dir;
  if (!path9.isAbsolute(dir)) return { ok: false, error: "dir must be an absolute path" };
  if (typeof options.type !== "string" || options.type.trim() === "") {
    return { ok: false, error: "type must be a non-empty string" };
  }
  try {
    await fs7.mkdir(dir, { recursive: true });
  } catch (error) {
    return { ok: false, error: `could not create ${dir}: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (await resolveConfigPath(dir) !== null) {
    return { ok: false, error: "a design project already exists here" };
  }
  const range = options.portRange ?? { start: PORT_SCAN_START, end: PORT_SCAN_END };
  const port = await findFreePort(range.start, range.end, range.offset);
  if (port === null) {
    return { ok: false, error: `no free loopback port in ${range.start}..${range.end}` };
  }
  const url = `http://localhost:${port}/`;
  const name = projectName(dir);
  const brief = typeof options.brief === "string" ? options.brief.trim() : "";
  const direction = options.direction && options.direction.trim() ? options.direction.trim() : "auto";
  const fidelity = options.fidelity && options.fidelity.trim() ? options.fidelity.trim() : "hi-fi";
  const preset = resolveDesignSystem(options.designSystemId);
  const harness = { direction, fidelity };
  if (preset) harness.designSystem = preset.id;
  const config = {
    version: 1,
    name,
    type: options.type.trim(),
    url,
    command: "npm run dev",
    entry: "index.html",
    harness
  };
  const files = [
    ["package.json", packageJson(name, port)],
    ["index.html", indexHtml(name, brief)],
    ["tokens.css", preset ? presetTokensCss(preset) : TOKENS_CSS],
    ["styles.css", STYLES_CSS],
    ["DESIGN.md", preset ? presetDesignMd(preset) : DESIGN_MD]
  ];
  const written = [];
  try {
    await fs7.writeFile(path9.join(dir, DEFAULT_CONFIG_PATH), `${JSON.stringify(config, null, 2)}
`, "utf8");
    written.push(DEFAULT_CONFIG_PATH);
  } catch (error) {
    return { ok: false, error: `could not write project files: ${error instanceof Error ? error.message : String(error)}` };
  }
  try {
    for (const [rel, content] of files) {
      await fs7.writeFile(path9.join(dir, rel), content, "utf8");
      written.push(rel);
    }
  } catch (error) {
    return { ok: false, error: `could not write project files: ${error instanceof Error ? error.message : String(error)}` };
  }
  try {
    const plugin = await writeHarnessPlugin(dir);
    written.push(plugin.path);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "could not write harness plugin" };
  }
  if (options.install !== false) {
    const hasModules = await fs7.stat(path9.join(dir, "node_modules")).then((s) => s.isDirectory()).catch(() => false);
    if (!hasModules) {
      const installed = await runNpmInstall(dir);
      if (!installed.ok) return { ok: false, error: installed.error };
    }
  }
  if (options.boot !== false) {
    if (!isLoopbackUrl(url)) return { ok: false, error: `scaffolded URL is not loopback: ${url}` };
    const dev = await ensureDevServer(url, { dir });
    if (!dev.up) return { ok: false, error: dev.error ?? `the dev server did not come up at ${url}` };
  }
  return { ok: true, url, files: written };
}
async function runNpmInstall(dir) {
  return new Promise((resolve) => {
    let output = "";
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    let child;
    try {
      child = spawn3("npm", ["install", "--no-audit", "--no-fund"], { cwd: dir, shell: false });
    } catch (error) {
      finish({ ok: false, error: `could not run npm install: ${error instanceof Error ? error.message : String(error)}` });
      return;
    }
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish({ ok: false, error: `npm install timed out after ${Math.round(INSTALL_TIMEOUT_MS / 1e3)}s
${tail(output)}` });
    }, INSTALL_TIMEOUT_MS);
    child.stdout?.on("data", (chunk) => {
      output += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      output += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      finish({ ok: false, error: `could not run npm install: ${error.message}` });
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) finish({ ok: true });
      else finish({ ok: false, error: `npm install failed (exit code ${code})
${tail(output)}` });
    });
  });
}

// service/main.ts
var PORT = Number(process.env.OPENCHAMBER_SERVICE_PORT ?? 0);
var TOKEN = process.env.OPENCHAMBER_SERVICE_TOKEN ?? "";
if (!PORT || !TOKEN) {
  console.error("[design-studio] missing OPENCHAMBER_SERVICE_PORT or OPENCHAMBER_SERVICE_TOKEN");
  process.exit(1);
}
function sendJson2(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(text),
    "cache-control": "no-store"
  });
  res.end(text);
}
async function readBody2(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}
async function requireFile(root, rel) {
  const abs = path10.resolve(root, rel);
  const rootAbs = path10.resolve(root);
  if (abs !== rootAbs && !abs.startsWith(rootAbs + path10.sep)) return null;
  try {
    const stat = await fs8.stat(abs);
    return stat.isFile() ? abs : null;
  } catch {
    return null;
  }
}
async function newestMtime(dir, entryAbs) {
  let newest = 0;
  try {
    newest = (await fs8.stat(entryAbs)).mtimeMs;
  } catch {
  }
  try {
    const names = await fs8.readdir(dir, { withFileTypes: true });
    for (const entry of names) {
      if (!entry.isFile()) continue;
      try {
        const stat = await fs8.stat(path10.join(dir, entry.name));
        if (stat.mtimeMs > newest) newest = stat.mtimeMs;
      } catch {
      }
    }
  } catch {
  }
  return newest;
}
var server = http.createServer(async (req, res) => {
  const auth = req.headers["authorization"];
  if (auth !== `Bearer ${TOKEN}`) {
    sendJson2(res, 401, { error: "unauthorized" });
    return;
  }
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  const params = url.searchParams;
  try {
    if (req.method === "POST" && url.pathname === BROWSER_PROVIDER_PATH) {
      const body = await readBody2(req);
      const result = await handleBrowserControl(req, body);
      sendJson2(res, 200, result);
      return;
    }
    if (url.pathname === "/verify" || url.pathname.startsWith("/verify/")) {
      if (await handleVerifyRequest(req, res)) return;
    }
    if (url.pathname === "/harness") {
      if (req.method !== "POST") {
        sendJson2(res, 405, { error: "POST required" });
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(await readBody2(req));
      } catch {
        sendJson2(res, 400, { error: "body must be JSON" });
        return;
      }
      const dir = parsed?.dir;
      if (typeof dir !== "string" || !path10.isAbsolute(dir)) {
        sendJson2(res, 400, { error: "dir must be an absolute project path" });
        return;
      }
      try {
        sendJson2(res, 200, await writeHarnessPlugin(dir));
      } catch (error) {
        sendJson2(res, 400, { error: error instanceof Error ? error.message : "could not write harness plugin" });
      }
      return;
    }
    if (url.pathname === "/reference") {
      if (req.method !== "POST") {
        sendJson2(res, 405, { error: "POST required" });
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(await readBody2(req));
      } catch {
        sendJson2(res, 400, { error: "body must be JSON" });
        return;
      }
      const body = parsed;
      if (typeof body?.dir !== "string" || typeof body.path !== "string") {
        sendJson2(res, 400, { error: "dir and path must be strings. Paste an accessible file path." });
        return;
      }
      try {
        sendJson2(res, 200, { ...await resolveReferencePath(body.dir, body.path) });
      } catch (error) {
        sendJson2(res, 400, { error: error instanceof Error ? error.message : "could not validate file path" });
      }
      return;
    }
    if (url.pathname === "/files") {
      if (req.method !== "POST") {
        sendJson2(res, 405, { error: "POST required" });
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(await readBody2(req));
      } catch {
        sendJson2(res, 400, { error: "body must be JSON" });
        return;
      }
      const body = parsed;
      const dir = body?.dir;
      if (typeof dir !== "string" || !path10.isAbsolute(dir)) {
        sendJson2(res, 400, { error: "dir must be an absolute project path" });
        return;
      }
      const limit = body?.limit;
      if (limit !== void 0 && (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1)) {
        sendJson2(res, 400, { error: "limit must be a positive integer" });
        return;
      }
      try {
        sendJson2(res, 200, { ok: true, files: await listProjectFiles(dir, limit) });
      } catch (error) {
        sendJson2(res, 200, { ok: false, error: error instanceof Error ? error.message : "could not list files" });
      }
      return;
    }
    if (url.pathname === "/scaffold") {
      if (req.method !== "POST") {
        sendJson2(res, 405, { error: "POST required" });
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(await readBody2(req));
      } catch {
        sendJson2(res, 400, { error: "body must be JSON" });
        return;
      }
      const body = parsed;
      const dir = body?.dir;
      const type = body?.type;
      if (typeof dir !== "string" || !path10.isAbsolute(dir)) {
        sendJson2(res, 400, { error: "dir must be an absolute project path" });
        return;
      }
      if (typeof type !== "string" || type.trim() === "") {
        sendJson2(res, 400, { error: "type must be a non-empty string" });
        return;
      }
      if (body?.designSystemId !== void 0 && typeof body.designSystemId !== "string") {
        sendJson2(res, 400, { error: "designSystemId must be a string" });
        return;
      }
      const str = (value) => typeof value === "string" ? value : void 0;
      sendJson2(
        res,
        200,
        await scaffoldProject({
          dir,
          type,
          direction: str(body?.direction),
          fidelity: str(body?.fidelity),
          brief: str(body?.brief),
          designSystemId: str(body?.designSystemId)
        })
      );
      return;
    }
    if (url.pathname === "/server/start") {
      if (req.method !== "POST") {
        sendJson2(res, 405, { error: "POST required" });
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(await readBody2(req));
      } catch {
        sendJson2(res, 400, { error: "body must be JSON" });
        return;
      }
      const dir = parsed?.dir;
      if (typeof dir !== "string" || !path10.isAbsolute(dir)) {
        sendJson2(res, 400, { error: "dir must be an absolute project path" });
        return;
      }
      const targetUrl = parsed?.url;
      if (typeof targetUrl !== "string" || targetUrl === "") {
        sendJson2(res, 400, { error: "url is required" });
        return;
      }
      if (!isLoopbackUrl(targetUrl)) {
        sendJson2(res, 400, { error: "url must be a loopback address" });
        return;
      }
      try {
        const { config } = await readStudioConfig(dir);
        if (!config?.url?.trim()) {
          sendJson2(res, 200, { ok: false, started: false, up: false, error: "no .design-studio.json url found" });
          return;
        }
        const configuredUrl = config.url.trim();
        if (!isLoopbackUrl(configuredUrl)) {
          sendJson2(res, 200, { ok: false, started: false, up: false, error: "configured url is not loopback" });
          return;
        }
        const result = await ensureDevServer(configuredUrl, { dir, ownedOnly: true });
        sendJson2(res, 200, { ok: result.up, started: result.started, up: result.up, error: result.error });
      } catch (error) {
        sendJson2(res, 200, { ok: false, started: false, up: false, error: error instanceof Error ? error.message : "could not start the dev server" });
      }
      return;
    }
    if (url.pathname === "/server/stop") {
      if (req.method !== "POST") {
        sendJson2(res, 405, { error: "POST required" });
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(await readBody2(req));
      } catch {
        sendJson2(res, 400, { error: "body must be JSON" });
        return;
      }
      const dir = parsed?.dir;
      if (typeof dir !== "string" || !path10.isAbsolute(dir)) {
        sendJson2(res, 400, { error: "dir must be an absolute project path" });
        return;
      }
      try {
        const result = await stopDevServer(dir);
        sendJson2(
          res,
          200,
          result.error ? { ok: false, stopped: result.stopped, error: result.error } : { ok: true, stopped: result.stopped }
        );
      } catch (error) {
        sendJson2(res, 200, { ok: false, error: error instanceof Error ? error.message : "could not stop the dev server" });
      }
      return;
    }
    if (url.pathname === "/server/status") {
      const dir = params.get("dir") ?? "";
      if (!path10.isAbsolute(dir)) {
        sendJson2(res, 400, { error: "dir must be absolute" });
        return;
      }
      try {
        sendJson2(res, 200, await getDevServerStatus(dir));
      } catch (error) {
        sendJson2(res, 200, { up: false, port: null, error: error instanceof Error ? error.message : "could not read server status" });
      }
      return;
    }
    if (url.pathname === "/health") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
      return;
    }
    if (url.pathname === "/stat") {
      const root = params.get("dir") ?? "";
      const entry = params.get("path") ?? "";
      if (!path10.isAbsolute(root)) {
        sendJson2(res, 400, { error: "dir must be absolute" });
        return;
      }
      const abs = await requireFile(root, entry);
      if (!abs) {
        sendJson2(res, 404, { error: "entry not found" });
        return;
      }
      const dir = path10.dirname(abs);
      sendJson2(res, 200, { mtime: await newestMtime(dir, abs) });
      return;
    }
    if (url.pathname === "/state") {
      const target = getBrowser();
      if (!target) {
        sendJson2(res, 200, { url: "", title: "", lastPick: null, pickSeq: 0, windowOpen: false });
        return;
      }
      sendJson2(res, 200, await target.state());
      return;
    }
    if (url.pathname === "/open") {
      if (req.method !== "POST") {
        sendJson2(res, 405, { error: "POST required" });
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(await readBody2(req));
      } catch {
        sendJson2(res, 400, { error: "body must be JSON" });
        return;
      }
      const body = parsed;
      const target = body?.url;
      if (typeof target !== "string" || target === "") {
        sendJson2(res, 400, { error: "url is required" });
        return;
      }
      const dir = typeof body?.dir === "string" && body.dir !== "" ? body.dir : null;
      if (dir && !path10.isAbsolute(dir)) {
        sendJson2(res, 400, { error: "dir must be absolute" });
        return;
      }
      let started = false;
      if (dir || isLoopbackUrl(target)) {
        const dev = await ensureDevServer(target, { dir: dir ?? void 0 });
        if (!dev.up) {
          sendJson2(res, 200, { ok: false, error: dev.error ?? "the dev server is not available" });
          return;
        }
        started = dev.started;
      }
      try {
        const browser2 = await ensureBrowser(target);
        const nav = await browser2.open(target);
        sendJson2(res, 200, { ok: true, url: nav.url, title: nav.title, settled: nav.settled, started });
      } catch (error) {
        sendJson2(res, 200, { ok: false, error: error instanceof Error ? error.message : "open failed" });
      }
      return;
    }
    if (url.pathname === "/close") {
      if (req.method !== "POST") {
        sendJson2(res, 405, { error: "POST required" });
        return;
      }
      const browser2 = getBrowser();
      if (browser2) await browser2.close();
      try {
        await reapOrphanChrome();
      } catch {
      }
      sendJson2(res, 200, { ok: true });
      return;
    }
    if (url.pathname === "/highlight") {
      if (req.method !== "POST") {
        sendJson2(res, 405, { error: "POST required" });
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(await readBody2(req));
      } catch {
        sendJson2(res, 400, { error: "body must be JSON" });
        return;
      }
      const selector = parsed?.selector;
      if (typeof selector !== "string" || selector === "") {
        sendJson2(res, 400, { error: "selector is required" });
        return;
      }
      const browser2 = getBrowser();
      if (!browser2) {
        sendJson2(res, 200, { ok: false, error: "no live window is open" });
        return;
      }
      try {
        const highlighted = await browser2.highlight(selector);
        if (!highlighted) {
          sendJson2(res, 200, { ok: false, error: "selector did not match any element" });
          return;
        }
        sendJson2(res, 200, { ok: true });
      } catch (error) {
        sendJson2(res, 200, { ok: false, error: error instanceof Error ? error.message : "highlight failed" });
      }
      return;
    }
    if (url.pathname === "/focus") {
      if (req.method !== "POST") {
        sendJson2(res, 405, { error: "POST required" });
        return;
      }
      const browser2 = getBrowser();
      if (browser2) await browser2.focus();
      sendJson2(res, 200, { ok: true });
      return;
    }
    if (url.pathname === "/config") {
      const root = params.get("dir") ?? "";
      if (!path10.isAbsolute(root)) {
        sendJson2(res, 400, { error: "dir must be absolute" });
        return;
      }
      if (req.method === "PUT") {
        const body = await readBody2(req);
        let parsed;
        try {
          parsed = JSON.parse(body);
        } catch {
          sendJson2(res, 400, { error: "body must be JSON" });
          return;
        }
        if (typeof parsed.text !== "string") {
          sendJson2(res, 400, { error: "text is required" });
          return;
        }
        try {
          sendJson2(res, 200, { ...await writeStudioConfig(root, parsed.path ?? null, parsed.text) });
        } catch (error) {
          sendJson2(res, 400, { error: error instanceof Error ? error.message : "invalid config" });
        }
        return;
      }
      sendJson2(res, 200, { ...await readStudioConfig(root) });
      return;
    }
    sendJson2(res, 404, { error: "not found" });
  } catch (error) {
    sendJson2(res, 500, { error: error instanceof Error ? error.message : "internal error" });
  }
});
server.listen(PORT, "127.0.0.1", () => {
  console.log(`[design-studio] service listening on 127.0.0.1:${PORT}`);
});
var shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    await stopBrowser();
  } catch {
  }
  process.exit(0);
}
process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});
