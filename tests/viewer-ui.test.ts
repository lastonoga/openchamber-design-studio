import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Script, runInNewContext } from 'node:vm';

const modulePath = '../service/viewer-ui.ts';
const viewer = await import(modulePath).catch(() => null);
const config = { url: 'http://127.0.0.1:5173/', pages: [{ id: 'home', label: 'Home', url: 'http://127.0.0.1:5173/' }], viewport: { width: 1280, height: 800 } };
function html(extra: Record<string, unknown> = {}): string {
  assert.ok(viewer, 'the production viewer renderer must exist');
  return viewer.renderViewerHtml({ ...config, ...extra });
}

test('renderer uses an actual live iframe and never embeds a fixture, proxy or external UI dependency', () => {
  const rendered = html();
  assert.match(rendered, /<iframe[^>]*id="preview"/);
  assert.doesNotMatch(rendered, /srcdoc|contentDocument|contentWindow\.document|fixtureDocument|Fieldnotes|DEMO/);
  assert.match(rendered, /frame\.src\s*=/);
  assert.doesNotMatch(rendered, /<script[^>]+src=|<link[^>]+href=/);
});

test('untrusted labels and script terminators cannot break out of configuration; unknown secrets are omitted', () => {
  const hostile = '</script><img src=x onerror=alert(1)>\u2028';
  const rendered = html({ pages: [{ id: hostile, label: hostile, url: config.url }], bearer: 'DO-NOT-SERIALIZE-THIS-SECRET' });
  assert.doesNotMatch(rendered, /<img src=x|DO-NOT-SERIALIZE-THIS-SECRET/);
  const scripts = [...rendered.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1, 'one closed script regardless of label contents');
  assert.doesNotThrow(() => new Script(scripts[0]![1]!));
});

test('renderer rejects active URL schemes, embedded credentials and invalid viewport dimensions', () => {
  assert.throws(() => html({ url: 'javascript:alert(1)' }), /http|URL/i);
  assert.throws(() => html({ url: 'https://user:password@example.com/' }), /credential|URL/i);
  assert.throws(() => html({ viewport: { width: Infinity, height: 800 } }), /viewport/i);
  assert.throws(() => html({ pages: [{ id: 'x', label: 'x', url: 'data:text/html,x' }] }), /http|URL/i);
});

test('rendered client exposes the CDP contract and the approved narrow outbound mode commands', () => {
  const rendered = html();
  for (const name of ['setViewport', 'setStatus', 'setPage', 'getCamera', 'restoreCamera', 'dismissMenu']) assert.ok(rendered.includes(name), name);
  assert.match(rendered, /window\.__dsCanvasSend/);
  assert.doesNotMatch(rendered, /host\.attach|fetch\(|XMLHttpRequest|WebSocket|localStorage/);
  for (const type of ['ready', 'page', 'retry', 'layout', 'fit-size']) assert.ok(rendered.includes(`type: '${type}'`), type);
});

function clientFunction(name: string): string {
  const match = html().match(new RegExp(`function ${name}\\([^)]*\\)\\{[\\s\\S]*?\\n  \\}`));
  assert.ok(match, `missing client method ${name}`);
  return match[0];
}

test('five layout radios distinguish adaptive Fit from unchanged default Desktop', () => {
  const radios = [...html().matchAll(/role="radio"[^>]*data-preset="([^"]+)"[^>]*aria-checked="([^"]+)"/g)];
  assert.deepEqual(radios.map((r) => r[1]), ['fit', 'desktop', 'large', 'tablet', 'mobile']);
  assert.deepEqual(radios.filter((r) => r[2] === 'true').map((r) => r[1]), ['desktop']);
});

test('backend-confirmed page height and explicit viewport fallback update distinct layout state', () => {
  const view = { width:1280,height:800,nominalHeight:800,preset:'desktop',layoutMode:'viewport',mode:'manual',scale:1,panX:30,panY:70,pan:false,space:false,reason:'' };
  const context = { view, captureState:null, paint:()=>undefined, finite:Number.isFinite };
  const setLayout = runInNewContext(clientFunction('setLayout')+';setLayout',context);
  assert.equal(setLayout({mode:'page',preset:'desktop',width:1280,height:1880,nominalHeight:800}),true);
  assert.equal(view.height,1880);assert.equal(view.layoutMode,'page');
  assert.equal(setLayout({mode:'viewport',preset:'desktop',width:1280,height:800,nominalHeight:800,reason:'Viewport-relative content did not stabilize.'}),true);
  assert.equal(view.height,800);assert.equal(view.layoutMode,'viewport');assert.match(view.reason,/did not stabilize/);
  const previous = {...view};
  assert.equal(setLayout({mode:'page',preset:'desktop',width:1280,height:Infinity,nominalHeight:800}),false);
  assert.deepEqual(view,previous);
});

test('capture-frozen layout rejects mutations without changing the saved mode or dimensions', () => {
  const view={width:1280,height:800,layoutMode:'viewport',preset:'desktop'};
  const setLayout=runInNewContext(clientFunction('setLayout')+';setLayout',{view,captureState:{token:1},paint:()=>undefined,finite:Number.isFinite});
  assert.equal(setLayout({mode:'fit',preset:'fit',width:390,height:844,nominalHeight:844}),false);
  assert.deepEqual(view,{width:1280,height:800,layoutMode:'viewport',preset:'desktop'});
});

test('normal loading hides large copy but leaves the iframe camera in layout; delayed Retry remains', () => {
  const nodes=new Map<string, {hidden?:boolean;dataset:Record<string,string>;textContent?:string;title?:string;setAttribute:(a:string,b:string)=>void}>();
  const $=(id:string)=>{if(!nodes.has(id))nodes.set(id,{hidden:false,dataset:{},setAttribute:()=>undefined});return nodes.get(id)!;};
  let delayed:(()=>void)|undefined;
  const view={ready:true,space:false,pan:false};const camera={hidden:false};
  const context={$,view,camera,captureState:null,slowTimer:null,statusState:'ready',clearTimeout:()=>undefined,setTimeout:(fn:()=>void,delay:number)=>{assert.equal(delay,15000);delayed=fn;},closeMenu:()=>undefined,paint:()=>undefined,announce:()=>undefined};
  const setStatus=runInNewContext(clientFunction('setStatus')+';setStatus',context);
  assert.equal(setStatus({state:'loading'}),true);
  assert.equal(camera.hidden,false,'loading must retain a compositable iframe');
  assert.equal($('state-title').hidden,true);assert.equal($('state-copy').hidden,true);assert.equal($('spinner').hidden,false);
  assert.equal($('state-action').hidden,true);delayed!();assert.equal($('state-action').hidden,false);assert.equal($('state-title').hidden,true);
});

test('live readiness is backend-reported, not inferred from iframe load; all four surface states exist', () => {
  const rendered = html();
  assert.doesNotMatch(rendered, /frame\.onload\s*=|addEventListener\(['"]load['"]/);
  for (const state of ['loading', 'ready', 'empty', 'error']) assert.ok(rendered.includes(`'${state}'`));
  assert.match(rendered, /allows embedding/);
  assert.match(rendered, /15000/);
});

test('approved viewport presets and non-drag controls remain without a footer or viewport dropdown', () => {
  const rendered = html();
  for (const label of ['Desktop Large', 'Desktop', 'Tablet', 'Mobile']) assert.ok(rendered.includes(label));
  for (const size of ['1920', '1080', '1280', '800', '768', '1024', '390', '844']) assert.ok(rendered.includes(size));
  assert.match(rendered, /role="radiogroup"/);
  assert.match(rendered, /data-pan="left"/);
  assert.doesNotMatch(rendered, /<footer|class="notice"|<select/);
  assert.match(rendered, /--viewer-control:28px/);
  assert.match(rendered, /--control:44px/);
});

test('initial ready before CDP binding stays pending, while disconnected user commands report failure', () => {
  const source = html().match(/function send\(command\)\{[\s\S]*?\n  \}/)![0];
  const statuses: unknown[] = [];
  const send = runInNewContext(source + ';send', { window: {}, setStatus: (value: unknown) => statuses.push(value), Error, JSON });
  assert.equal(send({ type: 'ready' }), false);
  assert.equal(statuses.length, 0, 'bootstrap must not hide the live iframe as an embedding error');
  assert.equal(send({ type: 'retry' }), false);
  assert.equal(statuses.length, 1, 'a disconnected interactive command is still actionable');
});

test('metadata-only page confirmation changes selection without writing iframe src or resetting status', () => {
  const source = html().match(/function setPage\(info\)\{[\s\S]*?\n  \}/)![0];
  let writes = 0;
  const statuses: unknown[] = [];
  const frame = { set src(_value: string) { writes++; }, removeAttribute() { writes++; } };
  const context = { frame, setStatus: (value: unknown) => statuses.push(value), renderPages: () => undefined,
    validUrl: (value: string) => new URL(value).href, document: { title: '' } };
  const result = runInNewContext(`let pages=[],currentUrl='http://localhost:5173/',currentTitle='Preview';${source};setPage({url:'http://localhost:5173/#visited',title:'Visited',navigate:false});({currentUrl,currentTitle})`, context);
  assert.equal(writes, 0, 'confirmation must not reload the current document');
  assert.equal(statuses.length, 0);
  assert.equal(result.currentUrl, 'http://localhost:5173/#visited');
  assert.equal(result.currentTitle, 'Visited');
});

function controlStyles(): string {
  return [...html().matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/g)][1]![1]!;
}

test('disabled controls cannot receive an unconditional interactive hover treatment', () => {
  const rules = [...controlStyles().matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  const interactive = rules.filter(([, selectors, body]) => selectors!.includes(':hover') && /background|color/.test(body!));
  assert.ok(interactive.length > 0);
  for (const [, selectors] of interactive) {
    for (const selector of selectors!.split(',')) {
      assert.ok(selector.includes(':not(:disabled)') || selector.includes(':disabled'), `disabled controls must be excluded or explicitly handled: ${selector.trim()}`);
    }
  }
});

test('Nova controls use the approved neutral three-pixel focus ring rather than the old warm inset outline', () => {
  const styles = controlStyles();
  const rules = [...styles.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  const toolbarFocus = rules.filter(([, selectors]) => selectors!.includes('.toolbar button:focus-visible'));
  assert.ok(toolbarFocus.length > 0);
  assert.ok(toolbarFocus.some(([, , body]) => /box-shadow:.*var\(--nova-ring-width\).*var\(--nova-ring-color\)/.test(body!)));
  assert.ok(toolbarFocus.some(([, , body]) => /border-color:\s*var\(--nova-ring\)/.test(body!)));
});

test('Nova compact control exceptions are explicit tokens and selection maps to muted, not primary-white', () => {
  const tokens = [...html().matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/g)][0]![1]!;
  assert.match(tokens, /--control-selected-bg:\s*var\(--viewer-hover\)/);
  assert.match(tokens, /--control-selected-text:\s*var\(--viewer-text\)/);
  for (const [name, value] of [['--nova-control-font', '12.8px'], ['--nova-space-6', '6px'], ['--nova-space-10', '10px'], ['--nova-ring-width', '3px']]) {
    assert.ok(tokens.includes(`${name}:${value}`), `${name} is a named approved exception`);
  }
  assert.doesNotMatch(controlStyles(), /#[\da-f]{3,8}\b|(?:font-size|padding):\s*12\.8px/i);
});

test('connected Nova viewport items have only outer rounded ends and one shared seam', () => {
  const styles = controlStyles();
  const item = styles.match(/\.viewport-choice\{([^{}]*)\}/)![1]!;
  assert.match(item, /border-radius:\s*0/);
  assert.match(styles, /\.viewport-choice:first-child\{[^}]*border-top-left-radius:\s*var\(--radius\)/);
  assert.match(styles, /\.viewport-choice:last-child\{[^}]*border-top-right-radius:\s*var\(--radius\)/);
  assert.match(styles, /\.viewport-choice\+\.viewport-choice\{[^}]*border-left-width:\s*0/);
});

test('touch viewport controls distribute across one row without fixing the number of choices', () => {
  const styles = controlStyles();
  const viewportRules = [...styles.matchAll(/\.viewport-choices\s*\{([^{}]*)\}/g)].map((match) => match[1]).join('\n');
  assert.doesNotMatch(viewportRules, /grid-template-columns:\s*repeat\(4\s*,/, 'a fifth future choice must not be pushed onto an unmatched second row');
  assert.match(viewportRules, /grid-auto-flow:\s*column/);
  assert.match(viewportRules, /grid-auto-columns:\s*minmax\(0\s*,\s*1fr\)/);
});
