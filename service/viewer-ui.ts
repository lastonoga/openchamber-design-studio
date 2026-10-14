/** Live canvas chrome. No asset reads, app HTML proxy, credentials or host RPCs.
 * Geometry follows CSSOM viewport sizing; presentation follows CSS transforms.
 * The approved v5 design-tokens block is preserved verbatim below.
 */
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
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Design Studio · Canvas viewer</title>
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

const VIEWER_CSS = String.raw`
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

const VIEWER_MARKUP = String.raw`
<header class="toolbar" role="toolbar" aria-label="Preview controls">
<div class="left"><span class="demo" title="Design Studio live preview">DESIGN</span><div id="page-anchor" class="anchor"><button id="pages" class="page-button" aria-label="Choose preview page" aria-haspopup="menu" aria-expanded="false"><span class="page-name" id="page-name">Preview</span><span class="caret" aria-hidden="true">⌄</span></button><div id="page-menu" class="menu" role="menu" aria-label="Preview pages" hidden></div></div><span id="page-static" class="page-name" hidden>Preview</span></div>
<div class="viewport-choices" role="radiogroup" aria-label="Design viewport"><button class="viewport-choice" role="radio" data-preset="fit" aria-checked="false" tabindex="-1" title="Fit · responsive page with native scrolling">Fit</button><button class="viewport-choice" role="radio" data-preset="desktop" aria-checked="true" tabindex="0" title="Desktop · 1280 × 800">Desktop</button><button class="viewport-choice" role="radio" data-preset="large" aria-checked="false" tabindex="-1" title="Desktop Large · 1920 × 1080">Desktop Large</button><button class="viewport-choice" role="radio" data-preset="tablet" aria-checked="false" tabindex="-1" title="Tablet · 768 × 1024">Tablet</button><button class="viewport-choice" role="radio" data-preset="mobile" aria-checked="false" tabindex="-1" title="Mobile · 390 × 844">Mobile</button></div>
<div class="right"><button id="pan" class="icon" aria-label="Pan canvas" aria-pressed="false" title="Pan canvas (H)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M8 12V5a1.5 1.5 0 0 1 3 0v6-7a1.5 1.5 0 0 1 3 0v7-6a1.5 1.5 0 0 1 3 0v7-3a1.5 1.5 0 0 1 3 0v8c0 4-3 6-7 6-2 0-4-2-5-4l-3-4a1.5 1.5 0 0 1 2-2z"/></svg></button><button id="minus" class="icon" aria-label="Zoom out" title="Zoom out"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M5 12h14"/></svg></button>
<div class="anchor"><button id="zoom" class="zoom-button" aria-label="Zoom options" aria-haspopup="menu" aria-expanded="false">Width · 100%</button><div id="zoom-menu" class="menu zoom-menu" role="menu" aria-label="Zoom options" hidden><button role="menuitemradio" data-zoom="fit" aria-checked="true">Fit width <small>Fit page width, up to 100%</small></button><button role="menuitemradio" data-zoom="0.5" aria-checked="false">50%</button><button role="menuitemradio" data-zoom="1" aria-checked="false">100% <small>One design pixel per viewer pixel</small></button><button role="menuitemradio" data-zoom="2" aria-checked="false">200%</button><div class="pan-heading">Pan without dragging</div><div class="pan-actions" role="group" aria-label="Pan without dragging"><button role="menuitem" data-pan="left" aria-label="Pan left" title="Pan left">←</button><button role="menuitem" data-pan="up" aria-label="Pan up" title="Pan up">↑</button><button role="menuitem" data-pan="down" aria-label="Pan down" title="Pan down">↓</button><button role="menuitem" data-pan="right" aria-label="Pan right" title="Pan right">→</button></div></div></div><button id="plus" class="icon" aria-label="Zoom in" title="Zoom in"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M5 12h14M12 5v14"/></svg></button><span id="status" class="status" role="status" aria-live="polite">Loading…</span></div><p id="layout-reason" class="fallback" role="status" hidden></p>
</header><main id="canvas" class="canvas" tabindex="0" aria-label="Preview canvas. Arrow keys pan in page mode. Plus and minus zoom. Shift 1 fits page width. H toggles Pan."><div id="camera" class="camera"><span id="caption" class="caption" aria-hidden="true"></span><iframe id="preview" title="Live design page" referrerpolicy="no-referrer"></iframe></div><div id="pan-layer" class="pan-layer" hidden aria-hidden="true"></div><section id="state" class="state" data-state="loading" aria-labelledby="state-title"><div class="state-body"><div id="spinner" class="spinner" role="status" aria-label="Loading preview"></div><h1 id="state-title" hidden>Opening preview</h1><p id="state-copy" hidden>Waiting for the design page.</p><button id="state-action" hidden>Retry</button></div></section></main><div id="announcement" class="sr" aria-live="polite" aria-atomic="true"></div>
`;

const VIEWER_SCRIPT = String.raw`
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
