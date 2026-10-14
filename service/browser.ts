// A real Chrome driven over the DevTools Protocol.
//
// Node 24 ships a global `WebSocket`, so the CDP transport is implemented here
// with no npm dependency. Chrome is launched with a throwaway profile and a
// random debugging port; we read the port from `<profile>/DevToolsActivePort`,
// ask `/json/version` for the browser socket, then attach to the existing app
// window's page target.
//
// There is one launch mode: a real, chromeless, user-positionable headful
// `--app` window opened in incognito with extensions off. The in-panel
// screencast surface is gone, so there are no frames to stream and no headless
// mode: the window IS the live view. The agent still gets deterministic PNG
// stills through `capture()`.
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { SurfaceInputEvent, SurfaceModifiers } from '@openchamber/sdk';

import { PROBE_EXPR, PROBE_SCRIPT } from '../shared/probe-script.ts';
import type { ProbeReport } from '../shared/verify-types.ts';
import { startViewerServer } from './viewer-server.ts';
import { ArtifactContexts } from './artifact-context.ts';
import type { ShellAuthority, DefaultContext } from './artifact-context.ts';
import type { ViewerPage } from './viewer-ui.ts';

const CHROME_PATH =
  process.env.DS_CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const VIEWPORT_WIDTH = 1280;
const VIEWPORT_HEIGHT = 800;
const CDP_TIMEOUT_MS = 30_000;
const NAVIGATE_TIMEOUT_MS = 30_000;
const LAUNCH_TIMEOUT_MS = 20_000;

/** App-window geometry, `DS_WINDOW` = "x,y,w,h". */
export type WindowSpec = { x: number; y: number; width: number; height: number };

// 80,80 keeps the window clear of the macOS menu bar/notch corner; 1280x800 is
// a common desktop size that fits every screen this tool targets.
const DEFAULT_WINDOW: WindowSpec = { x: 80, y: 80, width: 1280, height: 800 };
// Floor for placeWindow()/setWindowBounds sizes: Chrome misbehaves on slivers,
// and a two-pixel window is useless for design review. Positions are NOT
// floored — macOS allows negative coordinates (offscreen test windows).
const MIN_WINDOW_EDGE = 200;

// Chrome backgrounds, timer-throttles and (on macOS) occlusion-culls windows it
// considers hidden. This is the flag set vscode/AFFiNE/qwen-code ship for
// exactly that reason; a design-review window the user is not looking at should
// still settle and capture reliably.
const ANTI_THROTTLE_FLAGS = [
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling',
  '--disable-features=CalculateNativeWinOcclusion',
];

function parseWindowSpec(raw: string | undefined): WindowSpec | null {
  if (!raw) return null;
  const parts = raw.split(',').map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [x, y, width, height] = parts;
  return { x: x ?? 0, y: y ?? 0, width: width ?? 0, height: height ?? 0 };
}

// Kept only so browser-control.ts's wheel helper can size its scroll steps; the
// screencast path that used to fill frames with JPEG is gone, so it is always
// null now and callers fall back to the viewport size.
/**
 * True when `url` has a scheme Chrome's `--app` window actually honours.
 *
 * `--app=<url>` yields a chromeless window ONLY when the URL is a valid GURL
 * with a web-safe scheme (http/https/file). For any other scheme (notably
 * `about:blank`) Chromium's `MaybeLaunchAppShortcutWindow`
 * (chrome/browser/ui/startup/startup_browser_creator.cc) returns false and
 * silently falls back to a NORMAL window with tabs and an omnibox. The live
 * view is always a local dev server, so only http/https are accepted here.
 */
export function isWebSafeUrl(url: string): boolean {
  try {
    const protocol = new URL(url).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * The exact Chrome argv for the live window. Pure and exported so a test can
 * pin the privacy/chromeless contract without launching Chrome.
 *
 * `--app=<url>` creates the window directly at the target (and no positional
 * URL: that would open a SECOND window). The URL MUST be web-safe or Chrome
 * silently falls back to a tabbed window, so a non-http(s) URL is refused here
 * as defense in depth (start() rejects it first, before spawning). `--incognito`
 * is, per Chromium docs, unsupported together with `--app`, but it works on
 * Chrome 155 (measured `window.outerHeight - window.innerHeight = 28`,
 * `display-mode: standalone`), so it stays — the web-safe URL guard is the real
 * fix.
 */
export function buildLaunchArgs(spec: WindowSpec, profile: string, url: string): string[] {
  if (!isWebSafeUrl(url)) {
    throw new Error(`refusing to launch the --app window at a non-http(s) URL: ${url}`);
  }
  // The live view is a real, chromeless, incognito `--app` window with
  // extensions off and a throwaway profile. `--app=<url>` creates the window
  // directly at the target, so target acquisition attaches to the existing
  // target instead of opening anything new.
  return [
    `--app=${url}`,
    '--incognito',
    '--disable-extensions',
    '--remote-debugging-port=0',
    '--no-first-run',
    '--no-default-browser-check',
    `--window-size=${spec.width},${spec.height}`,
    `--window-position=${spec.x},${spec.y}`,
    `--user-data-dir=${profile}`,
    ...ANTI_THROTTLE_FLAGS,
  ];
}

export type BrowserFrame = {
  jpeg: Buffer;
  seq: number;
  width: number;
  height: number;
};

export type PickedElement = {
  selector: string;
  tag: string;
  classes: string;
  text: string;
  outerHTML: string;
  styles: Record<string, string>;
  rect: { x: number; y: number; width: number; height: number };
};

export type BrowserState = {
  url: string;
  title: string;
  lastPick: PickedElement | null;
  pickSeq: number;
  /** True while the live Chrome window process is up; false once it has exited. */
  windowOpen: boolean;
};

// ProbeElement / ProbeReport are single-sourced in shared/verify-types.ts; the
// in-page probe (shared/probe-script.ts) produces exactly that shape.

/** CSS that freezes animations/transitions and hides the text caret for a shot. */
const STABLE_STYLE =
  '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';

function emptyProbeReport(): ProbeReport {
  return {
    scrollWidth: 0,
    clientWidth: 0,
    innerWidth: 0,
    innerHeight: 0,
    scrollHeight: 0,
    cls: 0,
    selectors: [],
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function openSocket(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const onError = (): void => reject(new Error(`failed to open CDP socket at ${url}`));
    ws.addEventListener(
      'open',
      () => {
        ws.removeEventListener('error', onError);
        resolve(ws);
      },
      { once: true },
    );
    ws.addEventListener('error', onError, { once: true });
  });
}

type CdpHandler = (params: Record<string, unknown>, sessionId?: string) => void;

type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

/** Minimal CDP client: id-keyed requests, a tiny event emitter, timeouts. */
class CdpClient {
  private readonly ws: WebSocket;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private readonly handlers = new Map<string, Set<CdpHandler>>();
  private closed = false;
  private closeError: Error | null = null;

  constructor(ws: WebSocket) {
    this.ws = ws;
    ws.addEventListener('message', (event) => this.onMessage(event));
    ws.addEventListener('close', () => this.onClose(new Error('CDP socket closed')));
    ws.addEventListener('error', () => this.onClose(new Error('CDP socket error')));
  }

  private onMessage(event: MessageEvent): void {
    let message: Record<string, unknown>;
    try {
      const raw = typeof event.data === 'string' ? event.data : String(event.data);
      message = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }
    const id = message.id;
    if (typeof id === 'number' && this.pending.has(id)) {
      const entry = this.pending.get(id)!;
      this.pending.delete(id);
      clearTimeout(entry.timer);
      const error = message.error as { message?: string } | undefined;
      if (error) entry.reject(new Error(`CDP error: ${error.message ?? 'unknown'}`));
      else entry.resolve(message.result);
      return;
    }
    const method = message.method;
    if (typeof method === 'string') {
      const set = this.handlers.get(method);
      if (!set) return;
      const params = (message.params ?? {}) as Record<string, unknown>;
      const sessionId = typeof message.sessionId === 'string' ? message.sessionId : undefined;
      for (const handler of set) handler(params, sessionId);
    }
  }

  private onClose(error: Error): void {
    if (this.closed) return;
    this.closed = true;
    this.closeError = error;
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    this.pending.clear();
  }

  send(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<Record<string, unknown>> {
    if (this.closed) return Promise.reject(this.closeError ?? new Error('CDP closed'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, CDP_TIMEOUT_MS);
      this.pending.set(id, { resolve: resolve as Pending['resolve'], reject, timer });
      this.ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
    });
  }

  on(method: string, handler: CdpHandler): () => void {
    let set = this.handlers.get(method);
    if (!set) {
      set = new Set();
      this.handlers.set(method, set);
    }
    set.add(handler);
    const current = set;
    return () => current.delete(handler);
  }

  close(): void {
    this.onClose(new Error('CDP closed'));
    try {
      this.ws.close();
    } catch {
      /* already closing */
    }
  }
}

/**
 * The sibling loopback literal for a local URL, or `null`. macOS dev servers
 * commonly bind IPv6 (`[::1]`) while Chrome resolves `localhost` to IPv4, so a
 * failed localhost load is retried against the other literal once.
 */
export function otherLoopback(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const host = url.hostname;
  if (host === 'localhost' || host === '127.0.0.1') url.hostname = '[::1]';
  else if (host === '[::1]' || host === '::1') url.hostname = '127.0.0.1';
  else return null;
  return url.toString();
}

function once(cdp: CdpClient, method: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const off = cdp.on(method, () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      off();
      resolve(true);
    });
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      off();
      resolve(false);
    }, timeoutMs);
  });
}

function modifierBits(modifiers: SurfaceModifiers): number {
  let bits = 0;
  if (modifiers.alt) bits |= 1;
  if (modifiers.ctrl) bits |= 2;
  if (modifiers.meta) bits |= 4;
  if (modifiers.shift) bits |= 8;
  return bits;
}

function buttonName(button: number): string {
  if (button === 0) return 'left';
  if (button === 1) return 'middle';
  if (button === 2) return 'right';
  return 'none';
}

/**
 * Injected into every new document. A pick is a GESTURE, not a mode: hold Cmd
 * (macOS `metaKey`) or Ctrl and click an element in the live window. The click
 * is swallowed in the capture phase and reported through the CDP binding
 * `window.__dsPick`; a plain click is left untouched so the page navigates
 * normally. There is deliberately NO toggle (`__dsSetPick` is gone).
 *
 * Feedback: so the user can SEE what a modified click would choose, while the
 * modifier is held this script draws a transient outline (`#__ds-pick-outline`)
 * over whatever the pointer is over and switches the document cursor to a
 * crosshair; a completed pick keeps the outline on the chosen element in a
 * different colour. This is NOT an "overlay wrapper": it never wraps or copies
 * the page. It is a SINGLE `position: fixed`, `pointer-events: none` element,
 * created/positioned lazily on hover, hidden the moment the modifier is
 * released, and excluded from the verification probe via `data-ds-overlay`.
 * Being fixed with pointer events off, it cannot shift layout or steal input.
 */
export const PICK_SCRIPT = `(() => {
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

const ARTIFACT_BRIDGE = `(() => {
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
const ARTIFACT_SCRIPTS = `if(window!==top && (window.__dsTrustedArtifact || window.name==='__dsArtifact')){${ARTIFACT_BRIDGE}\n${PICK_SCRIPT}\nif(!window.__dsProbe){${PROBE_SCRIPT}}}`;
const SHELL_BRIDGE = `(() => {
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

function validPick(value: unknown): value is PickedElement {
  if(!value || typeof value!=='object')return false;
  const item=value as PickedElement;
  for(const [key,max] of [['selector',2048],['tag',64],['classes',2048],['text',200],['outerHTML',4000]] as const)if(typeof item[key]!=='string'||item[key].length>max)return false;
  if(!item.selector||!item.tag||!item.styles||typeof item.styles!=='object'||Array.isArray(item.styles)||Object.keys(item.styles).length>32)return false;
  if(Object.entries(item.styles).some(([key,text])=>key.length>64||typeof text!=='string'||text.length>2048))return false;
  return !!item.rect && ['x','y','width','height'].every(key=>Number.isFinite(item.rect[key as keyof typeof item.rect])&&Math.abs(item.rect[key as keyof typeof item.rect])<=1e7)&&item.rect.width>=0&&item.rect.height>=0;
}

/**
 * Kill every leftover Chrome process this extension owns — one whose command
 * line carries a `ds-chrome-` throwaway profile under the OS temp dir — and
 * remove those temp profile dirs. `POST /close` calls this so OFF (or a manual
 * close) never leaves a window behind, even one a previous service instance
 * launched and no longer tracks.
 *
 * Loopback/safe: only processes whose command line matches the
 * `ds-chrome-`-prefixed profile under the OS temp dir are touched, and only
 * those profile dirs are removed.
 */
export async function reapOrphanChrome(): Promise<void> {
  const prefix = path.join(tmpdir(), 'ds-chrome-');
  let stdout: string;
  try {
    ({ stdout } = await new Promise<{ stdout: string }>((resolve, reject) => {
      execFile('ps', ['-ax', '-o', 'pid=,command='], { maxBuffer: 8 * 1024 * 1024 }, (error, out) => {
        if (error) reject(error);
        else resolve({ stdout: String(out) });
      });
    }));
  } catch {
    return; // ps unavailable: nothing we can safely enumerate
  }

  const pids: number[] = [];
  const profiles = new Set<string>();
  for (const line of stdout.split('\n')) {
    if (!line.includes(prefix)) continue;
    const pidMatch = line.match(/^\s*(\d+)\s/);
    if (!pidMatch) continue;
    const pid = Number(pidMatch[1]);
    if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) continue;
    pids.push(pid);
    // Only the ds-chrome- prefix under the OS temp dir is ever removed.
    const dirMatch = line.match(/--user-data-dir=(\S+)/);
    if (dirMatch && dirMatch[1] && path.resolve(dirMatch[1]).startsWith(prefix)) {
      profiles.add(dirMatch[1]);
    }
  }

  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      /* already gone */
    }
  }
  for (const profile of profiles) {
    await fs.rm(profile, { recursive: true, force: true }).catch(() => {
      /* best effort */
    });
  }
}

export class Browser {
  private layoutState:{mode:'fit'|'page'|'viewport';preset:string;nominalHeight:number;reason?:string}={mode:'page',preset:'desktop',nominalHeight:800};
  private layoutGeneration=0;
  private layoutQueued=false;
  private layoutDirty=false;
  private layoutContext:DefaultContext|null=null;
  private captureInFlight=false;
  private pendingNavigation: {previous:DefaultContext;target:string;sameDocumentVersion:number;responded:boolean;loaderId?:string}|null=null;
  private viewer: Awaited<ReturnType<typeof startViewerServer>> | null = null;
  private contexts: ArtifactContexts | null = null;
  private pages: ViewerPage[] = [];
  private artifactUrl = '';
  private artifactTitle = '';
  private requestedUrl = '';
  private canvasFlags = { menu:false, pan:false };
  private operationTail: Promise<unknown> = Promise.resolve();
  private refreshing = false;
  private canvasError = '';
  private chrome: ChildProcess | null = null;
  private cdp: CdpClient | null = null;
  private profileDir: string | null = null;
  private sessionId: string | null = null;
  private targetId: string | null = null;
  private lastPick: PickedElement | null = null;
  private pickSeq = 0;
  private viewportWidth = VIEWPORT_WIDTH;
  private viewportHeight = VIEWPORT_HEIGHT;
  private starting: Promise<void> | null = null;
  private windowSpec: WindowSpec;
  /**
   * URL the window is launched at. Set only when a launch actually happens; it
   * is never `about:blank`, because `--app` requires a web-safe URL.
   */
  private launchUrl: string | null = null;
  /** DevTools HTTP port, for the `/json/list` diagnostics helper. */
  private debuggingPort: number | null = null;
  /** Set when the Chrome child exits on its own; drives `windowOpen`. */
  private closedAt: number | null = null;
  /** True while an observed/intentional close is tearing Chrome down. */
  private quitting = false;
  /** The in-flight teardown, so a second close (or stop) joins it instead of racing. */
  private quitPromise: Promise<void> | null = null;

  constructor() {
    // Captured at construct time: tests pin DS_WINDOW before constructing, and
    // the service picks the user's placement up once, at first use.
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
  async start(url?: string): Promise<void> {
    if (this.closedAt !== null) {
      // The previous window died on its own; clear the corpse before relaunch.
      await this.stop();
    }
    // A running window is reused. Do NOT validate `url` here: a later
    // `navigate()` may legitimately go to a data:/about: page, and the launch
    // guard applies only when this call actually spawns Chrome.
    if (this.cdp) return;
    if (url === undefined) {
      throw new Error('no live window is open and no URL was provided to launch one');
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

  private async launch(): Promise<void> {
    if (!isWebSafeUrl(this.requestedUrl)) {
      throw new Error('launch() needs a web-safe --app URL');
    }
    this.viewer = await startViewerServer({url:this.requestedUrl,pages:[],viewport:this.viewport()});
    const url = this.viewer.url;
    this.launchUrl = url;
    const profile = await fs.mkdtemp(path.join(tmpdir(), 'ds-chrome-'));
    this.profileDir = profile;

    // Detached + unref: the window belongs to the user, not the service, so it
    // survives the service stopping/restarting (see stop()/stopBrowser()).
    const chrome = spawn(CHROME_PATH, buildLaunchArgs(this.windowSpec, profile, url), {
      stdio: 'ignore',
      detached: true,
    });
    chrome.unref();
    this.chrome = chrome;
    chrome.on('exit', () => {
      // The child dying on its own = the live window is gone (user closed it,
      // or quit Chrome). stop() clears this.chrome before its own kill lands, so
      // an intentional shutdown is not recorded as "closed". Route through the
      // same teardown so the throwaway profile is always removed and no Chrome
      // process is left behind. Never auto-relaunched; the UI reads
      // `state().windowOpen`.
      if (this.chrome !== chrome) return;
      this.closedAt = Date.now();
      void this.quit();
    });

    const port = await this.waitForPort(profile, chrome);
    this.debuggingPort = port;
    const version = (await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json())) as {
      webSocketDebuggerUrl?: string;
    };
    const wsUrl = version.webSocketDebuggerUrl;
    if (!wsUrl) throw new Error('Chrome did not report a webSocketDebuggerUrl');

    const ws = await openSocket(wsUrl);
    const cdp = new CdpClient(ws);
    this.cdp = cdp;
    this.wireEvents(cdp);
    // Target discovery makes Chrome report `Target.targetDestroyed` for the app
    // window when the user closes it; without discovery a clean window close
    // leaves the whole Chrome app running as a background process. Best effort:
    // a browser that refuses it still works through detachedFromTarget/exit.
    try {
      await cdp.send('Target.setDiscoverTargets', { discover: true });
    } catch {
      /* older/newer Chrome refused discovery; other signals still fire */
    }

    // The `--app` window already exists as a page target: attach to it. A blind
    // Target.createTarget here would open a SECOND window beside it; that is
    // only a last-resort fallback when Chrome reports no page at all.
    if (!(await this.attachExistingPage(cdp))) await this.attachNewPage(cdp);
    const session = this.requireSession();

    this.contexts = new ArtifactContexts(cdp, session, ARTIFACT_SCRIPTS, () => { void this.refreshArtifact(); }, url);
    await this.contexts.enable(session);
    await this.contexts.discover();
    await this.shellEval(SHELL_BRIDGE);
    await this.contexts.initializeArtifact();
  }

  /** Create a fresh page target and attach to it (last-resort fallback). */
  private async attachNewPage(cdp: CdpClient): Promise<void> {
    const created = await cdp.send('Target.createTarget', { url: 'about:blank' });
    this.targetId = String(created.targetId ?? '');
    const attached = await cdp.send('Target.attachToTarget', { targetId: this.targetId, flatten: true });
    this.sessionId = String(attached.sessionId ?? '');
  }

  /**
   * Attach (flatten) to an ALREADY-EXISTING `page` target — the `--app` window.
   * With `--app=<url>` the target is already at the requested URL, so the first
   * non-internal page is the window; the about:blank-preference is gone because
   * the window is never launched at a placeholder. Returns false when Chrome
   * reports no page target at all, so the caller can fall back to creating one.
   */
  private async attachExistingPage(cdp: CdpClient): Promise<boolean> {
    const res = await cdp.send('Target.getTargets');
    const infos = Array.isArray(res.targetInfos)
      ? (res.targetInfos as Array<{ targetId?: unknown; type?: unknown; url?: unknown }>)
      : [];
    const pages = infos.filter((info) => info.type === 'page');
    const chosen = pages.find((info) => !String(info.url ?? '').startsWith('chrome://')) ?? pages[0];
    if (!chosen || typeof chosen.targetId !== 'string') return false;
    this.targetId = chosen.targetId;
    const attached = await cdp.send('Target.attachToTarget', { targetId: this.targetId, flatten: true });
    this.sessionId = String(attached.sessionId ?? '');
    return true;
  }

  private async waitForPort(profile: string, chrome: ChildProcess): Promise<number> {
    const file = path.join(profile, 'DevToolsActivePort');
    const deadline = Date.now() + LAUNCH_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (chrome.exitCode !== null) throw new Error(`Chrome exited early (${chrome.exitCode})`);
      try {
        const text = await fs.readFile(file, 'utf8');
        const port = Number((text.split('\n')[0] ?? '').trim());
        if (Number.isFinite(port) && port > 0) return port;
      } catch {
        /* file not written yet */
      }
      await delay(50);
    }
    throw new Error('timed out waiting for DevToolsActivePort');
  }

  private wireEvents(cdp: CdpClient): void {
    cdp.on('Runtime.bindingCalled', (params, session) => {
      if(typeof params.payload!=='string'||params.payload.length>24000)return;
      try {
        const value=JSON.parse(params.payload);
        const context=this.contexts;
        if(!context)return;
        if(context.matches(context.artifact(),session,params.executionContextId)) {
          if(params.name==='__dsPick'&&validPick(value)){this.lastPick=value;this.pickSeq+=1;}
          if(params.name==='__dsArtifactEvent'&&value&&['dismiss','changed','height-dirty','wheel'].includes(value.type)){
            if(value.type==='dismiss'&&this.canvasFlags.menu)void this.shellEval('__dsCanvas.dismissMenu()').catch(()=>undefined);
            if(value.type==='changed')void this.refreshArtifact();
            if(value.type==='height-dirty')this.queueLayout();
            if(value.type==='wheel'&&[value.x,value.y,value.deltaX,value.deltaY].every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=8192)){
              const artifact=context.artifact();
              void this.transaction(async()=>{if(this.layoutState.mode!=='page'||context.artifact()!==artifact)return;
                await this.shellEval(`(()=>{const f=document.getElementById('preview'),r=f.getBoundingClientRect(),c=document.getElementById('canvas').getBoundingClientRect();return __dsCanvas.handleCanvasInput({type:'wheel',deltaX:${value.deltaX},deltaY:${value.deltaY},x:r.x+${value.x}*r.width/f.clientWidth-c.x,y:r.y+${value.y}*r.height/f.clientHeight-c.y,zoom:false})})()`);
              }).catch(()=>undefined);
            }
          }
        } else if(context.matches(context.shell(),session,params.executionContextId)) {
          const authority=context.captureShellAuthority(session,params.executionContextId);
          if(!authority)return;
          if(params.name==='__dsCanvasSend')void this.canvasCommand(value,authority).catch(()=>undefined);
          if(params.name==='__dsShellState'&&value){
            void this.transaction(async()=>{
            if(!context.shellAuthorityCurrent(authority))return;
            if(typeof value.menu==='boolean'&&typeof value.pan==='boolean'){
              this.canvasFlags={menu:value.menu,pan:value.pan};
              void this.evalIn(`window.__dsViewerFlags=${JSON.stringify(this.canvasFlags)}`,false).catch(()=>undefined);
            } else if(value.pick&&[value.pick.x,value.pick.y].every((n:unknown)=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=8192)){
              void this.evalIn(`window.__dsPickAt(${value.pick.x},${value.pick.y})`,false).catch(()=>undefined);
            }
            }).catch(()=>undefined);
          }
        }
      } catch {
        /* malformed payload from the page */
      }
    });
    // The user closing the app window destroys our page target (or detaches our
    // flattened session). Either is the "window is gone" signal: mark the window
    // closed, then QUIT Chrome, because macOS Chrome does not exit when its last
    // window closes — it lingers (often respawning a `--no-startup-window`
    // process) in the Dock. Discovery events name the target; detach names the
    // session, so match either against ours.
    cdp.on('Target.targetDestroyed', (params) => {
      this.handleTargetGone(String(params.targetId ?? ''), undefined);
    });
    cdp.on('Target.detachedFromTarget', (params) => {
      this.handleTargetGone(String(params.targetId ?? ''), typeof params.sessionId === 'string' ? params.sessionId : undefined);
    });
  }

  /**
   * Our window target is gone. Quit Chrome (it would otherwise stay running —
   * macOS keeps the app alive after the last window closes) and remove the
   * throwaway profile. Ignored while an intentional teardown is already running.
   */
  private handleTargetGone(targetId: string, sessionId: string | undefined): void {
    if (this.quitting) return;
    if (this.targetId === null || (targetId !== this.targetId && sessionId !== this.sessionId)) return;
    this.closedAt = Date.now();
    void this.quit();
  }

  private requireCdp(): CdpClient {
    if (!this.cdp) throw new Error('browser not started');
    return this.cdp;
  }

  private requireSession(): string {
    if (!this.sessionId) throw new Error('browser has no attached session');
    return this.sessionId;
  }

  private transaction<T>(work:()=>Promise<T>):Promise<T>{
    const next=this.operationTail.then(work,work);this.operationTail=next.catch(()=>undefined);return next;
  }
  private async shellEval(expression:string, awaitPromise=false):Promise<unknown>{
    const context=this.contexts?.shell();
    if(!context||!this.contexts)throw new Error('canvas shell context is unavailable');
    return this.contexts.evaluate(context,expression,awaitPromise);
  }
  async getCamera():Promise<Record<string,unknown>|null>{
    if(!this.cdp)return null;
    const camera=await this.shellEval('__dsCanvas.getCamera()') as Record<string,unknown>;
    return {...camera,layoutMode:this.layoutState.mode,preset:this.layoutState.preset,nominalHeight:this.layoutState.nominalHeight,reason:this.layoutState.reason??''};
  }
  async restoreCamera(camera:Record<string,unknown>|null):Promise<void>{
    if(!camera||!this.cdp)return;
    const generation=++this.layoutGeneration;
    await this.transaction(async()=>{
      if(generation!==this.layoutGeneration)return;
      if(['fit','page','viewport'].includes(String(camera.layoutMode))&&[camera.width,camera.height,camera.nominalHeight].every(n=>typeof n==='number'&&Number.isInteger(n)&&n>=100&&n<=8192)){
        await this.applyLayout({mode:camera.layoutMode as 'fit'|'page'|'viewport',preset:String(camera.preset),nominalHeight:Number(camera.nominalHeight),reason:typeof camera.reason==='string'?camera.reason:undefined},Number(camera.width),Number(camera.height));
      }
      await this.shellEval(`__dsCanvas.restoreCamera(${JSON.stringify(camera)})`);
    });
  }
  async setLayout(mode:'fit'|'page',preset='desktop'):Promise<void>{
    if(mode!=='fit'&&mode!=='page')throw new Error('Unsupported layout mode');
    if(mode==='fit'?preset!=='fit':!this.presetSize(preset))throw new Error('Unsupported layout preset');
    const generation=++this.layoutGeneration;
    await this.transaction(()=>this.reconcileLayout(mode,preset,generation));
  }
  private presetSize(preset:string):{width:number;height:number}|undefined{
    return ({desktop:{width:1280,height:800},large:{width:1920,height:1080},tablet:{width:768,height:1024},mobile:{width:390,height:844}} as Record<string,{width:number;height:number}>)[preset];
  }
  private async applyLayout(state:typeof this.layoutState,width:number,height:number,current:()=>boolean=()=>true):Promise<void>{
    const accepted=await this.shellEval(`typeof __dsCanvas.setLayout==='function'&&__dsCanvas.setLayout(${JSON.stringify({...state,width,height})})`);
    if(!current())return;
    if(accepted!==true)throw new Error('Renderer contract unavailable: __dsCanvas.setLayout must accept confirmed geometry');
    await this.evalIn(`window.__dsLayoutMode=${JSON.stringify(state.mode)}`,false);
    if(!current())return;
    this.layoutState={...state};this.viewportWidth=width;this.viewportHeight=height;
  }
  private queueLayout():void{
    if((this.layoutState.mode==='viewport'&&!this.layoutState.reason)||!this.cdp)return;
    this.layoutDirty=true;if(this.layoutQueued)return;this.layoutQueued=true;
    void this.transaction(async()=>{this.layoutDirty=false;await this.reconcileLayout(this.layoutState.mode==='fit'?'fit':'page',this.layoutState.preset,this.layoutGeneration);})
      .catch(()=>undefined).finally(()=>{this.layoutQueued=false;if(this.layoutDirty)this.queueLayout();});
  }
  private async reconcileLayout(mode:'fit'|'page',preset:string,generation:number,authority?:ShellAuthority):Promise<void>{
    const contexts=this.contexts,context=contexts?.artifact();if(!context||!contexts)return;
    const current=()=>this.contexts===contexts&&contexts.artifact()===context&&generation===this.layoutGeneration&&(!authority||contexts.shellAuthorityCurrent(authority));
    if(!current())return;
    await contexts.evaluate(context,'window.__dsSizing=true');
    try{
      if(!current())return;
      const camera=mode==='page'&&this.layoutState.mode==='page'&&this.layoutState.preset===preset?await this.shellEval('__dsCanvas.getCamera()') as Record<string,unknown>:null;
      if(!current())return;
      if(mode==='fit'){
        const bounds=await this.shellEval("typeof __dsCanvas.getFitBounds==='function'?__dsCanvas.getFitBounds():null") as {width:number;height:number}|null;
        if(!current())return;
        if(!bounds||![bounds.width,bounds.height].every(n=>Number.isInteger(n)&&n>=100&&n<=8192))throw new Error('Renderer contract unavailable: valid current getFitBounds geometry required');
        await this.applyLayout({mode:'fit',preset:'fit',nominalHeight:bounds.height},bounds.width,bounds.height,current);return;
      }
      const size=this.presetSize(preset);if(!size)return;
      const nominal={mode:'viewport' as const,preset,nominalHeight:size.height};
      await this.applyLayout(nominal,size.width,size.height,current);if(!current())return;
      const measure=async()=>{
        await contexts.evaluate(context,'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))',true);if(!current())return null;
        const geometry=await contexts.evaluate(context,`(()=>{const overlays=[...document.querySelectorAll('[data-ds-overlay]')].map(el=>[el,el.style.display]);try{for(const [el] of overlays)el.style.display='none';return {width:innerWidth,extent:Math.max(document.documentElement.scrollHeight,document.body?.scrollHeight||0),visible:document.documentElement.getBoundingClientRect().width>0};}finally{for(const [el,display] of overlays)el.style.display=display;}})()`) as {width:number;extent:number;visible:boolean};
        return current()?geometry:null;
      };
      const first=await measure();if(!first)return;
      let reason='';
      if(!first.visible||first.width!==size.width||!Number.isFinite(first.extent)||first.extent<0)reason='Document geometry is unavailable; using the nominal viewport.';
      else if(first.extent>8192)reason='Page exceeds the 8192px supported bound; using the nominal viewport.';
      const candidate=Math.max(size.height,Math.ceil(first.extent));
      if(!reason){
        await this.applyLayout(nominal,size.width,candidate,current);if(!current())return;
        const second=await measure();if(!second)return;
        if(!second.visible||second.width!==size.width||!Number.isFinite(second.extent)||second.extent>candidate+1)reason='Page height grows with its viewport and does not stabilize; using the nominal viewport.';
      }
      if(!current())return;
      if(reason)await this.applyLayout({...nominal,reason},size.width,size.height,current);
      else {
        await this.applyLayout({mode:'page',preset,nominalHeight:size.height},size.width,candidate,current);
        if(current()&&camera?.layoutMode==='page')await this.shellEval(`__dsCanvas.restoreCamera(${JSON.stringify({...camera,layoutMode:'page',preset,width:size.width,height:candidate,nominalHeight:size.height,reason:''})})`);
      }
    }finally{if(contexts.artifact()===context)await contexts.evaluate(context,"typeof __dsFinishSizing==='function'?__dsFinishSizing():(window.__dsSizing=false)").catch(()=>undefined);}
  }
  private async canvasCommand(command:unknown,authority:ShellAuthority):Promise<void>{
    if(!command||typeof command!=='object')return;
    if(!this.contexts?.shellAuthorityCurrent(authority))return;
    const value=command as {type?:string;width?:number;height?:number;id?:string;mode?:string;preset?:string};
    if(value.type==='ready'){await this.shellEval(SHELL_BRIDGE);await this.contexts?.discover();await this.contexts?.initializeArtifact();}
    else if(value.type==='viewport'&&[value.width,value.height].every(n=>typeof n==='number'&&Number.isInteger(n)&&n>=100&&n<=8192)){++this.layoutGeneration;await this.transaction(()=>this.resizeArtifact(value.width!,value.height!,authority));}
    else if(value.type==='page'&&typeof value.id==='string'&&value.id.length<=128){const page=this.pages.find(page=>page.id===value.id);if(page)await this.navigateGuarded(page.url,authority);}
    else if(value.type==='retry')await this.navigateGuarded(this.requestedUrl,authority);
    else if(value.type==='layout'&&(value.mode==='fit'&&value.preset==='fit'||value.mode==='page'&&typeof value.preset==='string'&&!!this.presetSize(value.preset))){
      const generation=++this.layoutGeneration;await this.transaction(()=>this.reconcileLayout(value.mode as 'fit'|'page',value.preset!,generation,authority));
    }else if(value.type==='fit-size'&&this.layoutState.mode==='fit'&&!this.captureInFlight){
      const generation=++this.layoutGeneration;await this.transaction(()=>this.reconcileLayout('fit','fit',generation,authority));
    }
  }
  private async refreshArtifact():Promise<void>{
    const context=this.contexts?.artifact();
    if(this.refreshing||!context)return;
    this.refreshing=true;
    try{
      const info=await this.contexts!.evaluate(context,'({url:location.href,title:document.title,ready:document.readyState,layout:document.documentElement.getBoundingClientRect().width>0})') as {url:string;title:string;ready:string;layout:boolean};
      if(this.contexts?.artifact()!==context)return;
      const navigation=this.pendingNavigation;
      if(navigation){
        if(!navigation.responded)return;
        if(navigation.loaderId){
          // Redirects retain the requested loader, but replace its document
          // world. Neither a cached URL nor a commit event alone is readiness.
          if(context===navigation.previous||this.contexts.artifactLoaderId()!==navigation.loaderId)return;
        }else if(info.url!==navigation.target||context!==navigation.previous||this.contexts.artifactSameDocumentVersion()<=navigation.sameDocumentVersion)return;
      }
      if(!isWebSafeUrl(info.url)){
        if(info.url.startsWith('chrome-error:')){this.canvasError='The preview could not be displayed. Check the dev server and CSP/X-Frame-Options embedding permissions.';await this.shellEval(`__dsCanvas.setStatus({state:'error',message:${JSON.stringify(this.canvasError)}})`);}
        return;
      }
      if((info.ready!=='complete'&&info.ready!=='interactive')||!info.layout)return;
      this.canvasError='';this.artifactUrl=info.url;this.artifactTitle=info.title;
      if(!this.pages.some(page=>page.url===info.url))this.pages.push({id:'page-'+(this.pages.length+1),url:info.url,label:info.title||new URL(info.url).pathname});
      else this.pages=this.pages.map(page=>page.url===info.url?{...page,label:info.title||page.label}:page);
      // Confirm actual native/SPA URLs without mutating src or replacing the DOM.
      await this.shellEval(`__dsCanvas.setPage({url:${JSON.stringify(info.url)},title:${JSON.stringify(info.title)},pages:${JSON.stringify(this.pages)},navigate:false});__dsCanvas.setStatus({state:'ready'})`);
      await this.evalIn(`window.__dsViewerFlags=${JSON.stringify(this.canvasFlags)}`,false);
      if(context!==this.layoutContext){this.layoutContext=context;this.queueLayout();}
    }catch{/* navigation destroys worlds; the next frame/context event reacquires */}
    finally{this.refreshing=false;}
  }
  private async waitArtifact():Promise<boolean>{
    const deadline=Date.now()+10000;
    while(Date.now()<deadline&&this.cdp){
      await this.contexts?.discover();
      await this.contexts?.initializeArtifact().catch(()=>undefined);
      await this.refreshArtifact();
      if(this.canvasError)return false;
      if(this.artifactUrl)return true;
      await delay(50);
    }
    this.canvasError='The preview did not become available. Check the dev server and whether CSP/X-Frame-Options permits embedding, then retry.';
    await this.shellEval(`__dsCanvas.setStatus({state:'error',message:${JSON.stringify(this.canvasError)}})`).catch(()=>undefined);
    return false;
  }

  private async pageInfo(cdp: CdpClient, session: string): Promise<{ url: string; title: string }> {
    const value = await this.evalIn('JSON.stringify({url:location.href,title:document.title})',false);
    try {
      const parsed = JSON.parse(typeof value==='string'?value:'{}') as { url?: string; title?: string };
      return { url: String(parsed.url ?? ''), title: String(parsed.title ?? '') };
    } catch {
      return { url: '', title: '' };
    }
  }

  /** Navigate and wait for the load event (resolving after 30s at the latest). */
  async navigate(url: string): Promise<{ url: string; title: string; settled: boolean }> {
    return this.navigateGuarded(url);
  }
  private async navigateGuarded(url:string,authority?:ShellAuthority):Promise<{url:string;title:string;settled:boolean}>{
    if(!isWebSafeUrl(url)||new URL(url).username||new URL(url).password)throw new Error('canvas artifact requires an http(s) URL without credentials');
    const launched=!this.cdp;
    if(launched){this.artifactUrl='';this.artifactTitle='';this.canvasError='';await this.start(url);}
    return this.transaction(async()=>{
      if(authority&&!this.contexts?.shellAuthorityCurrent(authority))return {url:this.artifactUrl,title:this.artifactTitle,settled:false};
      this.requestedUrl=new URL(url).href;
      if(launched){
        const settled=await this.waitArtifact();if(settled)await this.bringToFront();
        return {url:this.artifactUrl||this.requestedUrl,title:this.artifactTitle,settled};
      }
      const previous=this.contexts?.artifact();
      if(!previous)throw new Error('artifact navigation context is unavailable; retry after the frame becomes available');
      const navigation={previous,target:this.requestedUrl,sameDocumentVersion:this.contexts!.artifactSameDocumentVersion(),responded:false,loaderId:undefined as string|undefined};
      this.pendingNavigation=navigation;this.artifactUrl='';this.artifactTitle='';this.canvasError='';
      try{
        // One navigation primitive, with the loader returned by the requested
        // frame's CDP session. Metadata must never independently assign src.
        await this.shellEval(`__dsCanvas.setStatus({state:'loading'});__dsCanvas.setPage({url:${JSON.stringify(this.requestedUrl)},pages:${JSON.stringify(this.pages)},navigate:false})`);
        if(authority&&!this.contexts?.shellAuthorityCurrent(authority))return {url:this.artifactUrl,title:this.artifactTitle,settled:false};
        const result=await this.requireCdp().send('Page.navigate',{url:this.requestedUrl,frameId:previous.frame},previous.session);
        navigation.loaderId=typeof result.loaderId==='string'?result.loaderId:undefined;navigation.responded=true;
        if(typeof result.errorText==='string'&&result.errorText){
          this.canvasError='The preview navigation failed: '+result.errorText;
          await this.shellEval(`__dsCanvas.setStatus({state:'error',message:${JSON.stringify(this.canvasError)}})`);
          return {url:this.requestedUrl,title:'',settled:false};
        }
        const settled=await this.waitArtifact();if(settled)await this.bringToFront();
        return {url:this.artifactUrl||this.requestedUrl,title:this.artifactTitle,settled};
      }finally{if(this.pendingNavigation===navigation)this.pendingNavigation=null;}
    });
  }

  /**
   * Ensure the live window exists, then navigate it to `url`. This is the one
   * entry the panel uses: a first call launches the window AT `url` (never
   * about:blank, which would spawn a second window), later calls reuse the
   * existing window and navigate it.
   */
  async open(url: string): Promise<{ url: string; title: string; settled: boolean }> {
    return this.navigate(url);
  }

  /**
   * Go back/forward in the page's history and wait for the destination to
   * settle. Drives CDP's navigation history directly (a `history.back()` via
   * Runtime.evaluate races the destroyed execution context); a same-document
   * navigation fires no load event, so the settle wait is bounded.
   */
  async goHistory(direction: 'back' | 'forward'): Promise<{ url: string; title: string; settled: boolean }> {
    return this.transaction(async()=>{
      await this.evalIn(`history.${direction}();true`,false);await delay(200);
      const settled=await this.waitArtifact();
      return {url:this.artifactUrl,title:this.artifactTitle,settled};
    });
  }

  /** Apply a batch of input events (already in viewport CSS px). */
  async input(events: SurfaceInputEvent[]): Promise<void> {
    return this.transaction(async()=>{
    const cdp = this.requireCdp();
    const session = this.requireSession();

    for (const event of events) {
      await this.shellEval('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))',true);
      const rect=await this.shellEval("(()=>{const f=document.getElementById('preview'),r=f.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,cssWidth:f.clientWidth,cssHeight:f.clientHeight}})()") as {x:number;y:number;width:number;height:number;cssWidth:number;cssHeight:number};
      if(event.type==='pointer'&&event.action==='down'&&this.canvasFlags.menu){await this.shellEval('__dsCanvas.dismissMenu()');continue;}
      if(event.type==='pointer'&&(event.modifiers.ctrl||event.modifiers.meta)&&this.canvasFlags.pan){if(event.action==='up')await this.evalIn(`window.__dsPickAt(${event.x},${event.y})`,false);continue;}
      if (event.type === 'pointer') {
        const type = event.action === 'down' ? 'mousePressed' : event.action === 'up' ? 'mouseReleased' : 'mouseMoved';
        await cdp.send(
          'Input.dispatchMouseEvent',
          {
            type,
            x: rect.x+event.x*rect.width/rect.cssWidth,
            y: rect.y+event.y*rect.height/rect.cssHeight,
            button: buttonName(event.button),
            buttons: event.buttons,
            clickCount: event.action === 'move' ? 0 : 1,
            modifiers: modifierBits(event.modifiers),
          },
          session,
        );
      } else if (event.type === 'wheel') {
        await cdp.send(
          'Input.dispatchMouseEvent',
          {
            type: 'mouseWheel',
            x: rect.x+event.x*rect.width/rect.cssWidth,
            y: rect.y+event.y*rect.height/rect.cssHeight,
            deltaX: event.deltaX,
            deltaY: event.deltaY,
            modifiers: modifierBits(event.modifiers),
          },
          session,
        );
      } else if (event.type === 'key') {
        await this.shellEval("document.getElementById('preview').focus()");
        await cdp.send(
          'Input.dispatchKeyEvent',
          {
            type: event.action === 'down' ? 'keyDown' : 'keyUp',
            key: event.key,
            code: event.code,
            modifiers: modifierBits(event.modifiers),
          },
          session,
        );
      } else {
        await this.shellEval("document.getElementById('preview').focus()");
        await cdp.send('Input.insertText', { text: event.text }, session);
      }
    }
    });
  }

  /** The emulated viewport size in CSS px. */
  viewport(): { width: number; height: number } {
    return { width: this.viewportWidth, height: this.viewportHeight };
  }

  /** Resize the emulated viewport. */
  async resize(width: number, height: number): Promise<{ width: number; height: number }> {
    if(![width,height].every(n=>Number.isInteger(n)&&n>=100&&n<=8192))throw new Error('artifact viewport must be integer dimensions from 100 to 8192');
    ++this.layoutGeneration;return this.transaction(()=>this.resizeArtifact(width,height));
  }
  private async resizeArtifact(width:number,height:number,authority?:ShellAuthority):Promise<{width:number;height:number}>{
    if(authority&&!this.contexts?.shellAuthorityCurrent(authority))return this.viewport();
    const supportsLayout=await this.shellEval("typeof __dsCanvas.setLayout==='function'");
    if(authority&&!this.contexts?.shellAuthorityCurrent(authority))return this.viewport();
    if(supportsLayout)await this.applyLayout({mode:'viewport',preset:'custom',nominalHeight:height},width,height,()=>!authority||!!this.contexts?.shellAuthorityCurrent(authority));
    else {await this.shellEval(`__dsCanvas.setViewport(${width},${height})`);this.layoutState={mode:'viewport',preset:'custom',nominalHeight:height};}
    if(authority&&!this.contexts?.shellAuthorityCurrent(authority))return this.viewport();
    this.viewportWidth = width;
    this.viewportHeight = height;
    return { width, height };
  }

  /**
   * The app window's geometry on screen, via the CDP Browser domain. These
   * requests go to the BROWSER endpoint (no page sessionId). `null` when not
   * started, or when Chrome does not answer (e.g. a dying child).
   */
  async windowBounds(): Promise<{ x: number; y: number; width: number; height: number } | null> {
    const cdp = this.cdp;
    if (!cdp || !this.targetId) return null;
    try {
      const res = await cdp.send('Browser.getWindowForTarget', { targetId: this.targetId });
      const bounds = (res.bounds ?? {}) as { left?: unknown; top?: unknown; width?: unknown; height?: unknown };
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
  async placeWindow(x: number, y: number, width: number, height: number): Promise<void> {
    const cdp = this.requireCdp();
    if (!this.targetId) throw new Error('browser has no page target');
    const res = await cdp.send('Browser.getWindowForTarget', { targetId: this.targetId });
    const windowId = res.windowId;
    if (typeof windowId !== 'number' || windowId < 0) throw new Error('no window for the page target');
    await cdp.send('Browser.setWindowBounds', {
      windowId,
      bounds: {
        left: Math.round(x),
        top: Math.round(y),
        width: Math.max(MIN_WINDOW_EDGE, Math.round(width)),
        height: Math.max(MIN_WINDOW_EDGE, Math.round(height)),
        windowState: 'normal',
      },
    });
  }

  /**
   * How many `page` targets Chrome currently reports. Test hook for target
   * acquisition: the `--app` window is REUSED, so the count must stay 1 — a
   * blind createTarget would show up as 2 (a second window).
   */
  async pageTargetCount(): Promise<number> {
    const cdp = this.cdp;
    if (!cdp) return 0;
    const res = await cdp.send('Target.getTargets');
    const infos = Array.isArray(res.targetInfos) ? (res.targetInfos as Array<{ type?: unknown }>) : [];
    return infos.filter((info) => info.type === 'page').length;
  }

  /**
   * The DevTools HTTP `/json/list` targets, for diagnostics and tests. The
   * chromeless regression test reads this same source to prove no
   * `chrome://omnibox-popup` target (i.e. no address bar) exists. Empty when no
   * window is up or the endpoint is unreachable.
   */
  async jsonList(): Promise<Array<{ id?: string; type?: string; url?: string; webSocketDebuggerUrl?: string }>> {
    if (this.debuggingPort === null) return [];
    try {
      const res = await fetch(`http://127.0.0.1:${this.debuggingPort}/json/list`);
      return (await res.json()) as Array<{ id?: string; type?: string; url?: string; webSocketDebuggerUrl?: string }>;
    } catch {
      return [];
    }
  }

  /** The throwaway profile dir while a window is up, else null. Inspection/test seam. */
  profilePath(): string | null {
    return this.profileDir;
  }

  /**
   * Public seam for `POST /focus`: raise the live window (see bringToFront)
   * without navigating or reloading the page. Best effort — a request with no
   * window up is a no-op.
   */
  async focus(): Promise<void> {
    await this.bringToFront();
  }

  /**
   * Briefly re-flash the element matching `selector` in the live window (the
   * panel drives this while the user hovers a reference row). Runs the injected
   * `window.__dsHighlight`, which reuses the pick outline in a distinct accent
   * and hides it after ~900ms. Returns false — never throws for a page-level
   * miss — when no window is open, the selector is invalid, or nothing matches.
   */
  async highlight(selector: string): Promise<boolean> {
    if (!this.cdp) return false;
    const expression = `(typeof window.__dsHighlight === 'function') ? window.__dsHighlight(${JSON.stringify(
      selector,
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
  private async bringToFront(): Promise<void> {
    const cdp = this.cdp;
    if (!cdp) return;
    try {
      if (this.targetId) await cdp.send('Target.activateTarget', { targetId: this.targetId });
      await cdp.send('Page.bringToFront', {}, this.sessionId ?? undefined);
    } catch {
      /* best effort */
    }
    await this.ensureWindowNotMinimized();
  }

  /**
   * A minimized window stops compositing and cannot be captured reliably. A
   * navigate means someone is about to look at the page, so restore a
   * minimized window; maximized/fullscreen stay as the user left them. Best
   * effort — must never fail the navigation.
   */
  private async ensureWindowNotMinimized(): Promise<void> {
    const cdp = this.cdp;
    if (!cdp || !this.targetId) return;
    try {
      const res = await cdp.send('Browser.getWindowForTarget', { targetId: this.targetId });
      const bounds = (res.bounds ?? {}) as { windowState?: unknown };
      if (bounds.windowState === 'minimized') {
        await cdp.send('Browser.setWindowBounds', { windowId: res.windowId, bounds: { windowState: 'normal' } });
      }
    } catch {
      /* best effort */
    }
  }

  /**
   * PNG of the current viewport, for the agent's `browser.capture` action — a
   * deterministic, lossless still of the compositor as laid out.
   */
  async capture(): Promise<{ png: Buffer; width: number; height: number }> {
    return this.transaction(async()=>{
    const cdp = this.requireCdp();
    const session = this.requireSession();
    const token=await this.shellEval('__dsCanvas.beginCapture()');
    this.captureInFlight=true;
    try{
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:Math.max(1000,this.viewportWidth+48),height:this.viewportHeight+256,deviceScaleFactor:1,mobile:false},session);
    const bounds=await this.shellEval(`__dsCanvas.normalizeCapture(${JSON.stringify(token)})`,true) as {x:number;y:number;width:number;height:number};
    if(bounds.width!==this.viewportWidth||bounds.height!==this.viewportHeight)throw new Error('Canvas capture geometry did not match the artifact viewport');
    const result = await cdp.send(
      'Page.captureScreenshot',
      { format: 'png', fromSurface: true, captureBeyondViewport: true,clip:{...bounds,scale:1} },
      session,
    );
    const data = typeof result.data === 'string' ? result.data : '';
    return {
      png: Buffer.from(data, 'base64'),
      width: this.viewportWidth,
      height: this.viewportHeight,
    };
    }finally{
      try{await cdp.send('Emulation.clearDeviceMetricsOverride',{},session);}
      finally{try{await this.shellEval(`__dsCanvas.endCapture(${JSON.stringify(token)})`);}finally{this.captureInFlight=false;}}
    }
    });
  }

  /** Evaluate an expression in the page and return its value. */
  async evaluate(expression: string): Promise<unknown> {
    return this.evalIn(expression, false);
  }

  private async evalIn(expression: string, awaitPromise: boolean): Promise<unknown> {
    const context=this.contexts?.artifact();
    if(!context||!this.contexts)throw new Error('artifact context is unavailable; check embedding permissions and retry');
    return this.contexts.evaluate(context,expression,awaitPromise);
  }

  /**
   * The in-page probe report. Returns a null-safe default when the probe is
   * absent (e.g. before any navigation on `about:blank`).
   */
  async getProbe(): Promise<ProbeReport> {
    const value = await this.evaluate(PROBE_EXPR);
    if (typeof value !== 'string' || value.length === 0) return emptyProbeReport();
    try {
      const parsed = JSON.parse(value) as Partial<ProbeReport>;
      return {
        scrollWidth: Number(parsed.scrollWidth ?? 0),
        clientWidth: Number(parsed.clientWidth ?? 0),
        innerWidth: Number(parsed.innerWidth ?? 0),
        innerHeight: Number(parsed.innerHeight ?? 0),
        scrollHeight: Number(parsed.scrollHeight ?? 0),
        cls: Number(parsed.cls ?? 0),
        selectors: Array.isArray(parsed.selectors) ? parsed.selectors : [],
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
  async applyStableMode(): Promise<void> {
    const cdp = this.requireCdp();
    const session = this.contexts?.artifact()?.session;
    if(!session)throw new Error('artifact context is unavailable');
    await cdp.send(
      'Emulation.setEmulatedMedia',
      { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] },
      session,
    );
    // There is no CDP `Page.addStyleTag` (that is a Puppeteer helper); inject the
    // freeze stylesheet straight into the document instead.
    await this.evaluate(
      `(function () {
        var style = document.createElement('style');
        style.textContent = ${JSON.stringify(STABLE_STYLE)};
        (document.head || document.documentElement).appendChild(style);
        return true;
      })()`,
    );
    await this.evaluate(
      'document.activeElement && document.activeElement.blur(); document.getAnimations().forEach(a=>{try{a.finish()}catch(e){}})',
    );
  }

  /**
   * Wait until two consecutive PNG captures are byte-identical. Waits for fonts,
   * lets two animation frames pass, then polls `capture()` every `intervalMs`
   * (default 120) up to `timeoutMs` (default 3000). Returns whether it settled.
   */
  async waitForStable(opts?: { timeoutMs?: number; intervalMs?: number }): Promise<boolean> {
    const timeoutMs = opts?.timeoutMs ?? 3000;
    const intervalMs = opts?.intervalMs ?? 120;
    await this.evalIn(
      'document.fonts && document.fonts.ready ? document.fonts.ready.then(function () { return true; }) : true',
      true,
    );
    await this.evalIn(
      'new Promise(function (resolve) { requestAnimationFrame(function () { requestAnimationFrame(function () { resolve(true); }); }); })',
      true,
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
  latestFrame(): BrowserFrame | null {
    return null;
  }

  async state(): Promise<BrowserState> {
    let url = '';
    let title = '';
    if (this.cdp) {
      try {
        const info = await this.pageInfo(this.cdp, this.requireSession());
        url = info.url;
        title = info.title;
      } catch {
        // The CDP socket dies together with the Chrome child (windowOpen false);
        // /state must keep answering so the UI can show the closed notice.
      }
    }
    return {
      url,
      title,
      lastPick: this.lastPick,
      pickSeq: this.pickSeq,
      windowOpen: this.closedAt === null && (this.chrome !== null || this.cdp !== null),
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
  async close(): Promise<void> {
    if (this.chrome === null && this.cdp === null) {
      this.closedAt = Date.now();
      return;
    }
    this.closedAt = Date.now();
    await this.quit();
  }

  /** Run the teardown once; concurrent callers (close, stop, target events) join it. */
  private quit(): Promise<void> {
    if (!this.quitPromise) {
      this.quitting = true;
      this.quitPromise = this.doQuit().catch(() => {
        /* teardown is best effort; state() already reports the window closed */
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
  private async doQuit(): Promise<void> {
    const cdp = this.cdp;
    if (cdp) {
      if (this.targetId) {
        try {
          await cdp.send('Target.closeTarget', { targetId: this.targetId });
        } catch {
          /* target already gone (the user closed the window first) */
        }
      }
      try {
        await cdp.send('Browser.close');
      } catch {
        /* the socket can die the moment Chrome quits */
      }
      cdp.close();
      this.cdp = null;
      this.sessionId = null;
      this.targetId = null;
    }

    const chrome = this.chrome;
    if (chrome) {
      // `Browser.close` usually ends the child; give it a moment before forcing.
      await this.waitForExit(chrome, 1500);
      if (chrome.exitCode === null) {
        try {
          chrome.kill('SIGTERM');
        } catch {
          /* already gone */
        }
        await this.waitForExit(chrome, 3000);
      }
      if (chrome.exitCode === null) {
        try {
          chrome.kill('SIGKILL');
        } catch {
          /* already gone */
        }
        await this.waitForExit(chrome, 2000);
      }
      this.chrome = null;
    }

    await this.reapProfile();
    this.contexts?.close();this.contexts=null;
    await this.viewer?.close();this.viewer=null;
  }

  /** Resolve once the child has exited or `timeoutMs` elapses. */
  private waitForExit(chrome: ChildProcess, timeoutMs: number): Promise<void> {
    if (chrome.exitCode !== null || chrome.signalCode !== null) return Promise.resolve();
    return new Promise((resolve) => {
      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        chrome.removeListener('exit', finish);
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(finish, timeoutMs);
      chrome.once('exit', finish);
    });
  }

  /** Remove the throwaway profile dir, once Chrome has released it. */
  private async reapProfile(): Promise<void> {
    const profile = this.profileDir;
    if (!profile) return;
    await fs.rm(profile, { recursive: true, force: true }).catch(() => {
      /* best effort */
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
  async stop(opts: { kill?: boolean } = {}): Promise<void> {
    const kill = opts.kill ?? true;
    if(kill&&!this.quitPromise&&(this.chrome||this.cdp)){await this.close();}
    this.contexts?.close();this.contexts=null;
    await this.viewer?.close();this.viewer=null;
    // Join an in-flight window-close teardown so a relaunch never races it.
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
          this.chrome.kill('SIGKILL');
        } catch {
          /* already gone */
        }
      }
      this.chrome = null;
    }
    if (this.profileDir) {
      if (kill) {
        await fs.rm(this.profileDir, { recursive: true, force: true }).catch(() => {
          /* best effort */
        });
      }
      this.profileDir = null;
    }
    this.sessionId = null;
    this.targetId = null;
    this.starting = null;
    this.launchUrl = null;
    this.debuggingPort = null;
    // A fresh (re)launch must not inherit the previous window's closed flag.
    this.closedAt = null;
    this.quitting = false;
    this.quitPromise = null;
  }
}
