import { useSyncExternalStore, type FocusEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronDown, CircleAlert, CircleCheck, Hand, LoaderCircle, Minus, Palette, Plus, TriangleAlert, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { ToolbarBridge, ToolbarMenu, ToolbarPreset, ToolbarState } from './toolbar-types';

const PRESETS = [
  ['fit', 'Fit'], ['desktop', 'Desktop'], ['large', 'Desktop Large'], ['tablet', 'Tablet'], ['mobile', 'Mobile'],
] as const;

/** Base UI uses an array even in single-selection mode. Empty means no change. */
export function selectViewport(values: readonly string[], bridge: ToolbarBridge): boolean {
  const state = bridge.getSnapshot();
  if (!state.ready || state.capturing || values.length !== 1) return false;
  const id = values[0];
  if (!PRESETS.some(([preset]) => preset === id) || id === state.preset) return false;
  bridge.selectPreset(id as Exclude<ToolbarPreset, 'custom'>);
  return true;
}

/** Scroll only the toolbar, never the document or canvas ancestors. */
export function revealControl(viewport: HTMLElement, control: HTMLElement): void {
  const box = control.getBoundingClientRect();
  const clip = viewport.getBoundingClientRect();
  const ringRoom = 4;
  if (box.left < clip.left + ringRoom) viewport.scrollLeft -= clip.left + ringRoom - box.left;
  else if (box.right > clip.right - ringRoom) viewport.scrollLeft += box.right - clip.right + ringRoom;
}

function cameraAvailable(state: ToolbarState): boolean {
  return state.ready && !state.capturing && state.layoutMode !== 'fit';
}

function setOpen(menu: Exclude<ToolbarMenu, null>, open: boolean, bridge: ToolbarBridge): void {
  if (open) {
    const state = bridge.getSnapshot();
    if (!state.capturing && (menu === 'page' || cameraAvailable(state))) bridge.setMenu(menu);
  } else if (bridge.getSnapshot().openMenu === menu) bridge.setMenu(null);
}

function Hint({ text, children }: { text: string; children: ReactNode }) {
  return <Tooltip><TooltipTrigger render={<span className="inline-flex shrink-0" />}>{children}</TooltipTrigger><TooltipContent>{text}</TooltipContent></Tooltip>;
}

function InformationIcon({ icon: Icon, label, live = false }: { icon: LucideIcon; label: string; live?: boolean }) {
  return <Tooltip>
    <TooltipTrigger render={<span tabIndex={0} role={live ? 'status' : 'img'} aria-live={live ? 'polite' : undefined} aria-label={label} className="relative inline-flex h-7 w-7 shrink-0 items-center justify-center" />}>
      <Icon size={16} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </TooltipTrigger>
    <TooltipContent>{label}</TooltipContent>
  </Tooltip>;
}

function Feedback({ state }: { state: ToolbarState }) {
  if (state.layoutMode !== 'viewport' || !state.reason) return null;
  const content = <section id="stock-toolbar-feedback" role="status" aria-label="Viewport fallback" className="flex items-start gap-2 px-2 py-1">
    <TriangleAlert size={16} aria-hidden="true" className="shrink-0" />
    <p>Viewport fallback: {state.reason}</p>
  </section>;
  const target = typeof document === 'undefined' ? null : document.getElementById('toolbar-status-area');
  // Integration supplies an unscaled normal-flow status band outside the camera.
  // If absent, keep the reason visible adjacent to the row rather than dropping it.
  return target ? createPortal(content, target) : content;
}

export function Toolbar({ bridge }: { bridge: ToolbarBridge }) {
  const state = useSyncExternalStore(bridge.subscribe, bridge.getSnapshot, bridge.getSnapshot);
  const disabled = !state.ready || state.capturing;
  const cameraDisabled = !cameraAvailable(state);
  const cameraReason = state.capturing ? 'Capture in progress. Controls are temporarily unavailable.' : !state.ready ? 'The preview is not ready.' : state.layoutMode === 'fit' ? 'Fit uses native page scrolling. Camera zoom and Pan are unavailable.' : '';
  const activePage = state.pages.find((page) => page.url === state.currentUrl);
  const title = activePage?.label || state.currentTitle || 'Preview';
  const statusLabel = state.capturing ? 'Capturing preview' : state.statusState === 'ready' ? 'Preview ready' : state.statusState === 'loading' ? 'Loading preview' : state.statusState === 'empty' ? 'No preview page available' : 'Preview failed';
  const Status = state.capturing || state.statusState === 'loading' ? LoaderCircle : state.statusState === 'ready' ? CircleCheck : CircleAlert;
  const percentage = Number.isFinite(state.scale) ? `${Math.round(state.scale * 100)}%` : '—';
  const selectedPreset = state.preset === 'custom' ? [] : [state.preset];
  const selectedZoom = state.zoomMode === 'fit' ? 'fit' : String(state.scale);
  const onFocus = (event: FocusEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLElement && event.currentTarget.contains(event.target)) revealControl(event.currentTarget, event.target);
  };
  const actCamera = (action: () => void) => { if (cameraAvailable(bridge.getSnapshot())) action(); };

  return <TooltipProvider>
    <div role="toolbar" aria-label="Design Studio preview controls" id="stock-toolbar-scroll" className="flex h-10 w-full shrink-0 flex-nowrap items-center gap-2 overflow-x-auto overflow-y-hidden px-2" onFocusCapture={onFocus}>
      <InformationIcon icon={Palette} label="Design Studio" />
      {/* modal={false}: a modal menu disables pointer interactions on outside
          elements, which would make clicks/touches on the live artifact never
          reach the preview — artifact dismissal (pointerdown → dismiss) is how
          the canvas closes the menu. Menu state stays controller-owned. */}
      {state.pages.length > 1 ? <DropdownMenu modal={false} open={state.openMenu === 'page'} onOpenChange={(open) => setOpen('page', open, bridge)}>
        <DropdownMenuTrigger render={<Button id="pages" variant="outline" size="sm" disabled={disabled} aria-label={`Choose page: ${title}`} />}>
          <span className="max-w-48 truncate">{title}</span><ChevronDown aria-hidden="true" data-icon="inline-end" />
        </DropdownMenuTrigger>
        <DropdownMenuContent id="page-menu" className="menu">
          <DropdownMenuRadioGroup value={activePage?.id ?? ''} onValueChange={(id: string) => {
            const snapshot = bridge.getSnapshot();
            if (snapshot.ready && !snapshot.capturing && snapshot.pages.some((page) => page.id === id)) bridge.selectPage(id);
          }}>
            {state.pages.map((page) => <DropdownMenuRadioItem key={page.id} value={page.id} closeOnClick aria-label={page.label}>
              <span className="min-w-0 break-words">{page.label}</span>
            </DropdownMenuRadioItem>)}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu> : <span id="page-static" className="max-w-48 shrink-0 truncate" title={title}>{title}</span>}

      <ToggleGroup aria-label={state.preset === 'custom' ? `Design viewport: Custom ${state.width} × ${state.height}` : 'Design viewport'} variant="outline" size="sm" spacing={0} multiple={false} value={selectedPreset} onValueChange={(values) => selectViewport(values, bridge)} disabled={disabled} className="shrink-0">
        {PRESETS.map(([id, label]) => <ToggleGroupItem key={id} value={id} aria-label={label}>{label}</ToggleGroupItem>)}
      </ToggleGroup>

      <Hint text={cameraReason || 'Pan canvas'}>
        <Toggle id="pan" size="sm" variant="default" aria-label="Pan canvas" aria-describedby={cameraDisabled ? 'stock-camera-reason' : undefined} disabled={cameraDisabled} pressed={state.pan} onPressedChange={() => actCamera(bridge.togglePan)}><Hand aria-hidden="true" /></Toggle>
      </Hint>
      <Hint text={cameraReason || 'Zoom out'}><Button id="minus" variant="ghost" size="icon-sm" aria-label="Zoom out" aria-describedby={cameraDisabled ? 'stock-camera-reason' : undefined} disabled={cameraDisabled || state.scale <= .1} onClick={() => actCamera(() => { bridge.zoomCamera({ action: 'out' }); })}><Minus aria-hidden="true" /></Button></Hint>
      <DropdownMenu modal={false} open={state.openMenu === 'zoom'} onOpenChange={(open) => setOpen('zoom', open, bridge)}>
        <DropdownMenuTrigger render={<Button id="zoom" variant="outline" size="sm" aria-label={`Zoom options: ${percentage}`} aria-describedby={cameraDisabled ? 'stock-camera-reason' : undefined} disabled={cameraDisabled} />}>
          {state.zoomMode === 'fit' && state.layoutMode !== 'fit' ? `Width · ${percentage}` : percentage}<ChevronDown aria-hidden="true" data-icon="inline-end" />
        </DropdownMenuTrigger>
        <DropdownMenuContent id="zoom-menu" className="menu">
          <DropdownMenuGroup><DropdownMenuLabel>Zoom</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={selectedZoom} onValueChange={(value: string) => actCamera(() => bridge.zoomTo(value === 'fit' ? 'fit' : Number(value)))}>
              <DropdownMenuRadioItem value="fit" closeOnClick>Fit width</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="0.5" closeOnClick>50%</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="1" closeOnClick>100%</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="2" closeOnClick>200%</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup><DropdownMenuLabel>Pan without dragging</DropdownMenuLabel>
            {([['left', 'Pan left', ArrowLeft], ['up', 'Pan up', ArrowUp], ['down', 'Pan down', ArrowDown], ['right', 'Pan right', ArrowRight]] as const).map(([direction, label, Icon]) => <DropdownMenuItem key={direction} onClick={() => actCamera(() => bridge.panBy(direction))}><Icon aria-hidden="true" />{label}</DropdownMenuItem>)}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <Hint text={cameraReason || 'Zoom in'}><Button id="plus" variant="ghost" size="icon-sm" aria-label="Zoom in" aria-describedby={cameraDisabled ? 'stock-camera-reason' : undefined} disabled={cameraDisabled || state.scale >= 3} onClick={() => actCamera(() => { bridge.zoomCamera({ action: 'in' }); })}><Plus aria-hidden="true" /></Button></Hint>
      <InformationIcon icon={Status} label={state.message ? `${statusLabel}: ${state.message}` : statusLabel} live />
      {state.statusState === 'error' ? <Button size="sm" variant="outline" disabled={state.capturing} onClick={() => { if (!bridge.getSnapshot().capturing) bridge.retry(); }}>Retry</Button> : null}
      <span id="stock-camera-reason" className="sr-only">{cameraReason}</span>
    </div>
    <Feedback state={state} />
  </TooltipProvider>;
}
