/** Self-contained: serialized once by the HTML renderer before the React entry. */
export function initCanvas(initialConfig) {
  if (window.__dsToolbarBridge) return window.__dsCanvas;
  const $ = id => document.getElementById(id);
  const canvas = $('canvas'), camera = $('camera'), frame = $('preview');
  const presets = {desktop:{width:1280,height:800},large:{width:1920,height:1080},tablet:{width:768,height:1024},mobile:{width:390,height:844}};
  let pages = initialConfig.pages, currentUrl = '', currentTitle = 'Preview';
  const view = {width:initialConfig.viewport.width,height:initialConfig.viewport.height,nominalHeight:initialConfig.viewport.height,layoutMode:'viewport',reason:'',preset:'desktop',mode:'fit',scale:1,panX:0,panY:0,pan:false,space:false,ready:false};
  let openMenu = null, drag = null, slowTimer = null, statusState = 'loading', message = '';
  let captureState = null, captureSequence = 0, repaintPending = false;
  // Geometry constants from the original camera, not toolbar/theme tokens.
  const numToken = name => name === '--s7' ? 48 : name === '--pan-step' ? 32 : parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const listeners = new Set();
  let snapshot = null, publicationDepth = 0;
  function publish(){
    if(publicationDepth)return;
    const oldPages=snapshot?.pages;
    const samePages=oldPages&&oldPages.length===pages.length&&pages.every((p,i)=>p.id===oldPages[i].id&&p.label===oldPages[i].label&&p.url===oldPages[i].url);
    const next={ready:view.ready,statusState,message,pages:samePages?oldPages:Object.freeze(pages.map(p=>Object.freeze({...p}))),currentUrl,currentTitle,preset:view.preset,width:view.width,height:view.height,layoutMode:view.layoutMode,reason:view.reason,zoomMode:view.mode,scale:view.scale,pan:view.pan,capturing:!!captureState,openMenu};
    if(snapshot&&Object.keys(next).every(key=>next[key]===snapshot[key]))return;
    snapshot=Object.freeze(next);for(const listener of [...listeners])listener();
  }
  function transaction(fn){publicationDepth++;try{return fn();}finally{publicationDepth--;publish();}}
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
    $('caption').hidden=adaptive;$('layout-reason').hidden=!(view.layoutMode==='viewport'&&view.reason);$('layout-reason').textContent=view.reason?'Viewport fallback: '+view.reason:'';
    $('caption').textContent=(view.preset==='large'?'DESKTOP LARGE':view.preset.toUpperCase())+' · '+view.width+' × '+view.height;
    $('pan-layer').hidden=!(view.ready&&(view.pan||view.space));
    publish();
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
  function closeMenu(refocus=true){if(!openMenu||captureState)return false;const id=openMenu;openMenu=null;publish();if(refocus)$(id==='page'?'pages':'zoom')?.focus();return true;}
  function setStatus(info){
    if(!info||!['loading','ready','empty','error'].includes(info.state))return false;
    if(captureState){captureState.pendingStatus=info;return true;}
    clearTimeout(slowTimer);statusState=info.state;view.ready=info.state==='ready';
    if(!view.ready){closeMenu();view.space=false;if(info.state!=='loading')view.pan=false;}
    camera.hidden=info.state==='empty'||info.state==='error';$('state').hidden=view.ready;$('spinner').hidden=info.state!=='loading';$('state-action').hidden=info.state==='loading'||view.ready;
    $('state').dataset.state=info.state;$('state-title').hidden=info.state==='loading';$('state-copy').hidden=info.state==='loading';
    const defaults={loading:['Opening preview','Waiting for the design page.'],empty:['No preview page available','Choose a confirmed page, or retry after adding a preview entry to the project.'],error:['Preview could not be displayed','Check that the dev server is running and the page allows embedding, then retry.']};
    if(!view.ready){$('state-title').textContent=defaults[info.state][0];$('state-copy').textContent=typeof info.message==='string'?info.message:defaults[info.state][1];}
    message=typeof info.message==='string'?info.message:view.ready?'Ready':info.state==='loading'?'Loading…':info.state==='empty'?'No page':'Load failed';
    if(info.state==='loading')slowTimer=setTimeout(()=>{if(statusState!=='loading')return;$('state-copy').textContent='Still opening the preview. Try again if the page is unavailable.';$('state-copy').hidden=false;$('state-action').hidden=false;announce($('state-copy').textContent);},15000);
    paint();announce(message);return true;
  }
  function send(command){
    if(command.type==='ready'&&typeof window.__dsCanvasSend!=='function')return false;
    try{if(typeof window.__dsCanvasSend!=='function')throw new Error('Preview controls are not connected. Reopen the preview window.');window.__dsCanvasSend(JSON.stringify(command));return true;}
    catch(error){setStatus({state:'error',message:error instanceof Error?error.message:'Could not contact the preview service. Retry.'});return false;}
  }
  function renderPages(){if(openMenu==='page')closeMenu();publish();}
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
  function zoomCamera(info){
    if(!info||!['in','out','reset','wheel'].includes(info.action)||!view.ready||captureState||view.layoutMode==='fit')return false;
    if(info.action==='in')zoomTo(view.scale*1.25);
    else if(info.action==='out')zoomTo(view.scale/1.25);
    else if(info.action==='reset')zoomTo(1);
    else{if(![info.deltaY,info.x,info.y].every(finite)||Math.abs(info.deltaY)>8192)return false;zoomTo(view.scale*Math.exp(-info.deltaY*.005),{x:Math.max(0,Math.min(canvas.clientWidth,info.x)),y:Math.max(0,Math.min(canvas.clientHeight,info.y))});}
    return true;
  }
  function cameraShortcut(event){
    if(event.defaultPrevented||!(event.ctrlKey||event.metaKey))return false;
    const action=event.key==='+'||event.key==='='?'in':event.key==='-'?'out':event.key==='0'?'reset':null;
    if(!action)return false;event.preventDefault();event.stopImmediatePropagation();zoomCamera({action});return true;
  }
  function setPan(next){if(!view.ready||captureState||view.layoutMode==='fit')return;view.pan=next;view.space=false;paint();if(next)canvas.focus();announce(next?'Pan canvas enabled. Escape returns to page interaction.':'Page interaction enabled.');}
  function beginCapture(){
    if(captureState)throw new Error('Canvas capture is already active.');
    captureState={token:++captureSequence,view:{...view},body:document.body.style.cssText,styles:[camera,canvas,frame].map(el=>[el,el.style.cssText])};
    window.__dsCaptureActive=true;document.body.style.pointerEvents='none';publish();return captureState.token;
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
  document.addEventListener('keydown',e=>{
    if(e.defaultPrevented||cameraShortcut(e))return;
    // Stock DropdownMenu owns all menu keyboard/focus and dismissal handling.
    if(openMenu)return;
    if(e.key==='Escape'&&(view.pan||view.space)){e.preventDefault();setPan(false);$('pan')?.focus();return;}
    if(document.activeElement!==canvas||!view.ready||view.layoutMode==='fit')return;
    if(e.key===' '){e.preventDefault();view.space=true;paint();}else if(e.key.toLowerCase()==='h'){e.preventDefault();setPan(!view.pan);}else if(e.key==='+'||e.key==='='){e.preventDefault();zoomTo(view.scale*1.25);}else if(e.key==='-'){e.preventDefault();zoomTo(view.scale/1.25);}else if(e.shiftKey&&(e.code==='Digit1'||e.key==='!')){e.preventDefault();zoomTo('fit');}else if(e.shiftKey&&(e.code==='Digit0'||e.key===')')){e.preventDefault();zoomTo(1);}else if(e.key.startsWith('Arrow')){e.preventDefault();moveCamera(e.key.slice(5).toLowerCase(),e.shiftKey?3:1);}
  });
  function moveCamera(direction,multiplier=1){if(!view.ready||captureState||view.layoutMode==='fit')return;view.mode='manual';const step=numToken('--pan-step')*multiplier;if(direction==='left')view.panX-=step;if(direction==='right')view.panX+=step;if(direction==='up')view.panY-=step;if(direction==='down')view.panY+=step;paint();}
  document.addEventListener('keyup',e=>{if(e.key===' '){view.space=false;paint();}});window.addEventListener('blur',()=>{view.space=false;drag=null;canvas.classList.remove('dragging');paint();});
  function choosePreset(id){if(!view.ready||captureState||!(id==='fit'||Object.hasOwn(presets,id)))return;if(id==='fit'){setLayout({mode:'fit',preset:'fit',...getFitBounds(),nominalHeight:view.nominalHeight});send({type: 'layout',mode:'fit',preset:'fit'});}else{const p=presets[id];setLayout({mode:'viewport',preset:id,width:p.width,height:p.height,nominalHeight:p.height});send({type: 'layout',mode:'page',preset:id});}announce((id==='large'?'Desktop Large':id)+' layout');}
  canvas.addEventListener('pointerdown',e=>{if(!view.ready||view.layoutMode==='fit'||e.button!==0||e.target.closest('.state'))return;canvas.focus();view.mode='manual';drag={x:e.clientX,y:e.clientY,panX:view.panX,panY:view.panY};canvas.setPointerCapture(e.pointerId);canvas.classList.add('dragging');e.preventDefault();});
  canvas.addEventListener('pointermove',e=>{if(!drag)return;view.panX=drag.panX+e.clientX-drag.x;view.panY=drag.panY+e.clientY-drag.y;paint();});
  function endDrag(e){if(!drag)return;drag=null;canvas.classList.remove('dragging');if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);}canvas.addEventListener('pointerup',endDrag);canvas.addEventListener('pointercancel',endDrag);
  function wheelInput(deltaX,deltaY,x,y,zoom){if(!view.ready||captureState||view.layoutMode==='fit'||![deltaX,deltaY,x,y].every(finite))return false;if(zoom)zoomTo(view.scale*Math.exp(-deltaY*.005),{x,y});else{view.mode='manual';view.panX-=deltaX;view.panY-=deltaY;paint();}return true;}
  canvas.addEventListener('wheel',e=>{if(e.defaultPrevented)return;const b=canvas.getBoundingClientRect();if(e.ctrlKey||e.metaKey){e.preventDefault();e.stopPropagation();zoomCamera({action:'wheel',deltaY:e.deltaY,x:e.clientX-b.left,y:e.clientY-b.top});return;}if(!view.ready||view.layoutMode==='fit'||e.target.closest('.state'))return;e.preventDefault();wheelInput(e.deltaX,e.deltaY,e.clientX-b.left,e.clientY-b.top,false);},{passive:false});
  document.addEventListener('wheel',e=>{if(e.defaultPrevented||!(e.ctrlKey||e.metaKey))return;e.preventDefault();e.stopPropagation();const b=canvas.getBoundingClientRect();zoomCamera({action:'wheel',deltaY:e.deltaY,x:e.clientX-b.left,y:e.clientY-b.top});},{passive:false});
  let fitSizeQueued=false;
  new ResizeObserver(()=>{paint();if(view.layoutMode==='fit'&&!captureState&&!fitSizeQueued){fitSizeQueued=true;requestAnimationFrame(()=>{fitSizeQueued=false;if(view.layoutMode==='fit'&&!captureState)send({type: 'fit-size'});});}}).observe(canvas);
  function retry(){if(captureState)return;setStatus({state:'loading'});send({type: 'retry'});}
  $('state-action').onclick=()=>transaction(retry);
  frame.addEventListener('error',()=>transaction(()=>setStatus({state:'error',message:'The preview could not be displayed. Check that the dev server is running and the page allows embedding, then retry.'})));
  window.__dsCanvas = {
    setViewport:(...args)=>transaction(()=>setViewport(...args)),setLayout:info=>transaction(()=>setLayout(info)),getFitBounds,setStatus:info=>transaction(()=>setStatus(info)),setPage:info=>transaction(()=>setPage(info)),beginCapture,normalizeCapture,endCapture:token=>transaction(()=>endCapture(token)),zoomCamera:info=>transaction(()=>zoomCamera(info)),
    getCamera:()=>({mode:view.mode,scale:view.scale,panX:view.panX,panY:view.panY,width:view.width,height:view.height,preset:view.preset,layoutMode:view.layoutMode,nominalHeight:view.nominalHeight,reason:view.reason}),
    restoreCamera:state=>transaction(()=>{if(captureState||!state||!['fit','manual'].includes(state.mode)||![state.scale,state.panX,state.panY].every(finite)||state.scale<=0)return false;if(state.layoutMode!==undefined&&!setLayout({mode:state.layoutMode,preset:state.preset,width:state.width,height:state.height,nominalHeight:state.nominalHeight,reason:state.reason||''}))return false;view.mode=state.mode;view.scale=Math.min(3,Math.max(.05,state.scale));view.panX=state.panX;view.panY=state.panY;paint();return true;}),
    dismissMenu:()=>closeMenu(),
    handleCanvasInput:event=>{if(!event||view.layoutMode==='fit'||(!view.pan&&view.layoutMode!=='page')||event.type!=='wheel')return false;return wheelInput(event.deltaX,event.deltaY,event.x,event.y,Boolean(event.zoom));}
  };
  window.__dsToolbarBridge = {
    getSnapshot:()=>snapshot,subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener);},
    selectPreset:id=>transaction(()=>choosePreset(id)),
    selectPage:id=>transaction(()=>{if(!view.ready||captureState||!pages.some(p=>p.id===id))return;closeMenu();send({type: 'page',id});}),
    zoomTo:value=>transaction(()=>{if(!view.ready||captureState||view.layoutMode==='fit')return;zoomTo(value);closeMenu();}),
    zoomCamera:info=>transaction(()=>zoomCamera(info)),togglePan:()=>transaction(()=>setPan(!view.pan)),
    panBy:direction=>transaction(()=>{if(!view.ready||captureState||view.layoutMode==='fit'||!['left','right','up','down'].includes(direction))return;moveCamera(direction);announce('Canvas moved '+direction+'.');closeMenu();}),
    retry:()=>transaction(retry),setMenu:id=>{if(captureState||!(id===null||id==='page'||id==='zoom')||(id!==null&&!view.ready))return;if(openMenu===id)return;openMenu=id;publish();}
  };
  // Main's layout effect calls this only after stock semantic hooks are mounted.
  let readySent=false;
  window.__dsToolbarMounted=()=>{if(readySent)return true;readySent=send({type: 'ready'});return readySent;};
  transaction(()=>{setViewport(view.width,view.height);setPage({url:initialConfig.url,pages:initialConfig.pages});if(initialConfig.url)setStatus({state:'loading'});});
  return window.__dsCanvas;
}
