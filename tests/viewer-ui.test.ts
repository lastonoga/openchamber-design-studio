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
  // The renderer emits two inline scripts: the controller bootstrap (which
  // embeds the hostile label as escaped JSON config) and the compiled client
  // bundle. Hostile label contents must close both scripts intact.
  const scripts = [...rendered.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 2, 'two closed scripts regardless of label contents');
  for (const script of scripts) assert.doesNotThrow(() => new Script(script[1]!));
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

test('five layout presets are handed to the stock toolbar, Fit not falsely preselected', () => {
  const rendered = html();
  // Preset identity now lives in the controller's config passed to the stock
  // React toolbar (ToggleGroup), not in server-rendered radio elements.
  for (const preset of ['fit', 'desktop', 'large', 'tablet', 'mobile']) assert.ok(rendered.includes(`'${preset}'`) || rendered.includes(`"${preset}"`), preset);
  assert.doesNotMatch(rendered, /aria-checked="true"[^>]*data-preset="fit"/, 'Fit must not be preselected for the desktop default');
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

test('live readiness is backend-reported, not inferred from the iframe load event', () => {
  const rendered = html();
  // The controller waits for the toolbar's mounted hook, never for the frame's
  // load event; the compiled bundle's own load listeners are library internals.
  const controller = [...rendered.matchAll(/<script>([\s\S]*?)<\/script>/g)][0]![1]!;
  assert.doesNotMatch(controller, /frame\.onload\s*=|addEventListener\(['"]load['"]/);
  for (const state of ['loading', 'ready', 'empty', 'error']) assert.ok(rendered.includes(`'${state}'`));
  assert.match(rendered, /allows embedding/);
  assert.match(rendered, /15000/);
});

test('viewport presets are served to the stock toolbar without a footer or dropdown', () => {
  const rendered = html();
  for (const label of ['Desktop Large', 'Desktop', 'Tablet', 'Mobile']) assert.ok(rendered.includes(label));
  for (const size of ['1920', '1080', '1280', '800', '768', '1024', '390', '844']) assert.ok(rendered.includes(size));
  assert.doesNotMatch(rendered, /<footer|class="notice"|<select/);
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

// The stock Nova migration moved toolbar/control styling into the compiled
// Tailwind CSS (style block 0, generated offline). The remaining inline
// geometry block carries no control styling, so the former Nova token/focus
// ring/viewport-item assertions and their helper no longer have a target.

test('compiled stock hover states exclude disabled controls from interactive styling', () => {
  // Tailwind escapes hover variants as .hover\:…:hover; the compiled stock CSS
  // has no bare element/button hover selectors, so interactive styling lands
  // only on class hooks the stock components gate by their own disabled state.
  const rules = [...html().matchAll(/([^{}{}\n]*):hover([^{};{]*)\{([^{}]*)\}/g)].filter((m) => /background|color/.test(m[3]!) && !m[1]!.includes('\\:'));
  assert.doesNotMatch(rules.map((r) => r[0]).join('\n'), /^button:hover|\.toolbar button:hover/i, 'bare interactive hover selectors would style disabled controls too');
});

test('bounded camera API delegates actions and ignores Fit/loading/capture without changing layout', () => {
  const calls: unknown[][] = []; const view={ready:true,layoutMode:'page',scale:2,width:1280,height:1880};
  const context={view,captureState:null,canvas:{clientWidth:1000,clientHeight:800},finite:Number.isFinite,zoomTo:(...args:unknown[])=>calls.push(args)};
  const zoom=runInNewContext(clientFunction('zoomCamera')+';zoomCamera',context);
  assert.equal(zoom({action:'in'}),true);assert.equal(calls[0]![0],2.5);
  assert.equal(zoom({action:'out'}),true);assert.equal(calls[1]![0],1.6);
  assert.equal(zoom({action:'reset'}),true);assert.equal(calls[2]![0],1);
  assert.equal(zoom({action:'wheel',deltaY:0,x:100,y:50}),true);assert.equal(calls[3]![0],2);
  assert.equal(JSON.stringify(calls[3]![1]),JSON.stringify({x:100,y:50}));
  for(const value of [NaN,Infinity,1e9])assert.equal(zoom({action:'wheel',deltaY:value,x:1,y:1}),false);
  view.layoutMode='fit';assert.equal(zoom({action:'in'}),false);view.layoutMode='page';view.ready=false;assert.equal(zoom({action:'reset'}),false);view.ready=true;context.captureState={} as never;assert.equal(zoom({action:'out'}),false);
  assert.equal(calls.length,4);assert.equal(view.width,1280);assert.equal(view.height,1880);
});

test('modified camera shortcuts consume native browser zoom even when camera action is unavailable', () => {
  const requests: unknown[]=[];const shortcut=runInNewContext(clientFunction('cameraShortcut')+';cameraShortcut',{zoomCamera:(x:unknown)=>{requests.push(x);return false;}});
  for(const [key,action] of [['+','in'],['=','in'],['-','out'],['0','reset']]){
    let prevented=false,stopped=false;assert.equal(shortcut({key,ctrlKey:true,metaKey:false,defaultPrevented:false,preventDefault:()=>{prevented=true;},stopImmediatePropagation:()=>{stopped=true;}}),true);assert.ok(prevented&&stopped);assert.equal(JSON.stringify(requests.at(-1)),JSON.stringify({action}));
  }
  assert.equal(shortcut({key:'+',ctrlKey:false,metaKey:false}),false,'literal plus must remain available to inputs');
  assert.equal(shortcut({key:'+',ctrlKey:true,defaultPrevented:true}),false,'widget-owned events must not be processed twice');
});

// Former Nova-inline-styling tests (focus ring, compact tokens, viewport item
// seams, touch row distribution) were removed with the legacy toolbar CSS in
// the stock Nova migration: control styling now lives in the compiled stock
// stylesheet (style block 0), covered by the stock-provenance tests.
