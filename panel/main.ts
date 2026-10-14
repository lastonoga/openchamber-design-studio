// Design Studio surfaces.
//
// Two surfaces, one thin row, one full-page home:
//   - "status" (chat Work Status) — the ambient mirror: a compact row with the
//     Start/Stop control, Design Mode toggle, session status and Cmd/Ctrl-click hint.
//   - "panel" (rail panel) — a one-line pointer to the creation page.
//   - "page" (the sidebar "Extension pages → Design Studio" entry) — the centred
//     creation home: a display headline, the prompt composer with its type chip
//     and working-directory selector, and a list of idea cards.
// Any other surface renders nothing. Nothing opens a live window on its own:
// opening happens ONLY on the Design Mode toggle turning ON (or a Reopen/Retry).
//
// Picked elements become chat references (`host.attach`): a Cmd/Ctrl-click in
// the live Chrome window is the pick gesture. The live view is a real headful
// Chrome window the local service opens; this page only opens it, raises it and
// reads its state. English-only copy by requirement.
import { type GuestSessionsSnapshot, type HostReadyContext } from '@openchamber/sdk';
import { applyHostReady } from '@openchamber/sdk/ui';

import {
  ATTACH_NEEDS_URL,
  DESIGN_READY_BADGE,
  NEEDS_PROJECT_MESSAGE,
  NO_CONFIG_BADGE,
  NO_DESIGN_WORK_MESSAGE,
  NO_PROJECT_CONFIG_MESSAGE,
  NO_PROJECT_URL_MESSAGE,
  OPENING_STATUS,
  PANEL_SIDEBAR_HINT,
  PICK_HINT,
  ServiceUnavailable,
  allProjectsFromSnapshot,
  closeLive,
  countOtherActiveDesignSessions,
  decideProjectOpen,
  designChatMeta,
  designChatRows,
  designSessionStatus,
  designWorkRows,
  ensureHarness,
  focusLive,
  formatOpenStatus,
  getConfig,
  getServerStatus,
  getState,
  host,
  isLoopbackUrl,
  modeSessionIdFromKey,
  openLive,
  pickHintActive,
  projectMeta,
  projectReady,
  projectRows,
  referenceText,
  resolveDesignTarget,
  scaffoldProject,
  shouldStopDevServer,
  startDevServer,
  stopDevServer,
  validateReferencePath,
  type DesignChatRow,
  type DesignChatsView,
  type DesignTarget,
  type LiveState,
  type PickPayload,
  type ProjectConfigRead,
  type ProjectRow,
  type ProjectSessions,
  type ProjectsView,
  type RegisteredProject,
  type ScaffoldResult,
  type ServerStartResult,
  type StudioConfig,
} from './api.ts';
import { DIRECTIONS, type DirectionId } from './craft.ts';
import {
  DEFAULT_MODE,
  DESIGN_TYPES,
  FIDELITIES,
  FIDELITY_OPTIONS,
  NO_DESIGN_SYSTEM,
  TYPE_HINT,
  attachUrl,
  buildModeChip,
  designMarkerKey,
  designMarkerValue,
  designSessionIdFromKey,
  designSessionPrompt,
  designSystemGroups,
  designSystemLabel,
  designSystemSwatches,
  fileBaseName,
  fileReferenceChip,
  filterDesignSystems,
  findDesignSystem,
  modeStorageKey,
  parseDesignArgs,
  popoverStep,
  projectHttpUrl,
  projectReferenceChip,
  seedModeValue,
  seedSessionData,
  type DesignBriefSpec,
  type DesignMode,
  type DesignType,
  type Fidelity,
} from './mode.ts';
import type { DesignSystemPreset } from '../shared/design-systems.ts';
import { addDraftReference, removeDraftReference, buildReferenceSubmission, type DraftReference } from './reference-draft.ts';

const POLL_MS = 900;

const FALLBACK_CONFIG: StudioConfig = { version: 1, name: '', type: 'hi-fi', url: 'http://localhost:5173', entry: 'index.html' };

type TrackedPick = PickPayload & { seq: number; url: string; pickedAt: Date };

/** One suggestion under the composer: a title, a one-liner and the brief it seeds. */
type Idea = { title: string; description: string; prompt: string };

/**
 * The design types as they read on the creation page: short labels for the
 * headline and the chip. The compact session row has no creation selectors.
 */
const PAGE_TYPE_LABELS: Record<DesignType, string> = {
  wireframe: 'Wireframe',
  'hi-fi': 'Hi-fi screens',
  prototype: 'Prototype',
  deck: 'Slide deck',
  custom: 'Custom',
};

/**
 * Idea cards, framed by the selected type: choosing a type reframes these. There
 * are no real project thumbnails, so each card carries a small abstract SVG
 * preview instead (see `ideaThumb`). English only.
 */
const IDEAS: Record<DesignType, Idea[]> = {
  prototype: [
    { title: 'Gamified Habit App', description: 'Daily streaks with playful rewards', prompt: 'A gamified habit-tracking app with daily streaks, points, and playful rewards.' },
    { title: 'Interactive Dashboard', description: 'Live metrics, filters and charts', prompt: 'An interactive dashboard with live metrics, filters, and charts.' },
    { title: 'Booking Flow', description: 'Pick a slot, confirm, pay', prompt: 'An interactive booking flow: choose a date and slot, confirm the details, and pay.' },
  ],
  'hi-fi': [
    { title: 'Luxury Property Website', description: 'Elegant listings and detail pages', prompt: 'A luxury property website with elegant listings, a photo gallery, and property detail pages.' },
    { title: 'Product Pricing Page', description: 'Three tiers, clear comparison', prompt: 'A product pricing page with three tiers and a clear feature comparison.' },
    { title: 'Marketing Landing Page', description: 'Hero, features and a call to action', prompt: 'A marketing landing page with a hero, feature highlights, and a strong call to action.' },
  ],
  deck: [
    { title: 'New Hire Onboarding Guide', description: 'A welcome deck for the first week', prompt: 'A new-hire onboarding deck covering the first week, the tools, and the team.' },
    { title: 'Q3 Product Review', description: 'Results, learnings and next bets', prompt: 'A Q3 product review deck: results, learnings, and the next bets.' },
    { title: 'Sales Pitch', description: 'Problem, solution, proof, pricing', prompt: 'A sales pitch deck: problem, solution, proof, and pricing.' },
  ],
  wireframe: [
    { title: 'Checkout Flow', description: 'Cart to confirmation, boxes only', prompt: 'A wireframe of the checkout flow from cart to confirmation, boxes and labels only.' },
    { title: 'Onboarding Steps', description: 'Sign-up to first value', prompt: 'A wireframe of the onboarding steps from sign-up to first value.' },
    { title: 'App Navigation', description: 'Tabs, menus and top-level screens', prompt: 'A wireframe of the app navigation: tabs, menus, and the top-level screens.' },
  ],
  custom: [
    { title: 'Marketing Page', description: 'A single page that sells', prompt: 'A single marketing page that explains the product and asks for one clear action.' },
    { title: 'Mobile App', description: 'A multi-screen product', prompt: 'A multi-screen mobile app for the core flow.' },
    { title: 'Data Tool', description: 'A dashboard or console', prompt: 'A data tool: a dashboard or console for the team to read at a glance.' },
  ],
};

const state = {
  surface: 'panel',
  directory: null as string | null,
  sessionId: null as string | null,
  mode: { ...DEFAULT_MODE } as DesignMode,
  resolveAllowed: false,
  config: null as StudioConfig | null,
  configPath: null as string | null,
  /**
   * The directory `config` was read for. `onDirectory` keeps the last config
   * until the fresh read resolves, so a stale cached config is only ever used
   * when it belongs to the CURRENT directory (`currentConfig()`).
   */
  configDir: null as string | null,
  url: 'about:blank',
  title: '',
  windowOpen: false,
  /**
   * True while OUR side is bringing the window up: an open in flight, or the
   * whole Design Mode ON transition (which awaits the persist and the marker
   * writes before it opens). The close-detection below flips Design Mode OFF
   * when `/state` reports `windowOpen:false` while the mode is ON — but not
   * while we are the ones opening the window, so this gates it. Nothing else
   * consults it: it never suppresses an explicit user open.
   */
  pendingOpen: false,
  lastSeq: 0,
  /** The current session's live `SessionSnapshot.busy`, from `host.onSession`. */
  sessionBusy: false,
  /** Project dirs whose dev server THIS panel started (`/open` reported `started`). */
  startedServers: new Set<string>(),
  /**
   * A stop waiting for the session to go idle (Design Mode OFF happened while
   * busy). The queued REQUEST — its directory and manual mode — is preserved,
   * so honouring it later neither loses the manual flag (an empty ownership
   * set would then refuse it forever) nor targets the wrong directory.
   */
  pendingStop: null as null | { dir: string; manual: boolean },
  /**
   * Current preview-dev-server reachability for the row's Start/Stop control.
   * `null` = unknown: nothing has been read yet (or a start answer carried no
   * `up`), and the icon must render as checking — never masquerade as stopped.
   */
  serverStatus: null as boolean | null,
  /** True while a manual start/stop is in flight. */
  serverPending: false,
  /** Last error from a server start/status action (for screen-reader announcement). */
  serverError: null as string | null,
  // ---- full-page creation surface ----
  /** The registered projects, as the working-directory selector renders them. */
  projects: null as ProjectsView | null,
  /** The selected creation type; drives the headline, chip and the idea cards. */
  pageType: 'hi-fi' as DesignType,
  pageDirection: 'auto' as 'auto' | DirectionId,
  pageFidelity: 'hi-fi' as Fidelity,
  prompt: '' as string,
  references: [] as DraftReference[],
  /** An actionable error from a failed scaffold (the session still starts). */
  pageError: '' as string,
  pageBusy: false,
  /** The chosen registered project; `null` means the current project. */
  selectedProjectId: null as string | null,
  typeMenuOpen: false,
  dirMenuOpen: false,
  /** The `+` attach overlay: its open state. */
  attachMenuOpen: false,
  /** The design-system picker panel open in the composer. */
  dsMenuOpen: false,
  /** The chosen design-system preset id, or null for "No design system". */
  pageDesignSystemId: null as string | null,
  // ---- design projects & chats (the lists below the composer) ----
  /** The design-chats list: sessions across the projects whose Design Mode is ON. */
  designChats: null as DesignChatsView | null,
  /**
   * The id of the project whose chats the merged list is filtered to, or null
   * for the full list. Set by clicking a project row (which also makes it the
   * working target); cleared by `Show all`. It NEVER starts a session.
   */
  projectFilter: null as string | null,
};

let hintEl: HTMLElement;
let sessionLineEl: HTMLElement | null = null;
let pageBody: HTMLElement | null = null;
let statusRoot: HTMLElement | null = null;
let modeToggleBtn: HTMLButtonElement | null = null;
/** The interactive header line (the Design Mode toggle); hidden entirely when not ready. */
let barEl: HTMLElement | null = null;
/** The preview-dev-server Start/Stop icon button; null when not rendered. */
let serverBtn: HTMLButtonElement | null = null;
/** Screen-reader-only live region for server state changes. */
let serverAnnounceEl: HTMLElement | null = null;

// Composer refs, updated in place so typing never rebuilds the page (and never
// steals the caret). Null whenever the page is not mounted.
let promptEl: HTMLTextAreaElement | null = null;
let sendEl: HTMLButtonElement | null = null;
let accentFillEl: HTMLElement | null = null;
/** Play the staggered reveal only on the first paint, not on every re-render. */
let pageEnter = true;
/** Live state of the open design-system picker: the search text and the highlighted entry (null = "No design system"). */
let dsQuery = '';
let dsHighlight: string | null = null;
/**
 * The `+` panel's paste-a-path draft. Module-level like `dsQuery`, so a
 * background re-render (a live sessions snapshot rebuilding the lists) keeps
 * what the user is typing; reset when the overlay opens and on submit.
 */
let attachPathDraft = '';
let referenceError = '';
let referencePending = false;
let referenceSlow = false;
let referenceRequest = 0;
let referenceLiveEl: HTMLElement | null = null;
let referenceFocusId: string | null = null;
const DROP_PATH_MESSAGE = 'Paste an accessible file path using + → File path. Dropped filenames do not include their filesystem path.';

function announceReference(message: string): void {
  if (!referenceLiveEl) return;
  referenceLiveEl.textContent = '';
  queueMicrotask(() => { if (referenceLiveEl) referenceLiveEl.textContent = message; });
}

/** Invalidate work from a closed menu or an already submitted/reset draft. */
function cancelReferenceValidation(): void {
  referenceRequest += 1;
  referencePending = false;
  referenceSlow = false;
}

/** Collapses overlapping `.design-studio.json` reads (mount + poll can race). */
let configReadInFlight = false;

// The design-chats list's live inputs: the projects it spans, the latest sessions
// snapshot per project, the session ids whose Design Mode is ON, and the
// (un)subscribe handles `host.onSessions` returns. Module-level, so a live
// update can recompute the list without threading state through every call.
let chatProjects: RegisteredProject[] = [];
/**
 * EVERY registered project (id + name + directory), config or not. The chats
 * scan spans this, not the config-filtered `state.projects` rows: a design
 * session in a project with no `.design-studio.json` must still be listed. The
 * composer's target resolution matches the frame directory against it too. Set
 * by `loadProjects` from the raw workspace snapshot.
 */
let allProjects: RegisteredProject[] = [];
let chatSnapshots = new Map<string, GuestSessionsSnapshot>();
let chatOnIds: ReadonlySet<string> = new Set<string>();
/** The session ids carrying a persistent `design/<id>` marker (survives mode OFF). */
let chatMarkerIds: ReadonlySet<string> = new Set<string>();
/**
 * The session ids that have EVER had a `mode/<id>` entry, whatever its `on`
 * value. This key is written the first time Design Mode is used and kept when the
 * mode is later turned off, so its mere existence marks a session the user has
 * used for design — the only signal that exists for a history predating the
 * persistent marker.
 */
let chatModeKeyIds: ReadonlySet<string> = new Set<string>();
let chatUnsubscribes: Array<() => void> = [];

function q<T extends HTMLElement>(tag: string, cls?: string, text?: string): T {
  const node = document.createElement(tag) as T;
  if (cls) node.className = cls;
  if (text) node.textContent = text;
  return node;
}

function option(value: string, label: string): HTMLOptionElement {
  const node = q<HTMLOptionElement>('option');
  node.value = value;
  node.textContent = label;
  return node;
}

/**
 * Errors and warnings the section must not swallow. The status row has no
 * general status line of its own, so the panel routes them to a toast (deduped,
 * since the poll can repeat the same outage every tick). Informational lines are
 * deliberately silent: the row carries only the Design Mode toggle.
 */
let lastStatus = '';
function setStatus(message: string, kind: 'info' | 'error' | 'warn' = 'info'): void {
  if (kind === 'info') return;
  if (message === lastStatus) return;
  lastStatus = message;
  void host.toast({ kind: kind === 'error' ? 'error' : 'info', message });
}

// ---- last-known URL (per project) ----

/**
 * The persisted last-known live-window URL for a project dir. Design Mode ON can
 * fall back to it when the live `.design-studio.json` is gone and no config is
 * cached, so a project whose config was deleted still reopens at its last page.
 * Keyed by the project dir, so each project remembers its own.
 */
function lastUrlKey(dir: string | null): string | null {
  return dir ? `lastUrl/${dir}` : null;
}

async function loadLastUrl(dir: string | null): Promise<string | null> {
  const key = lastUrlKey(dir);
  if (!key) return null;
  try {
    const value = await host.storage.get(key);
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
  } catch {
    return null;
  }
}

async function saveLastUrl(dir: string | null, url: string): Promise<void> {
  const key = lastUrlKey(dir);
  if (!key) return;
  try {
    await host.storage.set(key, url);
  } catch {
    /* a convenience only; opening still works without it */
  }
}

// ---- Design Mode ----

function modeStoragePayload(): { on: boolean; type: DesignType; direction: DesignMode['direction']; fidelity: Fidelity; brief: string } {
  return {
    on: state.mode.on,
    type: state.mode.type,
    direction: state.mode.direction,
    fidelity: state.mode.fidelity,
    brief: state.mode.brief.slice(0, 2000),
  };
}

async function saveMode(): Promise<void> {
  const key = modeStorageKey(state.sessionId);
  if (!key) return;
  try {
    await host.storage.set(key, modeStoragePayload());
  } catch {
    /* mode is a convenience; chat still works */
  }
}

/**
 * Record that Design Mode was turned ON for this session, permanently. Written
 * once on the ON transition (never on a render, never on the OFF transition or a
 * window close), and never cleared, so the session stays a design chat in "Your
 * design work" even after the live window closes.
 */
async function writeDesignMarker(): Promise<void> {
  const key = designMarkerKey(state.sessionId);
  if (!key) return;
  try {
    await host.storage.set(key, designMarkerValue());
  } catch {
    /* the session's own mode chip still marks it; the marker is a bonus */
  }
}

async function loadMode(): Promise<void> {
  const key = modeStorageKey(state.sessionId);
  if (!key) return;
  try {
    const stored = (await host.storage.get(key)) as Partial<DesignMode> | undefined;
    if (stored && typeof stored === 'object') {
      state.mode.on = Boolean(stored.on);
      if (DESIGN_TYPES.includes(stored.type as DesignType)) state.mode.type = stored.type as DesignType;
      if (stored.direction !== undefined && (stored.direction === 'auto' || stored.direction in DIRECTIONS)) state.mode.direction = stored.direction as DesignMode['direction'];
      if (FIDELITIES.includes(stored.fidelity as Fidelity)) state.mode.fidelity = stored.fidelity as Fidelity;
      state.mode.brief = typeof stored.brief === 'string' ? stored.brief : '';
    }
  } catch {
    /* keep defaults */
  }
  renderModeUi();
}

/**
 * Bumped by every ON transition. The NEWEST ON owns the pending-open release:
 * an older transition's cleanup (a fast first click finishing while a second
 * is still running) must not drop the newer one's guard.
 */
let pendingOpenHoldSeq = 0;

export async function toggleMode(next: boolean, type?: DesignType | null, brief?: string): Promise<void> {
  const wasOn = state.mode.on;
  state.mode.on = next;
  if (type) state.mode.type = type;
  if (brief !== undefined && brief !== '') state.mode.brief = brief;
  // An ON transition spans awaits — the persist, the marker write, then the
  // open or focus — and `pendingOpen` used to be raised only once the open
  // itself started. A stale `/state` snapshot (windowOpen:false, sampled before
  // the window is up) landing inside those awaits then read the just-flipped ON
  // as "the user closed the window" and flipped the mode straight back OFF.
  // Hold the pending-open guard across the WHOLE ON transition, from before the
  // first await, and clear it on every exit (no-url refusal, focus failure,
  // open completion). The sequence means an overlapping newer ON owns the
  // release, so an older transition's cleanup can never drop the newer guard.
  const hold = next ? ++pendingOpenHoldSeq : 0;
  if (hold) state.pendingOpen = true;
  try {
    await saveMode();
    // The persistent marker is written exactly on the OFF→ON transition: not on a
    // render, and not again while the mode is already on.
    if (next && !wasOn) await writeDesignMarker();
    renderModeUi();
    if (next) {
      // ON brings up the project's live window at its URL; the window is what
      // "Design Mode" IS. If it is already up, a click only raises it — never a
      // second window, and never suppressed.
      if (state.windowOpen) {
        try {
          await focusLive();
        } catch (error) {
          setStatus(`Focus failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
        }
      } else {
        // The UI only offers this toggle when the project is ready, so a click here
        // always has a url. As a backstop, if it is somehow called with none, the
        // open resolves to nothing and stays SILENT — never a "no url" toast.
        await openCurrentProjectWindow(false);
      }
    } else {
      // OFF is the mirror: close the live window and quit Chrome. This is a plain
      // toggle now — no second-click confirmation. Then stop the dev server we
      // started, if it is safe (idle session, no other active design session).
      try {
        await closeLive();
      } catch {
        /* the window may already be gone; the mode is still off */
      }
      try {
        await requestDevServerStop();
      } catch {
        /* a stop failure is surfaced by doStopDevServer's own toast */
      }
    }
  } finally {
    if (hold && hold === pendingOpenHoldSeq) state.pendingOpen = false;
  }
}

/** The `/design` resolver. Registered on panel and page surfaces only. */
async function resolveDesignCommand(args: string): Promise<null | Awaited<ReturnType<typeof buildModeChip>>> {
  if (!state.resolveAllowed) return null;
  // `/design` toggles Design Mode ON/OFF only: empty or "on…" turns it ON,
  // "off" turns it OFF.
  const parsed = parseDesignArgs(args);
  if (!parsed.on) {
    await toggleMode(false);
    await host.toast({ kind: 'info', message: 'Design Mode is off.' });
    return null;
  }
  // `/design <description>` in a project with no config yet scaffolds the project
  // immediately, then starts the session. A scaffold failure falls through to the
  // normal toggle, i.e. the agent-scaffolds flow. An UNREGISTERED directory is
  // refused outright: no scaffold, no session, no chip.
  if (parsed.brief.trim() !== '') {
    if (pageTarget().kind === 'needs-project') {
      state.pageError = NEEDS_PROJECT_MESSAGE;
      rerender();
      await host.toast({ kind: 'error', message: NEEDS_PROJECT_MESSAGE });
      return null;
    }
    if (state.directory && !projectReady(state.config)) {
      const spec: DesignBriefSpec = {
        type: parsed.type ?? state.mode.type,
        direction: state.mode.direction,
        fidelity: state.mode.fidelity,
        brief: parsed.brief,
        designSystemId: state.pageDesignSystemId,
      };
      if (await scaffoldCurrentProject(spec)) return null;
    }
  }
  await toggleMode(true, parsed.type, parsed.brief || undefined);
  return buildModeChip(state.sessionId, state.mode, state.config);
}

// ---- design sessions ----

type DesignSessionSpec = {
  id: string;
  title: string;
  url: string;
  text: string;
  projectId?: string;
  /** The registered project's directory the session starts in. */
  dir: string;
  type: DesignType;
  brief: string;
  /** Only the Studio page supplies its own unsent references. */
  references?: DraftReference[];
};

/**
 * Start a NEW session with Design Mode ON: the request itself carries the mode
 * chip's `data` (the cross-device signal the session record echoes back), the
 * per-session mode storage is seeded so the Work Status widget opens ready, and
 * the user is moved into the session.
 */
async function startDesignSession(spec: DesignSessionSpec): Promise<boolean> {
  state.pageBusy = true;
  rerender();
  try {
    const data = seedSessionData(spec.type, spec.brief);
    const submission = spec.references !== undefined
      ? buildReferenceSubmission(spec.text, data, spec.references)
      : { text: spec.text, data };
    const result = await host.startSession({
      providerId: 'design-studio',
      id: spec.id,
      title: spec.title,
      url: attachUrl(spec.url),
      text: submission.text,
      projectId: spec.projectId,
      navigation: 'preserve',
      data: submission.data,
    });
    if (!result.sessionId || result.sent !== 'sent') {
      const failure = 'failure' in result ? result.failure : undefined;
      const message = result.sent === 'no-model'
        ? 'The design brief was not sent. Choose a model in OpenChamber, then try again. Your draft is unchanged.'
        : `The design brief was not sent (${result.sent}${failure ? `: ${failure}` : ''}). Your draft is unchanged; try again.`;
      state.pageError = message;
      await host.toast({ kind: 'error', message });
      return false;
    }
    // Delivery consumes this draft before ancillary work can fail. A toast or
    // navigation transport failure must never make confirmed refs resendable.
    if (spec.references !== undefined) {
      cancelReferenceValidation();
      state.references = [];
      state.prompt = '';
      attachPathDraft = '';
      referenceError = '';
    }
    try {
      await host.storage.set(modeStorageKey(result.sessionId)!, seedModeValue(spec.type, spec.brief));
      // A newly started design session is a design chat from birth: mark it
      // permanently, so it stays in "Your design work" once the window closes.
      await host.storage.set(designMarkerKey(result.sessionId)!, designMarkerValue());
    } catch {
      /* the session's own data chip still marks it; the widget shows defaults */
    }
    // Complete supported best-effort writes before navigation tears down the
    // frame. The registered project itself remains the session workspace.
    try {
      await ensureHarness(spec.dir);
    } catch {
      /* the session still works without the plugin */
    }
    try {
      await host.toast({ kind: 'success', message: 'Design session started — its controls are in Work Status.' });
    } catch {
      /* Notification transport is not session-delivery failure. */
    }
    if (state.surface === 'page') void loadDesignHome();
    try {
      await host.openSession(result.sessionId);
    } catch (error) {
      state.pageError = `The brief was sent, but the chat could not open. Open it from Your design work. ${error instanceof Error ? error.message : String(error)}`;
    }
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    state.pageError = message;
    await host.toast({ kind: 'error', message: `Could not start session: ${message}` });
    return false;
  } finally {
    state.pageBusy = false;
    rerender();
  }
}

/** A resolved creation target: a REGISTERED project the flow may act on. */
type ResolvedTarget = Extract<DesignTarget, { kind: 'project' }>;

/**
 * Where a creation flow targets, via the shared pure rule: a registered project
 * the user picked in the working-directory selector wins; otherwise the frame's
 * current directory is matched against the REGISTERED projects (exact, else the
 * containing one). When nothing matches the caller refuses — it must never
 * scaffold or start a session in an unregistered directory.
 */
function pageTarget(): DesignTarget {
  return resolveDesignTarget({
    directory: state.directory,
    selectedProjectId: state.selectedProjectId,
    projects: allProjects,
    rows: state.projects?.kind === 'list' ? state.projects.rows : [],
  });
}

/** The outcome of making sure the target project exists before the session starts. */
type ProjectPrep = { config: StudioConfig | null; url: string; scaffolded: boolean; failed: boolean; error: string };

/**
 * Make sure the target has a `.design-studio.json`, so the session prompt takes
 * the "project exists" branch. A ready project is left alone. A project with no
 * config is scaffolded through the service's `/scaffold` — the target is always
 * a REGISTERED project (the callers refuse a `needs-project` target first, so
 * nothing here can write into an unregistered directory); a scaffold failure is
 * toasted and returned (`failed`), leaving the caller to fall back to the
 * agent-scaffolds flow. Nothing here starts a session or opens a window.
 */
async function prepareProject(spec: DesignBriefSpec, target: ResolvedTarget): Promise<ProjectPrep> {
  if (projectReady(target.config)) {
    return { config: target.config, url: target.config?.url ?? '', scaffolded: false, failed: false, error: '' };
  }
  let result: ScaffoldResult;
  try {
    result = await scaffoldProject(target.dir, {
      type: spec.type,
      direction: spec.direction,
      fidelity: spec.fidelity,
      brief: spec.brief,
      // Omitted for "No design system" so the request stays as before.
      designSystemId: spec.designSystemId ?? undefined,
    });
  } catch (error) {
    result = { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  if (!result.ok) {
    await host.toast({ kind: 'error', message: result.error });
    return { config: target.config, url: target.config?.url ?? '', scaffolded: false, failed: true, error: result.error };
  }
  await host.toast({ kind: 'success', message: `Project scaffolded at ${result.url}` });
  // The scaffold wrote `.design-studio.json`; read it back so the session prompt
  // takes the "project exists" branch instead of asking the agent to scaffold.
  let config = target.config;
  try {
    config = (await getConfig(target.dir)).config;
    if (target.dir === state.directory) {
      state.config = config;
      state.configDir = target.dir;
    }
  } catch {
    /* keep the cached config; the prompt degrades to the scaffold branch */
  }
  return { config, url: result.url || config?.url || '', scaffolded: true, failed: false, error: '' };
}

/**
 * Resolve the creation target for a USER ACTION, refreshing the projects cache
 * once when the answer could be stale or missing: nothing loaded yet, still
 * loading, the picked project unknown to the cache, or the directory refused.
 * The refresh makes a refusal honest — based on a fresh read, never a stale
 * cache — and makes a just-picked project resolvable on a fast send.
 */
async function pageTargetFresh(): Promise<DesignTarget> {
  const first = pageTarget();
  const pickedUnknown =
    state.selectedProjectId !== null &&
    (first.kind === 'needs-project' || (first.kind === 'project' && first.projectId !== state.selectedProjectId));
  if (!state.projects || state.projects.kind === 'loading' || first.kind === 'needs-project' || pickedUnknown) {
    await loadProjects();
    return pageTarget();
  }
  return first;
}

/**
 * The `/design <desc>` path: scaffold the RESOLVED target project through the
 * service and start a session for it. Returns true when the session was started;
 * false when the target is not a registered project (the refusal is toasted, so
 * the caller returns instead of toggling) or scaffolding failed (the error is
 * toasted) so the caller can fall back to the agent-scaffolds flow.
 */
async function scaffoldCurrentProject(spec: DesignBriefSpec): Promise<boolean> {
  const target = await pageTargetFresh();
  if (target.kind === 'needs-project') {
    state.pageError = NEEDS_PROJECT_MESSAGE;
    rerender();
    await host.toast({ kind: 'error', message: NEEDS_PROJECT_MESSAGE });
    return false;
  }
  state.pageError = '';
  state.pageBusy = true;
  rerender();
  const prep = await prepareProject(spec, target);
  state.pageBusy = false;
  if (prep.failed) {
    state.pageError = prep.error;
    rerender();
    return false;
  }
  return startDesignSession({
    id: `new-design:${Date.now()}`,
    title: `New design · ${spec.type}`,
    url: prep.url,
    type: spec.type,
    brief: spec.brief,
    projectId: target.projectId,
    dir: target.dir,
    text: designSessionPrompt(spec, prep.config),
  });
}

/**
 * The page's main action: start a design session for the composer's brief,
 * targeting the RESOLVED registered project (picked, or matched from the frame's
 * current directory). A project with no `.design-studio.json` is scaffolded
 * first; on failure the error is shown on the page and the session still starts
 * in the agent-scaffolds flow (the prompt asks the agent to create the project).
 * When the current directory belongs to no registered project the flow REFUSES:
 * no scaffold, no session — an actionable message instead. Reused by the
 * `/design` command via `scaffoldCurrentProject`.
 */
async function startNewDesign(): Promise<void> {
  if (state.pageBusy || referencePending) return;
  // Lock before the first await: a second click during project refresh must not
  // create a second session, and the first action owns this draft snapshot.
  state.pageBusy = true;
  state.pageError = '';
  const spec: DesignBriefSpec = {
    type: state.pageType,
    direction: state.pageDirection,
    fidelity: state.pageFidelity,
    brief: state.prompt.trim(),
    designSystemId: state.pageDesignSystemId,
  };
  const references = state.surface === 'page' ? [...state.references] : undefined;
  rerender();
  try {
    const target = await pageTargetFresh();
    if (target.kind === 'needs-project') {
      state.pageError = NEEDS_PROJECT_MESSAGE;
      rerender();
      await host.toast({ kind: 'error', message: NEEDS_PROJECT_MESSAGE });
      return;
    }
    const prep = await prepareProject(spec, target);
    if (prep.failed) {
      // Existing agent-scaffolds fallback remains; a failed send still retains
      // the complete original draft.
      state.pageError = prep.error;
      rerender();
    }
    await startDesignSession({
      id: `new-design:${Date.now()}`,
      title: `New design · ${spec.type}`,
      url: prep.url,
      type: spec.type,
      brief: spec.brief,
      projectId: target.projectId,
      dir: target.dir,
      text: designSessionPrompt(spec, prep.config),
      references,
    });
  } catch (error) {
    state.pageError = `Could not start session: ${error instanceof Error ? error.message : String(error)}`;
    await host.toast({ kind: 'error', message: state.pageError });
  } finally {
    state.pageBusy = false;
    rerender();
  }
}

// ---- references ----

/**
 * Attach a picked element to the chat as a reference chip.
 */
async function addToChat(pick: TrackedPick): Promise<void> {
  try {
    await host.attach({
      providerId: 'design-studio',
      id: `element-${pick.seq}`,
      title: pick.selector,
      url: pick.url,
      text: referenceText(pick, pick.url, pick.pickedAt),
      data: { selector: pick.selector, tag: pick.tag, classes: pick.classes, snippet: pick.outerHTML, styles: pick.styles, url: pick.url },
    });
    await host.toast({ kind: 'success', message: 'Reference added to the chat composer.' });
  } catch (error) {
    await host.toast({ kind: 'error', message: `Could not attach: ${error instanceof Error ? error.message : String(error)}` });
  }
}

// ---- project config ----

/**
 * Surface an open's progress/result. The trimmed status row has no state line
 * of its own, so errors go to a toast (deduped by `setStatus`); informational
 * progress is silent. Nothing here ever opens a window.
 */
function openStatus(message: string, kind: 'info' | 'error' = 'info'): void {
  setStatus(message, kind);
}

/**
 * Open (or navigate) the project's live window from a config. Called by Design
 * Mode turning ON, so it resolves the URL and dev-server dir the same way.
 * `notify` toasts the actionable message when the project has no url.
 */
async function openProjectWindow(
  config: StudioConfig | null | undefined,
  dir: string | null,
  notify: boolean,
): Promise<void> {
  const decision = decideProjectOpen(config, dir);
  if (decision.kind === 'message') {
    if (notify) await host.toast({ kind: 'error', message: decision.message });
    return;
  }
  // Mark the open in flight so a /state poll cannot read the not-yet-open window
  // as "the user closed it". Nothing consults this to *suppress* an open.
  state.pendingOpen = true;
  openStatus(OPENING_STATUS);
  try {
    const result = await openLive(decision.url, decision.dir);
    // Persist the URL the moment it is opened, so a later ON with no live config
    // still reopens this project at its last page.
    if (result.ok) await saveLastUrl(state.directory, decision.url);
    // Remember that THIS panel started the server, so Design Mode OFF may stop
    // it later (never a server we did not start).
    if (result.ok && result.started && decision.dir) markServerStartedByUs(decision.dir);
    // Design Mode turning ON for a ready project also drops the in-session harness
    // plugin into `.opencode/`, so the craft rules and the verification mandate hold
    // for every turn — including edits the user starts directly in chat. Best-effort
    // and never blocking: a missing service or a refused write must not fail the open.
    if (result.ok && dir) {
      void ensureHarness(dir).catch(() => {
        /* the design session still works without the plugin */
      });
    }
    openStatus(formatOpenStatus(result), result.ok ? 'info' : 'error');
  } catch (error) {
    openStatus(`Could not open ${decision.url}: ${error instanceof Error ? error.message : String(error)}`, 'error');
  } finally {
    state.pendingOpen = false;
  }
}

/**
 * Resolve the URL an open should use, in order: (a) the live `.design-studio.json`
 * for the project dir, (b) the config already cached from a previous read, (c)
 * the last-known URL persisted for this project. `null` when none resolve.
 */
async function resolveOpenUrl(): Promise<{ url: string; dir: string | null } | null> {
  const dir = state.directory;
  if (dir) {
    try {
      const read = await getConfig(dir);
      // A directory switch mid-read must not commit the OLD directory's
      // config as the NEW directory's.
      if (state.directory === dir) {
        state.config = read.config;
        state.configPath = read.path;
        state.configDir = dir;
      }
      const url = read.config?.url?.trim();
      if (url) return { url, dir };
    } catch {
      /* service not ready, or no config: fall through to the cache then storage */
    }
  }
  const cached = currentConfig()?.url?.trim();
  if (cached) return { url: cached, dir };
  const last = await loadLastUrl(dir);
  if (last) return { url: last, dir };
  return null;
}

/**
 * Resolve and open the current project's live window. Called ONLY from an
 * explicit user action — the Design Mode toggle turning ON (`toggleMode(true)`).
 * Opening is never suppressed: an explicit ON always resolves and opens.
 */
async function openCurrentProjectWindow(notify: boolean): Promise<void> {
  // Mark an open in flight before any await: a /state poll landing mid-open must
  // not read the not-yet-open window as "the user closed it".
  state.pendingOpen = true;
  try {
    const resolved = await resolveOpenUrl();
    if (!resolved) {
      if (notify) await host.toast({ kind: 'error', message: NO_PROJECT_URL_MESSAGE });
      return;
    }
    await openProjectWindow({ url: resolved.url }, resolved.dir, notify);
  } finally {
    state.pendingOpen = false;
  }
}

// ---- dev-server stop (smart stop on OFF, manual stop on the icon button) ----
//
// A dev server the panel started is stopped when Design Mode goes OFF — but
// only when it is safe: our session is idle AND no other design session in the
// same project dir is VERIFIED inactive (an unreadable check fails closed).
// While our session is busy the stop is held as `pendingStop` — its directory
// and manual mode preserved — and honoured on idle with the outcome announced;
// a snapshot showing the session busy again cancels it, also announced. The
// automatic path never stops a server this panel did not start
// (`state.startedServers`). The MANUAL path (the icon button) skips that
// in-memory gate and defers ownership to the service, which kills only a group
// it recorded for `dir`.

/**
 * Bumped on every directory change. Start/Stop actions capture it with the
 * directory at entry, so a result that resolves after the user left — and
 * even after a round-trip A→B→A that lands back on the same directory — is
 * recognised as stale and never committed to the shared row state.
 */
let directoryGeneration = 0;

/**
 * Bumped by every Start/Stop action at entry. The NEWEST action owns the
 * shared `serverPending` marker: an older action's `finally` must never clear
 * the newer one's in-flight state (two actions can overlap across a directory
 * switch, which resets the marker).
 */
let serverActionSeq = 0;

/** Whether the frame has left `dir` since `gen` — including an A→B→A round-trip. */
function directoryMovedSince(dir: string, gen: number): boolean {
  return state.directory !== dir || directoryGeneration !== gen;
}

/** Remember that THIS panel started `dir`'s dev server, so OFF may stop it. */
export function markServerStartedByUs(dir: string | null): void {
  if (dir) state.startedServers.add(dir);
}

/** The project resolution for a directory, or `unknown` when it cannot be read. */
type ProjectResolution = { kind: 'id'; id: string } | { kind: 'unregistered' } | { kind: 'unknown' };

/**
 * The project whose directory is exactly `dir`, from the project list (cached
 * or read). `unregistered` is a VERIFIED answer: the read succeeded and no
 * registered project has this directory, and sessions only exist under
 * registered projects. A failed or still-loading read is `unknown`.
 */
async function resolveProjectId(dir: string): Promise<ProjectResolution> {
  const rows = state.projects?.kind === 'list' ? state.projects.rows : [];
  const cached = rows.find((row) => row.directory === dir);
  if (cached) return { kind: 'id', id: cached.id };
  let snapshot: Awaited<ReturnType<typeof host.listProjects>>;
  try {
    snapshot = await host.listProjects();
  } catch {
    return { kind: 'unknown' };
  }
  if (snapshot.state !== 'ready') return { kind: 'unknown' };
  const project = snapshot.projects.find((candidate) => candidate.directory === dir);
  return project ? { kind: 'id', id: project.id } : { kind: 'unregistered' };
}

/**
 * How many OTHER design sessions are active in `dir` right now — or `null`
 * when that CANNOT be verified (the projects or sessions read failed or is
 * still loading). The stop decision must fail closed: an unverifiable check
 * is never "no other session". Only a verified read returns a count.
 */
async function countActiveDesignSessions(dir: string): Promise<number | null> {
  const resolved = await resolveProjectId(dir);
  if (resolved.kind === 'unknown') return null;
  if (resolved.kind === 'unregistered') return 0;
  let snapshot: Awaited<ReturnType<typeof host.listSessions>>;
  try {
    snapshot = await host.listSessions(resolved.id);
  } catch {
    return null;
  }
  if (snapshot.state !== 'ready') return null;
  const markerIds = await readDesignMarkerSessionIds();
  return countOtherActiveDesignSessions(snapshot.sessions, state.sessionId, markerIds);
}

/**
 * Send the stop to the service and forget the record ONLY when the service
 * confirmed it stopped the server. `ok:true` without `stopped:true` — or an
 * outright refusal — means nothing was stopped, so ownership is retained and
 * only a matching queued request is cleared. Returns whether the server
 * actually stopped plus the service's own error detail when it gave one;
 * callers report it truthfully. Does NOT toast.
 */
async function tryStopDevServer(dir: string): Promise<{ stopped: boolean; error?: string }> {
  const result = await stopDevServer(dir);
  if (result.ok && result.stopped) {
    state.startedServers.delete(dir);
    if (state.pendingStop?.dir === dir) state.pendingStop = null;
    return { stopped: true };
  }
  return { stopped: false, error: result.error };
}

/**
 * Decide whether THIS panel may stop the dev server for `dir` (the current
 * directory, or an explicitly queued request's own directory), applying the
 * idle/other-session rules for both automatic and manual stops. Returns an
 * outcome shape so callers can surface the right message. A held stop is
 * queued in `state.pendingStop` WITH its mode and directory. `stopped` is
 * TRUTHFUL: it reports the service's confirmed stop (`ok && stopped`), so a
 * `stopped:false` answer falls through to the refusal path instead of reading
 * as a success, and a refused stop carries the service's own `error` when it
 * gave one.
 *
 * The safety lookup (other active design sessions) is awaited BEFORE anything
 * destructive is sent, and what it protects is re-checked afterwards: a
 * directory the user has left aborts the stop, and a session that became busy
 * during the lookup queues instead of stopping. `unknown:true` marks a check
 * that could not be verified — the stop FAILS CLOSED: nothing is sent, and
 * ownership/queue state is left untouched.
 *
 * Ownership differs by path: the AUTOMATIC path (Design Mode OFF, window
 * close) stops only a server this panel started (`state.startedServers`) —
 * after a reload that set is empty and the automatic stop must stay silent.
 * The MANUAL path (the icon button) skips that gate and defers ownership to
 * the service, which kills only a process group it recorded for `dir` and
 * refuses an unrecorded one — so a running server started by an earlier
 * panel instance can still be stopped by hand.
 */
export async function requestDevServerStop(
  options: { manual?: boolean; dir?: string } = {},
): Promise<{ stopped: boolean; held: boolean; blocked?: boolean; unknown?: boolean; error?: string }> {
  const dir = options.dir ?? state.directory;
  if (!dir) return { stopped: false, held: false, blocked: false };
  const manual = options.manual ?? false;
  const gen = directoryGeneration;
  if (!manual && !state.startedServers.has(dir)) return { stopped: false, held: false, blocked: false };
  const otherActiveDesignSessions = await countActiveDesignSessions(dir);
  // The safety lookup awaited: re-verify what it protects BEFORE anything
  // destructive is sent. A session that became busy during the lookup queues
  // (queueing is not destructive; the honoured stop re-verifies); an idle
  // stop with an UNVERIFIABLE check fails closed — never a stop.
  if (state.sessionBusy) {
    state.pendingStop = { dir, manual };
    return { stopped: false, held: true, blocked: false };
  }
  if (otherActiveDesignSessions === null) {
    return { stopped: false, held: false, blocked: false, unknown: true };
  }
  if (options.dir === undefined && directoryMovedSince(dir, gen)) {
    return { stopped: false, held: false, blocked: false };
  }
  if (shouldStopDevServer({ busy: state.sessionBusy, otherActiveDesignSessions, startedByUs: true })) {
    try {
      const outcome = await tryStopDevServer(dir);
      const result: { stopped: boolean; held: boolean; blocked?: boolean; error?: string } = {
        stopped: outcome.stopped,
        held: false,
        blocked: false,
      };
      if (outcome.error) result.error = outcome.error;
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`Could not stop the preview: ${message}`, 'error');
      return { stopped: false, held: false, blocked: false, error: message };
    }
  }
  return { stopped: false, held: false, blocked: true };
}

/**
 * The truthful message for a manual stop the service answered `stopped:false`.
 * The service refuses for several reasons (no recorded group, a legacy
 * identity, a surviving group, an occupied port) and reports the condition in
 * the status payload's `error` — pass it through verbatim. Without one: a
 * status that still reports a recorded group (a `pid` in the payload) keeps
 * the plain no-op line, as does a failed status read, which cannot tell; an
 * empty status means the service had no record for the dir.
 */
export async function manualStopRefusalMessage(dir: string): Promise<string> {
  try {
    const status = await getServerStatus(dir);
    if (status.error) return status.error;
    return status.pid
      ? 'No preview dev server to stop.'
      : 'The service did not record this server; it was not started by Design Studio.';
  } catch {
    return 'No preview dev server to stop.';
  }
}

/**
 * Surface the outcome of a queued stop being honoured: the outcome is
 * announced, so "queued" is followed by an outcome. Only truthful outcomes are
 * announced — never a refusal read as success. The ICON commit is guarded by
 * the honoured request's own directory: honouring dir A's queued stop while
 * the user is on dir B must not flip B's running state to stopped. The
 * announcement is NOT guarded — it is truthful about the stop itself (P8).
 */
function reportHonouredStop(
  result: { stopped: boolean; held: boolean; blocked?: boolean; unknown?: boolean },
  dir: string,
): void {
  if (result.stopped) {
    if (state.directory === dir) {
      state.serverStatus = false;
      state.serverError = null;
      renderServerControl();
    }
    announceServer('Preview dev server stopped.');
  } else if (result.blocked) {
    announceServer('Another active design session is using this preview server.');
  } else if (result.unknown) {
    announceServer('Could not verify other design sessions — the queued stop stays pending.');
  }
}

/**
 * The current session's live snapshot (`host.onSession`). Keeps `sessionBusy`
 * fresh: a busy session cancels a pending stop (announced — the earlier
 * "queued" promise must not stand misleadingly); an idle one performs the
 * queued REQUEST, preserving its directory and manual mode.
 */
export async function applySessionSnapshot(session: { id: string; busy: boolean } | null): Promise<void> {
  state.sessionId = session?.id ?? null;
  state.sessionBusy = session?.busy ?? false;
  if (state.sessionBusy) {
    if (state.pendingStop) {
      state.pendingStop = null;
      announceServer('Session is busy again — the queued stop was cancelled.');
    }
  } else if (state.pendingStop) {
    const request = state.pendingStop;
    const result = await requestDevServerStop({ manual: request.manual, dir: request.dir });
    reportHonouredStop(result, request.dir);
  }
  await loadMode();
}

/**
 * A session lifecycle event (`host.onSessionLifecycle`): a `completed` turn is
 * the moment a `pendingStop` is honoured, if the session is now idle.
 */
export async function handleSessionLifecycle(event: { phase: 'started' | 'completed' | 'failure' }): Promise<void> {
  if (event.phase === 'completed' && state.pendingStop && !state.sessionBusy) {
    const request = state.pendingStop;
    const result = await requestDevServerStop({ manual: request.manual, dir: request.dir });
    reportHonouredStop(result, request.dir);
  }
}

// ---- preview-dev-server Start/Stop control ----

/**
 * Screen-reader-only announcement of a preview-dev-server state change.
 * Cleared first so the same message is re-announced if repeated. Announcements
 * are recorded for the test seams (`getServerAnnouncements`).
 */
const serverAnnouncements: string[] = [];

function announceServer(message: string): void {
  serverAnnouncements.push(message);
  if (!serverAnnounceEl) return;
  serverAnnounceEl.textContent = '';
  queueMicrotask(() => { if (serverAnnounceEl) serverAnnounceEl.textContent = message; });
}

/** Whether the frame's focus sits on `el` or inside it. */
function focusInside(el: HTMLElement | null): boolean {
  const active = document.activeElement as Node | null | undefined;
  if (!el || !active || typeof el.contains !== 'function') return false;
  return active === el || el.contains(active);
}

/**
 * Focus the session line when a rendered control the user was on disappears:
 * focus must land on something visible, never silently on `body`.
 */
function focusSessionLine(): void {
  if (!sessionLineEl) return;
  sessionLineEl.tabIndex = -1;
  sessionLineEl.focus();
}

/**
 * Monotonic token for the in-flight status read. The unawaited
 * `void refreshServerStatus()` fired from a previous action's `finally` can
 * resolve inside the NEXT action — a read a newer read or a manual action has
 * superseded must never commit.
 */
let serverStatusRead = 0;

/** The rendered Start/Stop state, exactly as `renderServerControl` derives it. */
function serverRenderState(): 'loading' | 'error' | 'running' | 'stopped' | 'checking' {
  if (state.serverPending) return 'loading';
  if (state.serverError) return 'error';
  if (state.serverStatus === null) return 'checking';
  return state.serverStatus ? 'running' : 'stopped';
}

/** Announce a poll-driven change of the rendered state; silence when unchanged. */
function announceServerTransition(before: ReturnType<typeof serverRenderState>): void {
  const after = serverRenderState();
  if (after === before) return;
  if (after === 'running') announceServer('Preview dev server is running.');
  else if (after === 'stopped' && before !== 'checking') announceServer('Preview dev server stopped.');
  else if (after === 'error') announceServer('Preview dev server status unavailable — click to retry.');
}

/**
 * Poll the service for the current directory's dev-server reachability.
 * Keeps `state.serverStatus` fresh without starting anything. Skipped while a
 * manual start/stop is already in flight so the UI never fights the user action.
 * A stale read — one a newer read or a manual action superseded — never commits.
 * A status that carries the service's own `error` (a recorded identity or port
 * conflict) surfaces that error and never renders as a green running state.
 */
async function refreshServerStatus(): Promise<void> {
  if (state.serverPending || !state.directory) return;
  const dir = state.directory;
  const token = ++serverStatusRead;
  const superseded = (): boolean => token !== serverStatusRead || state.serverPending || state.directory !== dir;
  try {
    const status = await getServerStatus(dir);
    if (superseded()) return;
    const before = serverRenderState();
    if (status.error) {
      state.serverError = status.error;
    } else {
      state.serverStatus = status.up;
      // A clean read clears any error, `up` or not: a stopped server must
      // return to `is-stopped` after a transient failure, not stay sticky.
      state.serverError = null;
    }
    announceServerTransition(before);
  } catch (error) {
    if (superseded()) return;
    const before = serverRenderState();
    state.serverError = error instanceof Error ? error.message : String(error);
    announceServerTransition(before);
  }
  renderServerControl();
}

/**
 * Update (or hide) the preview-dev-server Start/Stop button. It sits to the
 * left of the Design Mode toggle, and only appears for ready projects whose
 * configured URL is loopback.
 */
function renderServerControl(): void {
  if (!barEl || !serverBtn) return;
  const url = state.config?.url?.trim();
  const ready = projectReady(state.config) && url !== undefined && isLoopbackUrl(url);
  if (!ready) {
    // The control disappears: keep focus visible, never dropped to `body`.
    const hadFocus = focusInside(serverBtn);
    serverBtn.hidden = true;
    if (hadFocus) focusSessionLine();
    return;
  }
  serverBtn.hidden = false;
  serverBtn.disabled = state.serverPending;
  serverBtn.classList.remove('is-stopped', 'is-running', 'is-loading', 'is-error');
  let stateClass: 'is-stopped' | 'is-running' | 'is-loading' | 'is-error';
  if (state.serverPending) {
    stateClass = 'is-loading';
  } else if (state.serverError) {
    stateClass = 'is-error';
  } else if (state.serverStatus === null) {
    // Unknown: nothing has been read yet. Reuse the existing loading style —
    // an unread state must never masquerade as a stopped "Start" affordance.
    stateClass = 'is-loading';
  } else if (state.serverStatus) {
    stateClass = 'is-running';
  } else {
    stateClass = 'is-stopped';
  }
  serverBtn.classList.add(stateClass);
  serverBtn.title = state.serverPending
    ? 'Working…'
    : state.serverError
      ? 'Preview dev server error — click to retry'
      : state.serverStatus === null
        ? 'Checking the preview dev server…'
        : state.serverStatus
          ? 'Stop preview dev server'
          : 'Start preview dev server';
  serverBtn.setAttribute('aria-label', serverBtn.title);
  const icon = q('span', 'ds-server-icon');
  serverBtn.replaceChildren(icon);
}

/**
 * The cached config, but ONLY when it was read for the CURRENT directory.
 * `onDirectory` keeps the last config until the fresh read resolves, so a
 * stale one must never drive an action for the new directory.
 */
function currentConfig(): StudioConfig | null {
  return state.configDir === state.directory ? state.config : null;
}

/**
 * Handle a click on the preview-dev-server Start/Stop button: start when
 * stopped, stop when running (the manual stop path — the service decides
 * ownership, the idle/other-session rules still hold).
 */
async function onServerControlClick(): Promise<void> {
  if (state.serverPending || !state.directory) return;
  const url = currentConfig()?.url?.trim();
  if (!url || !isLoopbackUrl(url)) return;
  // Branch on the RENDERED state, not the raw status bit: after a poll error
  // the icon reads "error — click to retry", and retrying must START the
  // server, never stop the healthy one behind the stale status.
  if (state.serverStatus && !state.serverError) {
    await stopCurrentServer();
  } else {
    await startCurrentServer();
  }
}

/**
 * Ask the service to start the project's dev server and mark it as ours when
 * the service reports it spawned.
 */
async function startCurrentServer(): Promise<void> {
  const dir = state.directory;
  if (!dir) return;
  const url = currentConfig()?.url?.trim();
  if (!url || !isLoopbackUrl(url)) return;
  const gen = directoryGeneration;
  const action = ++serverActionSeq;
  state.serverPending = true;
  state.serverError = null;
  renderServerControl();
  try {
    const result: ServerStartResult = await startDevServer(dir, url);
    // Ownership bookkeeping records what the service ACTUALLY spawned for the
    // dir the start was sent to — a confirmed spawn is marked for `dir` even
    // if the user has since switched away. The RENDERED state, though, belongs
    // to this action's directory: a switch — including a round-trip A→B→A —
    // must not commit `serverStatus`/`serverError` there.
    if (result.ok && result.up && result.started) markServerStartedByUs(dir);
    if (directoryMovedSince(dir, gen)) return;
    state.serverStatus = result.up ?? null;
    state.serverError = result.error ?? null;
    if (result.ok && result.started) {
      announceServer('Preview dev server started.');
    } else if (result.ok && result.up) {
      announceServer('Preview dev server is running.');
    } else {
      announceServer(result.error ?? 'Could not start the preview dev server.');
    }
  } catch (error) {
    if (directoryMovedSince(dir, gen)) return;
    state.serverError = error instanceof Error ? error.message : String(error);
    announceServer(`Could not start the preview dev server: ${state.serverError}`);
  } finally {
    // The newest action owns the shared in-flight marker; an older action
    // resolving across a switch must never clear the newer one's state.
    if (action === serverActionSeq) state.serverPending = false;
    renderServerControl();
    void refreshServerStatus();
  }
}

/**
 * Ask the service to stop the project's dev server from the icon button. This
 * is the MANUAL path: it skips the panel's in-memory ownership set (empty
 * after a reload, or when the server was already running at START) and defers
 * ownership to the service, while keeping the idle/other-session rules.
 */
async function stopCurrentServer(): Promise<void> {
  const dir = state.directory;
  if (!dir) return;
  const gen = directoryGeneration;
  const action = ++serverActionSeq;
  state.serverPending = true;
  state.serverError = null;
  renderServerControl();
  try {
    const result = await requestDevServerStop({ manual: true });
    // A switch mid-flight — including a round-trip back to this directory —
    // must not commit this result to the shared row state.
    if (directoryMovedSince(dir, gen)) return;
    if (result.stopped) {
      state.serverStatus = false;
      state.serverError = null;
      announceServer('Preview dev server stopped.');
    } else if (result.held) {
      state.serverError = null;
      announceServer('Session is busy — stop queued for when it becomes idle.');
    } else if (result.unknown) {
      state.serverError = null;
      announceServer('Could not verify other design sessions — the preview server was left running.');
    } else if (result.blocked) {
      state.serverError = null;
      announceServer('Another active design session is using this preview server.');
    } else {
      // A truthful no-op: the service's own refusal reason when it gave one,
      // else the status read. Never fake success, and never flip the icon to
      // stopped here — `refreshServerStatus` reports the real state below.
      announceServer(result.error ?? await manualStopRefusalMessage(dir));
    }
  } catch (error) {
    if (directoryMovedSince(dir, gen)) return;
    state.serverError = error instanceof Error ? error.message : String(error);
    announceServer(`Could not stop the preview dev server: ${state.serverError}`);
  } finally {
    // The newest action owns the shared in-flight marker; an older action
    // resolving across a switch must never clear the newer one's state.
    if (action === serverActionSeq) state.serverPending = false;
    renderServerControl();
    void refreshServerStatus();
  }
}

/**
 * Read the project's `.design-studio.json` for display only. This NEVER opens a
 * window: opening is an explicit action (the Design Mode toggle turning ON).
 * Called on mount, on directory change, and on every poll tick, so a config the
 * agent scaffolds mid-session flips the row to its ready state WITHOUT a reload.
 *
 * `reportErrors` toasts a service/config failure (mount only); the poll reads
 * silently.
 */
async function readStudioConfig(reportErrors: boolean): Promise<void> {
  const dir = state.directory;
  if (!dir) return;
  if (configReadInFlight) return;
  configReadInFlight = true;
  try {
    const { config, path } = await getConfig(dir);
    // A directory switch mid-read must not commit the OLD directory's config
    // as the NEW directory's.
    if (state.directory !== dir) return;
    state.config = config;
    state.configPath = path;
    state.configDir = dir;
    renderRow();
  } catch (error) {
    if (reportErrors) {
      setStatus(error instanceof ServiceUnavailable ? `Local service not ready: ${error.message}` : `Config error: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  } finally {
    configReadInFlight = false;
  }
}

/** Read the project config and surface failures (mount / directory change). */
export async function loadStudioConfig(): Promise<void> {
  await readStudioConfig(true);
}

// ---- the full-page creation home ----

/** Re-render the mounted full-page surface. A no-op on the row surfaces. */
function rerender(): void {
  if (state.surface === 'page') renderPage();
}

async function loadProjects(): Promise<void> {
  state.projects = { kind: 'loading' };
  rerender();
  let snapshot: Awaited<ReturnType<typeof host.listProjects>>;
  try {
    snapshot = await host.listProjects();
  } catch (error) {
    allProjects = [];
    state.projects = { kind: 'error', message: error instanceof Error ? error.message : String(error) };
    rerender();
    return;
  }
  // The chats scan spans EVERY project, so remember them before the config
  // filter below drops the ones with no `.design-studio.json`.
  allProjects = allProjectsFromSnapshot(snapshot);
  // Read each project's config so a ready project is known before a send. A
  // failed read must NOT hide the row: record the error, keep the row. A loading
  // snapshot has no configs to read yet.
  const configs: Record<string, ProjectConfigRead> = {};
  if (snapshot.state === 'ready') {
    await Promise.all(
      snapshot.projects.map(async (project) => {
        try {
          const read = await getConfig(project.directory);
          configs[project.directory] = { config: read.config, error: null };
        } catch (error) {
          configs[project.directory] = { config: null, error: error instanceof Error ? error.message : String(error) };
        }
      }),
    );
  }
  state.projects = projectRows(snapshot, configs);
  rerender();
}

/** Read the project list, then the design-chats list derived from it. */
async function loadDesignHome(): Promise<void> {
  await loadProjects();
  await loadDesignChats();
}

/**
 * The session ids whose per-session Design Mode is ON. Reads `host.storage.keys()`
 * to find the `mode/<id>` entries, then confirms each value actually says ON
 * (turning the mode off keeps the key, so the key alone is not enough). Pure
 * parsing lives in `modeSessionIdFromKey`; this only does the IO.
 */
async function readDesignModeSessionIds(): Promise<Set<string>> {
  const on = new Set<string>();
  let keys: string[];
  try {
    keys = await host.storage.keys();
  } catch {
    return on;
  }
  const candidates = keys.map(modeSessionIdFromKey).filter((id): id is string => id !== null);
  await Promise.all(
    candidates.map(async (id) => {
      try {
        const value = (await host.storage.get(modeStorageKey(id)!)) as { on?: unknown } | undefined;
        if (value && typeof value === 'object' && value.on === true) on.add(id);
      } catch {
        /* an unreadable mode entry is simply not ON */
      }
    }),
  );
  return on;
}

/**
 * The session ids carrying a persistent design marker (`design/<id>`). Unlike
 * the mode key, the marker is never cleared, so this read only needs the key's
 * presence — a session once turned ON stays a design chat. IO only; the key
 * parse lives in `designSessionIdFromKey`.
 */
async function readDesignMarkerSessionIds(): Promise<Set<string>> {
  const marked = new Set<string>();
  let keys: string[];
  try {
    keys = await host.storage.keys();
  } catch {
    return marked;
  }
  for (const key of keys) {
    const id = designSessionIdFromKey(key);
    if (id !== null) marked.add(id);
  }
  return marked;
}

/**
 * The session ids that have EVER had a `mode/<id>` entry, regardless of its `on`
 * value. Design Mode writes this key the first time it is used for a session and
 * keeps it (set to OFF) when the mode is turned off, so its mere presence marks a
 * session the user has used for design — the only signal that exists for a
 * history predating the persistent marker. IO only; the key parse lives in
 * `modeSessionIdFromKey` and this never reads the value.
 */
async function readDesignModeKeySessionIds(): Promise<Set<string>> {
  const used = new Set<string>();
  let keys: string[];
  try {
    keys = await host.storage.keys();
  } catch {
    return used;
  }
  for (const key of keys) {
    const id = modeSessionIdFromKey(key);
    if (id !== null) used.add(id);
  }
  return used;
}

/**
 * Build the design-chats list: read EVERY registered project's sessions (config
 * or not), read which session ids have Design Mode ON via storage keys, derive the
 * view (per-session detection also reads each snapshot's own mode chip), then
 * keep it fresh with `onSessions`. Honours the snapshot states: loading while
 * the projects (or a sessions load) are loading, an error with a Retry
 * otherwise, and a true empty state only for ready + no design chat.
 */
async function loadDesignChats(): Promise<void> {
  const view = state.projects;
  if (!view || view.kind === 'loading') {
    state.designChats = { kind: 'loading' };
    rerender();
    return;
  }
  if (view.kind === 'error') {
    state.designChats = { kind: 'error', message: view.message };
    rerender();
    return;
  }
  // The chats scan spans EVERY registered project, not the config-filtered
  // design projects: a design chat in a project with no `.design-studio.json`
  // is still a chat and must be listed.
  chatProjects = allProjects;
  chatOnIds = await readDesignModeSessionIds();
  chatMarkerIds = await readDesignMarkerSessionIds();
  chatModeKeyIds = await readDesignModeKeySessionIds();
  chatSnapshots = new Map();
  await Promise.all(
    chatProjects.map(async (project) => {
      try {
        chatSnapshots.set(project.id, await host.listSessions(project.id));
      } catch {
        // A failed sessions read must not hide the rows the other projects
        // contribute; record it as that project's error snapshot.
        chatSnapshots.set(project.id, { kind: 'sessions', projectId: project.id, state: 'error', coverage: [], sessions: [] });
      }
    }),
  );
  await recomputeDesignChats();
  await subscribeDesignChats();
}

/**
 * Derive the view from the latest snapshots, enrich each chat with the config
 * read from its OWN directory (an isolated chat's `.design-studio.json` lives in
 * `<project>/designs/<slug>`, not the project root), and repaint the page. The
 * signal-based rows paint immediately; the config reads follow, so a slow
 * service never delays the list.
 */
async function recomputeDesignChats(): Promise<void> {
  const listings: ProjectSessions[] = chatProjects.map((project) => ({
    projectId: project.id,
    projectName: project.name,
    snapshot:
      chatSnapshots.get(project.id) ??
      { kind: 'sessions', projectId: project.id, state: 'loading', coverage: [], sessions: [] },
  }));
  const view = designChatRows(listings, chatOnIds, chatMarkerIds, chatModeKeyIds);
  state.designChats = view;
  rerender();
  if (view.kind !== 'list') return;
  const enriched = await withChatConfigs(view.rows);
  // A newer snapshot may have replaced the view while the reads were in flight.
  if (state.designChats === view) {
    state.designChats = { kind: 'list', rows: enriched };
    rerender();
  }
}

/**
 * Attach each chat's own `.design-studio.json` (read from the chat's directory)
 * to its row. A failed read keeps the row and records the error, exactly as the
 * projects list does — it never hides a chat.
 */
async function withChatConfigs(rows: DesignChatRow[]): Promise<DesignChatRow[]> {
  return Promise.all(
    rows.map(async (row) => {
      if (!row.directory) return row;
      try {
        const read = await getConfig(row.directory);
        return { ...row, config: read.config, configError: null };
      } catch (error) {
        return { ...row, config: row.config ?? null, configError: error instanceof Error ? error.message : String(error) };
      }
    }),
  );
}

/** Drop any previous live subscriptions before re-subscribing. */
function clearChatSubscriptions(): void {
  for (const off of chatUnsubscribes) {
    try {
      off();
    } catch {
      /* the host may already have torn the subscription down */
    }
  }
  chatUnsubscribes = [];
}

/** Keep each project's sessions snapshot fresh; a failure is only a lost bonus. */
async function subscribeDesignChats(): Promise<void> {
  clearChatSubscriptions();
  await Promise.all(
    chatProjects.map(async (project) => {
      try {
        const off = await host.onSessions(project.id, (snapshot) => {
          chatSnapshots.set(project.id, snapshot);
          void recomputeDesignChats();
        });
        chatUnsubscribes.push(off);
      } catch {
        /* live updates are a bonus; the initial read still populates the list */
      }
    }),
  );
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** A 24px stroke icon from inline path markup (trusted, built here only). */
function svgIcon(paths: string, size = 18): SVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  for (const [name, value] of Object.entries({
    viewBox: '0 0 24 24',
    width: size,
    height: size,
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 2,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
  })) {
    svg.setAttribute(name, String(value));
  }
  svg.innerHTML = paths;
  return svg;
}

/**
 * The abstract mini-preview on an idea card: no real thumbnail exists, so a
 * small SVG suggests the layout each idea implies. `variant` is the card index
 * modulo four.
 */
function ideaThumb(variant: number): SVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 56 40');
  svg.setAttribute('width', '56');
  svg.setAttribute('height', '40');
  svg.setAttribute('aria-hidden', 'true');
  const add = (tag: string, attrs: Record<string, string | number>): void => {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
    svg.append(node);
  };
  add('rect', { x: 0, y: 0, width: 56, height: 40, rx: 7, class: 'ds-thumb-bg' });
  if (variant === 0) {
    add('rect', { x: 8, y: 8, width: 22, height: 4, rx: 2, class: 'ds-thumb-accent' });
    add('rect', { x: 8, y: 16, width: 40, height: 8, rx: 2, class: 'ds-thumb-line' });
    add('rect', { x: 8, y: 28, width: 18, height: 5, rx: 2, class: 'ds-thumb-line' });
    add('rect', { x: 30, y: 28, width: 18, height: 5, rx: 2, class: 'ds-thumb-line' });
  } else if (variant === 1) {
    add('rect', { x: 8, y: 7, width: 40, height: 5, rx: 2, class: 'ds-thumb-line' });
    add('rect', { x: 8, y: 16, width: 19, height: 16, rx: 3, class: 'ds-thumb-accent' });
    add('rect', { x: 29, y: 16, width: 19, height: 7, rx: 2, class: 'ds-thumb-line' });
    add('rect', { x: 29, y: 25, width: 19, height: 7, rx: 2, class: 'ds-thumb-line' });
  } else if (variant === 2) {
    add('rect', { x: 8, y: 8, width: 12, height: 24, rx: 3, class: 'ds-thumb-accent' });
    add('rect', { x: 24, y: 9, width: 24, height: 4, rx: 2, class: 'ds-thumb-line' });
    add('rect', { x: 24, y: 17, width: 24, height: 4, rx: 2, class: 'ds-thumb-line' });
    add('rect', { x: 24, y: 25, width: 16, height: 4, rx: 2, class: 'ds-thumb-line' });
  } else {
    add('rect', { x: 8, y: 12, width: 12, height: 16, rx: 3, class: 'ds-thumb-line' });
    add('rect', { x: 22, y: 12, width: 12, height: 16, rx: 3, class: 'ds-thumb-accent' });
    add('rect', { x: 36, y: 12, width: 12, height: 16, rx: 3, class: 'ds-thumb-line' });
  }
  return svg;
}

/** Whether the send action may run right now. */
function canSend(): boolean {
  return !state.pageBusy && !referencePending && state.prompt.trim() !== '';
}

/** Keep the send button and the accent progress line in sync with the prompt. */
function updateComposerState(): void {
  const ready = canSend();
  if (sendEl) {
    sendEl.disabled = !ready;
    sendEl.classList.toggle('ready', ready);
    sendEl.classList.toggle('busy', state.pageBusy);
    sendEl.setAttribute('aria-busy', String(state.pageBusy));
    sendEl.title = state.pageBusy ? 'Starting the design session…' : referencePending ? 'Wait for the reference to finish checking' : 'Start the design session';
  }
  if (accentFillEl) {
    const progress = Math.min(1, state.prompt.trim().length / 140);
    accentFillEl.style.width = `${6 + progress * 94}%`;
  }
}

/** The composer overlays, every one driven by the same toggle contract. */
export type OverlayId = 'type' | 'dir' | 'ds' | 'attach';

/**
 * The ONE decision behind every composer overlay trigger: clicking a trigger
 * toggles it — the trigger's own overlay closes if it is already open, otherwise
 * it opens and takes over from whatever else was open, so only one is ever open
 * at a time. Pure, so the toggle contract is testable without a DOM.
 */
export function nextOverlayState(current: OverlayId | null, triggerId: OverlayId): OverlayId | null {
  return current === triggerId ? null : triggerId;
}

/** The overlay currently open, or null. At most one is open at a time. */
function currentOverlay(): OverlayId | null {
  if (state.typeMenuOpen) return 'type';
  if (state.dirMenuOpen) return 'dir';
  if (state.attachMenuOpen) return 'attach';
  if (state.dsMenuOpen) return 'ds';
  return null;
}

/** The trigger to focus once the page is rebuilt — set whenever a close happens. */
let refocusOverlayTrigger: OverlayId | null = null;

/**
 * Toggle one composer overlay through the shared rule: open it (closing any
 * other), or close it when it is the one already open. A fresh open resets the
 * overlay's own scratch state; a close hands focus back to the trigger.
 */
function toggleMenu(which: OverlayId): void {
  if (currentOverlay() === 'attach') cancelReferenceValidation();
  const next = nextOverlayState(currentOverlay(), which);
  state.typeMenuOpen = next === 'type';
  state.dirMenuOpen = next === 'dir';
  state.attachMenuOpen = next === 'attach';
  state.dsMenuOpen = next === 'ds';
  if (next === 'ds') {
    // Each open starts clean: an empty search, and the current choice highlighted.
    dsQuery = '';
    dsHighlight = state.pageDesignSystemId;
  }
  // A close returns focus to the trigger it came from; an open leaves focus to
  // the panel, which places it on its own first control.
  refocusOverlayTrigger = next === null ? which : null;
  renderPage();
}

/**
 * Close the one open overlay. `refocus` hands focus back to that overlay's
 * trigger after the rebuild (Escape and a selection); an outside click leaves
 * focus where the user clicked.
 */
function closeMenus(refocus = false): void {
  const open = currentOverlay();
  if (!open) return;
  if (open === 'attach') cancelReferenceValidation();
  state.typeMenuOpen = false;
  state.dirMenuOpen = false;
  state.attachMenuOpen = false;
  state.dsMenuOpen = false;
  refocusOverlayTrigger = refocus ? open : null;
  renderPage();
}

/**
 * Close the active overlay after a selection and return focus to its trigger.
 * Selection is always the overlay closing, so it does not re-check open state.
 */
function closeActiveOverlay(id: OverlayId): void {
  if (id === 'attach') cancelReferenceValidation();
  state.typeMenuOpen = false;
  state.dirMenuOpen = false;
  state.attachMenuOpen = false;
  state.dsMenuOpen = false;
  refocusOverlayTrigger = id;
  renderPage();
}

/**
 * Any click outside an open overlay closes it. The panel and the trigger count
 * as inside; the transparent backdrop does NOT — it is the outside click the
 * overlay catches, so it must close rather than be swallowed.
 */
function onPageWindowClick(event: MouseEvent): void {
  const target = event.target as HTMLElement | null;
  if (target?.closest('.ds-ds-panel, .ds-menu, .ds-menu-trigger')) return;
  closeMenus();
}

/** Escape from anywhere in the frame closes an open overlay, the pickers included. */
function onPageKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  if (!currentOverlay()) return;
  event.preventDefault();
  closeMenus(true);
}

/**
 * The label the working-directory row shows: the resolved registered project,
 * else the needs-project state ("Loading…" until the first projects load).
 */
function currentDirLabel(): string {
  const view = state.projects;
  if (!view || view.kind === 'loading') return 'Loading…';
  const target = pageTarget();
  if (target.kind === 'project') {
    const project = allProjects.find((candidate) => candidate.id === target.projectId);
    return project?.name ?? fileBaseName(target.dir);
  }
  return state.directory ? 'Not a registered project' : 'No project open';
}

/** The centred page: hero, composer, working directory and idea cards. */
function renderPage(): void {
  if (!pageBody || state.surface !== 'page') return;
  pageBody.replaceChildren();
  promptEl = null;
  sendEl = null;
  accentFillEl = null;
  const shell = q('div', 'ds-home');
  if (pageEnter) {
    shell.classList.add('ds-enter');
    pageEnter = false;
  }
  shell.append(renderHero(), renderComposer(), renderDirRow(), renderIdeas(), renderDesignSection(), renderFooter());
  pageBody.append(shell);
  updateComposerState();
  focusPendingTrigger();
  if (referenceFocusId) {
    const target = Array.from(pageBody.querySelectorAll<HTMLButtonElement>('.ds-reference-remove'))
      .find((button) => button.dataset.referenceId === referenceFocusId);
    referenceFocusId = null;
    target?.focus();
  }
}

/**
 * Focus the trigger that a close asked to return focus to, once it is back in
 * the DOM. Keyboard users keep their place across the rebuild.
 */
function focusPendingTrigger(): void {
  const id = refocusOverlayTrigger;
  if (!id) return;
  refocusOverlayTrigger = null;
  pageBody?.querySelector<HTMLElement>(`[data-overlay-trigger="${id}"]`)?.focus();
}

function renderHero(): HTMLElement {
  const hero = q('header', 'ds-hero');
  const title = q('h1', 'ds-hero-title');
  title.append(document.createTextNode("Let's create "));
  title.append(q('span', 'ds-hero-type', PAGE_TYPE_LABELS[state.pageType]));
  hero.append(title);
  hero.append(q('p', 'ds-hero-sub', 'Good work starts here'));
  if (state.pageError) {
    const error = q('div', 'ds-home-warn', state.pageError);
    error.setAttribute('role', 'alert');
    hero.append(error);
  }
  return hero;
}

/**
 * ONE anchored-popover pattern, shared by every composer overlay — the type
 * picker, the design-system picker and the `+` attach menu. It returns the
 * trigger's relative anchor and, while open, mounts a full-frame backdrop (what
 * an outside click hits) and the absolutely-positioned panel, so opening never
 * reflows the composer or the lists below. The panel is a labelled dialog, and
 * the keyboard contract — Escape closes, the arrow keys walk the options and
 * focus them — is wired here once for all of them; the panel's own content
 * decides what a click or Enter does.
 */
function anchoredPopover(options: {
  open: boolean;
  trigger: HTMLElement;
  panel: HTMLElement;
  label: string;
  optionSelector: string;
  onClose: () => void;
}): HTMLElement {
  const anchor = q('div', 'ds-ds-anchor');
  anchor.append(options.trigger);
  if (!options.open) return anchor;
  options.panel.setAttribute('role', 'dialog');
  options.panel.setAttribute('aria-label', options.label);
  anchor.append(q('div', 'ds-ds-backdrop'));
  anchor.append(options.panel);
  options.panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      options.onClose();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const active = document.activeElement as HTMLElement | null;
    // A focused <select> owns its arrows (the type panel's Direction/Fidelity).
    if (active?.tagName === 'SELECT') return;
    const items = Array.from(options.panel.querySelectorAll<HTMLElement>(options.optionSelector));
    if (items.length === 0) return;
    event.preventDefault();
    const current = active ? items.indexOf(active) : -1;
    const next = items[popoverStep(current, items.length, event.key === 'ArrowDown' ? 1 : -1)];
    next?.focus();
  });
  return anchor;
}

function renderComposer(): HTMLElement {
  const box = q('div', 'ds-composer');

  const area = q<HTMLTextAreaElement>('textarea', 'ds-composer-input');
  area.rows = 3;
  area.placeholder = 'Describe the design you want…';
  area.value = state.prompt;
  area.setAttribute('aria-label', 'Design brief');
  area.disabled = state.pageBusy;
  area.addEventListener('input', () => {
    state.prompt = area.value;
    updateComposerState();
  });
  area.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (canSend()) void startNewDesign();
    }
  });
  promptEl = area;

  const bar = q('div', 'ds-composer-bar');

  // References belong to this page's draft, not the original host composer.
  const plus = q<HTMLButtonElement>('button', 'ds-plus ds-menu-trigger');
  plus.dataset.overlayTrigger = 'attach';
  plus.append(svgIcon('<path d="M12 5v14"/><path d="M5 12h14"/>'));
  plus.title = 'Add a reference';
  plus.setAttribute('aria-label', 'Add a reference');
  plus.disabled = state.pageBusy || pageTarget().kind !== 'project';
  if (pageTarget().kind !== 'project') plus.title = 'Register or select a project to add references';
  plus.setAttribute('aria-expanded', String(state.attachMenuOpen));
  plus.addEventListener('click', () => toggleMenu('attach'));
  const attachAnchor = anchoredPopover({
    open: state.attachMenuOpen,
    trigger: plus,
    panel: renderAttachPanel(),
    label: 'Add a reference',
    optionSelector: '.ds-menu-item',
    onClose: () => closeMenus(true),
  });

  // The design-system control, next to `+`: it names the current choice and opens
  // the merged picker panel. "No design system" is the default and the cleared state.
  const designSystem = q<HTMLButtonElement>('button', 'ds-chip ds-ds-trigger ds-menu-trigger');
  designSystem.dataset.overlayTrigger = 'ds';
  designSystem.append(designSystemIcon());
  designSystem.append(q('span', 'ds-chip-label', designSystemLabel(state.pageDesignSystemId)));
  designSystem.append(svgIcon('<path d="M6 9l6 6 6-6"/>', 14));
  designSystem.title = 'Choose a design system';
  designSystem.setAttribute('aria-label', `Design system: ${designSystemLabel(state.pageDesignSystemId)}`);
  designSystem.disabled = state.pageBusy;
  designSystem.addEventListener('click', () => toggleMenu('ds'));

  const chip = q<HTMLButtonElement>('button', 'ds-chip ds-menu-trigger');
  chip.dataset.overlayTrigger = 'type';
  chip.append(q('span', 'ds-chip-label', PAGE_TYPE_LABELS[state.pageType]));
  chip.append(svgIcon('<path d="M6 9l6 6 6-6"/>', 14));
  chip.title = 'Choose the design type';
  chip.setAttribute('aria-label', 'Choose the design type');
  chip.disabled = state.pageBusy;
  chip.addEventListener('click', () => toggleMenu('type'));

  const spacer = q('div', 'ds-composer-spacer');

  const send = q<HTMLButtonElement>('button', 'ds-send');
  send.append(svgIcon('<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>', 20));
  send.title = 'Start the design session';
  send.setAttribute('aria-label', 'Start the design session');
  send.addEventListener('click', () => {
    if (canSend()) void startNewDesign();
  });
  sendEl = send;

  // Every control and its overlay share one relative anchor (the SAME pattern),
  // so each panel floats absolutely under its control instead of expanding the
  // composer and pushing the idea cards / design-work list down.
  const dsAnchor = anchoredPopover({
    open: state.dsMenuOpen,
    trigger: designSystem,
    panel: renderDesignSystemPanel(),
    label: 'Choose a design system',
    optionSelector: '.ds-ds-item',
    onClose: () => closeMenus(true),
  });
  const typeAnchor = anchoredPopover({
    open: state.typeMenuOpen,
    trigger: chip,
    panel: renderTypeMenu(),
    label: 'Choose the design type',
    optionSelector: '.ds-menu-item',
    onClose: () => closeMenus(true),
  });

  const children: HTMLElement[] = [];
  children.push(attachAnchor);
  children.push(dsAnchor, typeAnchor, spacer, send);
  bar.append(...children);
  box.append(area, renderReferenceDraft(), bar);
  // The overlays must escape the composer's rounded-corner clip while open.
  box.classList.toggle('ds-overlay-open', state.attachMenuOpen || state.dsMenuOpen || state.typeMenuOpen);

  const track = q('div', 'ds-composer-accent');
  accentFillEl = q('div', 'ds-composer-accent-fill');
  track.append(accentFillEl);
  box.append(track);

  return box;
}

/** Compact suffixes disambiguate equal basenames; disclosure exposes full paths. */
function referenceDisplayLabel(reference: DraftReference): string {
  const parts = reference.path.split('/').filter(Boolean);
  let count = Math.min(2, parts.length);
  const others = state.references.filter((candidate) => candidate.id !== reference.id);
  while (count < parts.length && others.some((candidate) => candidate.path.split('/').filter(Boolean).slice(-count).join('/') === parts.slice(-count).join('/'))) count += 1;
  return `${fileBaseName(reference.sourceDirectory)} · ${parts.slice(-count).join('/')}`;
}

/** One wrapping row; full canonical identity is available without a tooltip. */
function renderReferenceDraft(): HTMLElement {
  const list = q('ul', 'ds-reference-list');
  list.setAttribute('aria-label', 'References included with this design brief');
  list.hidden = state.references.length === 0;
  for (const reference of state.references) {
    const item = q('li', 'ds-reference-chip');
    item.append(svgIcon(reference.kind === 'project'
      ? '<path d="M3 7h6l2 2h10v11H3z"/>'
      : '<path d="M14 2H6v20h12V6z"/><path d="M14 2v6h6"/>', 14));
    const details = q<HTMLDetailsElement>('details', 'ds-reference-details');
    const summary = q('summary');
    summary.setAttribute('aria-label', `${reference.path}; source: ${reference.sourceDirectory}. Show full path`);
    const label = q('span', 'ds-reference-label', referenceDisplayLabel(reference));
    label.title = `${reference.path}\nSource: ${reference.sourceDirectory}`;
    summary.append(label);
    details.append(summary, q('span', 'ds-reference-path', reference.path), q('span', 'ds-reference-source', `Source: ${reference.sourceDirectory}`));
    const remove = q<HTMLButtonElement>('button', 'ds-reference-remove');
    remove.type = 'button';
    remove.dataset.referenceId = reference.id;
    remove.setAttribute('aria-label', `Remove ${reference.path}`);
    remove.title = `Remove ${reference.path}`;
    remove.disabled = state.pageBusy;
    remove.append(svgIcon('<path d="m6 6 12 12M18 6 6 18"/>', 14));
    remove.addEventListener('click', () => removePageReference(reference.id));
    item.append(details, remove);
    list.append(item);
  }
  return list;
}

export function removePageReference(id: string): void {
  if (state.pageBusy) return;
  const index = state.references.findIndex((reference) => reference.id === id);
  if (index < 0) return;
  const removed = state.references[index]!;
  state.references = removeDraftReference(state.references, id);
  referenceFocusId = state.references[index]?.id ?? state.references[index - 1]?.id ?? null;
  if (!referenceFocusId) refocusOverlayTrigger = 'attach';
  announceReference(`Removed ${removed.path}.`);
  renderPage();
}

/**
 * The type picker panel: the DESIGN_TYPES list on top (each row names the type
 * and its hint; clicking one applies it and closes — the headline, the chip and
 * the idea cards all follow) and the Direction/Fidelity options in a footer, in
 * the same anchored overlay the design-system picker uses.
 */
function renderTypeMenu(): HTMLElement {
  const panel = q('div', 'ds-ds-panel ds-type-panel');
  const list = q('div', 'ds-ds-list ds-type-list');
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'Design types');
  for (const type of DESIGN_TYPES) {
    const on = type === state.pageType;
    const item = q<HTMLButtonElement>('button', `ds-menu-item${on ? ' on' : ''}`);
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', on ? 'true' : 'false');
    const main = q('span', 'ds-menu-main');
    main.append(q('strong', undefined, PAGE_TYPE_LABELS[type]));
    main.append(q('span', 'ds-menu-hint', TYPE_HINT[type]));
    item.append(main);
    if (on) item.append(svgIcon('<path d="M20 6L9 17l-5-5"/>', 16));
    item.addEventListener('click', () => {
      state.pageType = type;
      closeActiveOverlay('type');
    });
    list.append(item);
  }
  panel.append(list, renderOptions());
  if (state.typeMenuOpen) queueMicrotask(() => panel.querySelector<HTMLElement>('.ds-menu-item')?.focus());
  return panel;
}

function renderOptions(): HTMLElement {
  const row = q('div', 'ds-options');

  const direction = q<HTMLSelectElement>('select');
  direction.append(option('auto', 'Auto (infer from the brief)'));
  for (const id of Object.keys(DIRECTIONS) as DirectionId[]) direction.append(option(id, DIRECTIONS[id].name));
  direction.value = state.pageDirection;
  direction.addEventListener('change', () => {
    state.pageDirection = direction.value as 'auto' | DirectionId;
  });

  const fidelity = q<HTMLSelectElement>('select');
  for (const [value, label] of FIDELITY_OPTIONS) fidelity.append(option(value, label));
  fidelity.value = state.pageFidelity;
  fidelity.addEventListener('change', () => {
    state.pageFidelity = fidelity.value as Fidelity;
  });

  row.append(field('Direction', direction), field('Fidelity', fidelity));
  return row;
}

function field(label: string, control: HTMLElement): HTMLElement {
  const wrap = q('label', 'ds-field');
  wrap.append(q('span', 'ds-field-label', label), control);
  return wrap;
}

// ---- the `+` attach control (an anchored overlay above the composer) ----
//
// The page stages source-qualified references locally. Only explicit pasted
// paths are resolved; a browser's dropped File.name is never an accessible path.
// In-session attachment remains a separate, compatible host-composer action.

/** The project the `+` references: its dir, registered id (when any), name and config. */
type AttachProject = { dir: string; projectId?: string; name: string; config: StudioConfig | null };

/** Resolve the project the `+` references from the page's target/current project. */
function attachProject(): AttachProject {
  const target = pageTarget();
  // The target's config comes from the projects load; when it is the current
  // directory, a fresh `/config` read (state.config) is the better fallback than
  // nothing — never mix a config from a DIFFERENT directory in.
  const config = target.kind === 'project'
    ? (target.config ?? (target.dir === state.directory ? state.config : null))
    : state.config;
  const dir = target.kind === 'project' ? target.dir : (state.directory ?? '');
  const name = config?.name?.trim() || (dir ? fileBaseName(dir) : 'Project');
  return { dir, projectId: target.kind === 'project' ? target.projectId : undefined, name, config };
}

/**
 * Attach a project reference to the composer. A no-url project refuses with the
 * actionable line rather than sending a chip the host would reject.
 */
export async function attachProjectReference(): Promise<void> {
  const project = attachProject();
  if (state.surface === 'page') {
    if (state.pageBusy || referencePending) return;
    if (pageTarget().kind !== 'project') {
      referenceError = 'Register or select a project to add references.';
      renderPage();
      return;
    }
    stagePageReference({ id: `project:${project.dir}`, kind: 'project', path: project.dir, sourceDirectory: project.dir, label: project.name });
    closeActiveOverlay('attach');
    return;
  }
  const url = projectHttpUrl(project.config);
  if (!url) {
    await host.toast({ kind: 'error', message: ATTACH_NEEDS_URL });
    return;
  }
  try {
    const chip = projectReferenceChip({ projectId: project.projectId, dir: project.dir, name: project.name, url });
    await host.attach(chip);
    await host.toast({ kind: 'success', message: 'Project reference added to the composer.' });
  } catch (error) {
    await host.toast({ kind: 'error', message: `Could not attach: ${error instanceof Error ? error.message : String(error)}` });
  }
}

/**
 * Attach a FILE reference from a pasted path: referenced (never uploaded) under
 * the project's url. A no-url project refuses the same way.
 */
export async function attachProjectPath(path: string): Promise<void> {
  const project = attachProject();
  if (state.surface === 'page') {
    if (state.pageBusy || referencePending) return;
    attachPathDraft = path;
    referenceError = '';
    if (pageTarget().kind !== 'project') {
      referenceError = 'Register or select a project, then paste the file path again.';
      renderPage();
      announceReference(referenceError);
      return;
    }
    if (!path.trim()) {
      referenceError = 'Paste a project-relative or full file path.';
      renderPage();
      return;
    }
    const request = ++referenceRequest;
    referencePending = true;
    referenceSlow = false;
    renderPage();
    announceReference('Checking that the file is accessible…');
    const slowTimer = setTimeout(() => {
      if (request !== referenceRequest) return;
      referenceSlow = true;
      renderPage();
      announceReference('This is taking longer than expected. Close the reference menu to cancel, then retry.');
    }, 15000);
    try {
      // Capture the source before awaiting. Switching projects never rewrites
      // an existing reference or resolves this request against another source.
      const resolved = await validateReferencePath(project.dir, path.trim());
      if (request !== referenceRequest || state.surface !== 'page') return;
      stagePageReference({ id: `file:${resolved.path}`, kind: 'file', path: resolved.path, sourceDirectory: resolved.sourceDirectory, label: fileBaseName(resolved.path) });
      attachPathDraft = '';
      referencePending = false;
      closeActiveOverlay('attach');
    } catch (error) {
      if (request !== referenceRequest) return;
      referenceError = `${error instanceof Error ? error.message : String(error)} Paste an accessible file path and try again.`;
      announceReference(referenceError);
    } finally {
      clearTimeout(slowTimer);
      if (request === referenceRequest) {
        referencePending = false;
        referenceSlow = false;
        renderPage();
      }
    }
    return;
  }
  const url = projectHttpUrl(project.config);
  if (!url) {
    await host.toast({ kind: 'error', message: ATTACH_NEEDS_URL });
    return;
  }
  try {
    const chip = fileReferenceChip({ path, url });
    await host.attach(chip);
    await host.toast({ kind: 'success', message: 'File reference added to the composer.' });
  } catch (error) {
    await host.toast({ kind: 'error', message: `Could not attach: ${error instanceof Error ? error.message : String(error)}` });
  }
}

// ---- dropping a file onto the page ----

/** Whether a drag carries files (the only kind the page answers). */
export function dragHasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

/** Nesting depth of the file drag currently over the page (dragenter/leave pair). */
let dragDepth = 0;

function onPageDragEnter(event: DragEvent): void {
  if (!dragHasFiles(event)) return;
  event.preventDefault();
  dragDepth += 1;
  pageBody?.classList.add('ds-drop');
}

function onPageDragOver(event: DragEvent): void {
  if (!dragHasFiles(event)) return;
  // Required on dragover or the drop event never fires.
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
}

function onPageDragLeave(event: DragEvent): void {
  if (!dragHasFiles(event)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) pageBody?.classList.remove('ds-drop');
}

function onPageDrop(event: DragEvent): void {
  if (!dragHasFiles(event)) return;
  event.preventDefault();
  dragDepth = 0;
  pageBody?.classList.remove('ds-drop');
  void attachDroppedFiles(event);
}

/** A browser drop cannot provide a filesystem path. Ask, never guess or upload. */
export async function attachDroppedFiles(event: DragEvent): Promise<void> {
  const files = Array.from(event.dataTransfer?.files ?? []);
  if (files.length === 0) return;
  announceReference(DROP_PATH_MESSAGE);
  await host.toast({ kind: 'info', message: DROP_PATH_MESSAGE });
}

// ---- references ----
//
// These chips represent ONLY the Studio page's unsent draft. They do not mirror
// host.attach, whose live in-chat picks still belong to the host composer.

function stagePageReference(reference: DraftReference): void {
  const duplicate = state.references.some((existing) => existing.kind === reference.kind && existing.path === reference.path);
  state.references = addDraftReference(state.references, reference);
  referenceError = '';
  announceReference(duplicate ? `Already added: ${reference.path}.` : `Added ${reference.path}.`);
}

/** One source row of the attach overlay: a real button, disabled with a reason when unusable. */
function attachOption(title: string, hint: string, disabled: boolean, onClick: () => void): HTMLButtonElement {
  const item = q<HTMLButtonElement>('button', 'ds-menu-item');
  item.disabled = disabled;
  const main = q('span', 'ds-menu-main');
  main.append(q('strong', undefined, title));
  main.append(q('span', 'ds-menu-hint', hint));
  item.append(main);
  if (!disabled) item.addEventListener('click', onClick);
  return item;
}

/** The `+` overlay: a project reference and explicit pasted paths only. */
function renderAttachPanel(): HTMLElement {
  const panel = q('div', 'ds-ds-panel ds-attach-panel');
  const project = attachProject();
  const usable = pageTarget().kind === 'project';

  const list = q('div', 'ds-ds-list ds-attach-list');
  list.setAttribute('role', 'group');
  list.setAttribute('aria-label', 'Add a reference');
  const projectHint = usable ? (project.dir || project.name) : 'Register or select a project to add references.';
  list.append(
    attachOption('Reference the project', projectHint, !usable || referencePending || state.pageBusy, () => {
      void attachProjectReference();
    }),
  );
  panel.append(list);

  // Never close or erase a path until validation succeeds.
  if (usable) {
    const form = q('form', 'ds-attach-paste');
    form.dataset.state = referencePending ? 'submitted-pending' : attachPathDraft ? 'dirty' : 'untouched';
    form.setAttribute('aria-busy', String(referencePending));
    const label = q('label', 'ds-attach-paste-field');
    label.append(q('span', 'ds-attach-paste-label', 'File path'));
    const input = q<HTMLInputElement>('input', 'ds-attach-paste-input');
    input.type = 'text';
    input.name = 'path';
    input.placeholder = 'src/styles.css';
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.required = true;
    input.value = attachPathDraft;
    input.readOnly = referencePending;
    input.disabled = state.pageBusy;
    input.setAttribute('aria-describedby', 'ds-reference-feedback');
    input.setAttribute('aria-invalid', String(Boolean(referenceError)));
    label.append(input);
    const add = q<HTMLButtonElement>('button', 'ds-attach-paste-add', 'Add');
    add.type = 'submit';
    add.disabled = referencePending || state.pageBusy || !attachPathDraft.trim();
    add.textContent = referencePending ? 'Checking…' : 'Add';
    form.append(label, add);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const path = input.value.trim();
      if (!path) return;
      void attachProjectPath(path);
    });
    // A rebuild must not lose the draft (live snapshots rebuild the lists).
    input.addEventListener('input', () => {
      attachPathDraft = input.value;
      form.dataset.state = input.value ? 'dirty' : 'untouched';
      add.disabled = referencePending || state.pageBusy || !input.value.trim();
    });
    input.addEventListener('blur', () => {
      if (!input.value.trim() && input.value.length > 0) {
        referenceError = 'Paste a project-relative or full file path.';
        input.setAttribute('aria-invalid', 'true');
        feedback.textContent = referenceError;
        feedback.classList.add('error');
      }
    });
    panel.append(form);
    const feedback = q('div', `ds-attach-note${referenceError ? ' error' : ''}`, referencePending
      ? referenceSlow ? 'Still checking. Close this menu to cancel, then retry.' : 'Checking that the file is accessible…'
      : referenceError || 'Paste a project-relative or full path. Files are referenced, never uploaded.');
    feedback.id = 'ds-reference-feedback';
    feedback.setAttribute('role', 'status');
    if (referencePending) {
      const spinner = svgIcon('<path d="M20 12a8 8 0 1 1-8-8"/>', 14);
      spinner.classList.add('ds-reference-spinner');
      feedback.prepend(spinner);
    }
    panel.append(feedback);
    if (state.attachMenuOpen) queueMicrotask(() => input.focus());
  } else {
    panel.append(q('div', 'ds-attach-note', projectHint));
  }
  return panel;
}

// ---- the design-system picker (an anchored overlay above the composer) ----
//
// A single merged panel, not a separate screen: a search field + `+ Create`, a
// list ("No design system" first, then the presets grouped by category) whose
// entry drives a right-hand detail pane (name, category, description, a token
// swatch strip), and the Clear action. Clicking — or Enter/Space on — a row
// SELECTS AND APPLIES it (no separate Use step). Keyboard: arrows move, Enter
// applies, Escape closes. The panel floats absolutely anchored to the
// design-system control, so opening it never reflows the composer or the lists
// below. The catalog and its filter/swatch rules live in mode.ts.

/** The composer control's leading icon: a palette outline in the app's line style. */
function designSystemIcon(): SVGElement {
  return svgIcon(
    '<circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>',
    15,
  );
}

/** Commit a design-system choice (or clear it) and close the panel. */
function applyDesignSystem(id: string | null): void {
  state.pageDesignSystemId = findDesignSystem(id)?.id ?? null;
  closeActiveOverlay('ds');
}

/** The detail pane for the highlighted entry: name, category, description, swatch strip. */
function renderDesignSystemDetail(detail: HTMLElement, id: string | null): void {
  detail.replaceChildren();
  const preset = findDesignSystem(id);
  if (!preset) {
    detail.append(q('div', 'ds-ds-detail-name', NO_DESIGN_SYSTEM));
    detail.append(q('p', 'ds-ds-detail-desc', 'Start from scratch — no preset. The design system comes out of the brief.'));
    return;
  }
  detail.append(q('div', 'ds-ds-detail-name', preset.name));
  detail.append(q('div', 'ds-ds-detail-cat', preset.category));
  detail.append(q('p', 'ds-ds-detail-desc', preset.description));
  const swatches = designSystemSwatches(preset);
  if (swatches.length > 0) {
    const strip = q('div', 'ds-ds-swatches');
    for (const token of swatches) {
      const swatch = q('span', 'ds-ds-swatch');
      // The swatch carries the preset's own colour; the strip's container stays OpenChamber.
      swatch.style.background = token.value;
      swatch.title = `${token.name} ${token.value}`;
      swatch.setAttribute('aria-label', `${token.name} ${token.value}`);
      strip.append(swatch);
    }
    detail.append(strip);
  }
}

function renderDesignSystemPanel(): HTMLElement {
  const panel = q('div', 'ds-ds-panel');
  // role="dialog" and its aria-label are set by the shared `anchoredPopover` on
  // open; Escape and the arrow keys are handled there too, once, for every
  // overlay. Only the Enter-to-apply step is specific to this panel.

  // Toolbar: the search field and the `+ Create` affordance.
  const toolbar = q('div', 'ds-ds-toolbar');
  const search = q<HTMLInputElement>('input', 'ds-ds-search');
  search.type = 'search';
  search.placeholder = 'Search design systems';
  search.setAttribute('aria-label', 'Search design systems');
  search.value = dsQuery;
  const create = q<HTMLButtonElement>('button', 'ds-ds-create', '+ Create');
  create.title = 'Custom design systems are not available yet';
  create.setAttribute('aria-label', 'Create a design system');
  create.disabled = true;
  toolbar.append(search, create);

  // Body: the list at left, the detail pane at right.
  const body = q('div', 'ds-ds-body');
  const list = q('div', 'ds-ds-list');
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'Design systems');
  const detail = q('div', 'ds-ds-detail');
  body.append(list, detail);

  // Footer action: Clear returns to "No design system". There is no `Use`
  // button — clicking (or Enter/Space on) a row applies it directly.
  const actions = q('div', 'ds-ds-foot');
  const clear = q<HTMLButtonElement>('button', 'ds-ds-clear', 'Clear');
  clear.addEventListener('click', () => applyDesignSystem(null));
  actions.append(clear);

  panel.append(toolbar, body, actions);

  // The list items are kept so a highlight change updates classes in place — no
  // rebuild, so the search field keeps its caret and value.
  const itemRefs: Array<{ id: string | null; el: HTMLButtonElement }> = [];

  const setHighlight = (id: string | null): void => {
    if (dsHighlight === id) return;
    dsHighlight = id;
    for (const ref of itemRefs) {
      const on = ref.id === dsHighlight;
      ref.el.classList.toggle('on', on);
      ref.el.setAttribute('aria-selected', on ? 'true' : 'false');
    }
    renderDesignSystemDetail(detail, dsHighlight);
  };

  const buildList = (): void => {
    itemRefs.length = 0;
    list.replaceChildren();
    const add = (preset: DesignSystemPreset | null): void => {
      const id = preset?.id ?? null;
      const on = dsHighlight === id;
      const item = q<HTMLButtonElement>('button', `ds-ds-item${on ? ' on' : ''}`);
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', on ? 'true' : 'false');
      const main = q('div', 'ds-ds-item-main');
      main.append(q('span', 'ds-ds-item-name', preset ? preset.name : NO_DESIGN_SYSTEM));
      if (preset) main.append(q('span', 'ds-ds-item-cat', preset.category));
      item.append(main);
      const check = q('span', 'ds-ds-check');
      check.append(svgIcon('<path d="M20 6L9 17l-5-5"/>', 16));
      item.append(check);
      item.addEventListener('click', () => applyDesignSystem(id));
      item.addEventListener('mouseenter', () => setHighlight(id));
      item.addEventListener('focus', () => setHighlight(id));
      itemRefs.push({ id, el: item });
      list.append(item);
    };
    // "No design system" stays first, whatever the search narrows to.
    add(null);
    const shown = filterDesignSystems(dsQuery);
    for (const group of designSystemGroups(shown)) {
      list.append(q('div', 'ds-ds-group', group.category));
      for (const preset of group.presets) add(preset);
    }
    if (shown.length === 0) list.append(q('div', 'ds-ds-empty', 'No design systems match your search.'));
  };

  buildList();
  renderDesignSystemDetail(detail, dsHighlight);

  search.addEventListener('input', () => {
    dsQuery = search.value;
    // A narrowed list may not hold the highlighted entry: fall back to "No design system".
    if (dsHighlight !== null && !filterDesignSystems(dsQuery).some((preset) => preset.id === dsHighlight)) {
      dsHighlight = null;
    }
    buildList();
    renderDesignSystemDetail(detail, dsHighlight);
  });

  // Enter applies the highlighted entry. (Escape and the arrow keys are the
  // shared `anchoredPopover` contract; arrows focus an option, whose focus
  // listener sets the highlight.)
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.target !== create) {
      event.preventDefault();
      applyDesignSystem(dsHighlight);
    }
  });

  // Focus the search field once the panel is in the DOM.
  queueMicrotask(() => search.focus());

  return panel;
}

function renderDirRow(): HTMLElement {
  const row = q('div', 'ds-dir');
  const trigger = q<HTMLButtonElement>('button', 'ds-dir-trigger ds-menu-trigger');
  trigger.dataset.overlayTrigger = 'dir';
  trigger.append(q('span', 'ds-dir-label', 'Working directory'));
  trigger.append(q('span', 'ds-dir-value', currentDirLabel()));
  trigger.append(svgIcon('<path d="M6 9l6 6 6-6"/>', 16));
  trigger.setAttribute('aria-label', 'Choose the working directory');
  trigger.addEventListener('click', () => toggleMenu('dir'));
  row.append(trigger);
  // When the frame's directory belongs to no registered project, say so here —
  // before the user types — with the same message a send refuses with. Skipped
  // until the projects list has resolved once, so the state never flashes.
  const view = state.projects;
  if (view && view.kind !== 'loading' && pageTarget().kind === 'needs-project') {
    row.append(q('div', 'ds-dir-note', NEEDS_PROJECT_MESSAGE));
  }
  if (state.dirMenuOpen) row.append(renderDirMenu());
  return row;
}

function renderDirMenu(): HTMLElement {
  const menu = q('div', 'ds-menu');
  const view = state.projects;
  if (!view || view.kind === 'loading') {
    menu.append(q('div', 'ds-menu-note', 'Loading projects…'));
    return menu;
  }
  if (view.kind === 'error') {
    menu.append(q('div', 'ds-menu-note error', `Could not list projects: ${view.message}`));
    const retry = q<HTMLButtonElement>('button', 'ds-menu-retry', 'Retry');
    retry.addEventListener('click', () => void loadProjects());
    menu.append(retry);
    return menu;
  }

  // Every REGISTERED project, config or not — the config-filtered rows would
  // hide exactly the projects that most need choosing (the ones with no config
  // yet). An unregistered current directory is not an option here: a creation
  // flow refuses it, so it is not offered.
  const configRows = view.kind === 'list' ? view.rows : [];
  const currentRow = allProjects.find((project) => project.directory === state.directory);
  const effectiveId = state.selectedProjectId ?? currentRow?.id ?? null;

  if (allProjects.length === 0) {
    menu.append(q('div', 'ds-menu-note', 'No registered projects yet.'));
  }
  for (const project of allProjects) {
    const matched = configRows.find((candidate) => candidate.directory === project.directory);
    const config = matched?.config ?? null;
    const sub = config?.url ? `${config.type ?? 'custom'} · ${config.url}` : project.directory;
    menu.append(dirOption(project.name, sub, project.id === effectiveId, project.id, projectReady(config) ? undefined : NO_CONFIG_BADGE));
  }
  return menu;
}

function dirOption(title: string, subtitle: string, on: boolean, id: string | null, badge?: string): HTMLElement {
  const item = q<HTMLButtonElement>('button', `ds-menu-item${on ? ' on' : ''}`);
  const main = q('span', 'ds-menu-main');
  const titleLine = q('span', 'ds-menu-title');
  titleLine.append(q('strong', undefined, title));
  if (badge) titleLine.append(q('span', 'ds-badge', badge));
  main.append(titleLine);
  main.append(q('span', 'ds-menu-hint', subtitle));
  item.append(main);
  if (on) item.append(svgIcon('<path d="M20 6L9 17l-5-5"/>', 16));
  item.addEventListener('click', () => {
    state.selectedProjectId = id;
    closeActiveOverlay('dir');
  });
  return item;
}

function renderIdeas(): HTMLElement {
  const wrap = q('div', 'ds-ideas');
  wrap.append(q('div', 'ds-ideas-label', 'Ideas'));
  const list = q('div', 'ds-idea-list');
  IDEAS[state.pageType].forEach((idea, index) => {
    const card = q<HTMLButtonElement>('button', 'ds-idea');
    card.disabled = state.pageBusy;
    card.append(ideaThumb(index % 4));
    const body = q('div', 'ds-idea-body');
    body.append(q('strong', 'ds-idea-title', idea.title));
    body.append(q('span', 'ds-idea-desc', idea.description));
    card.append(body);
    card.addEventListener('click', () => {
      if (state.pageBusy) return;
      state.prompt = idea.prompt;
      if (promptEl) promptEl.value = idea.prompt;
      updateComposerState();
      promptEl?.focus();
    });
    list.append(card);
  });
  wrap.append(list);
  return wrap;
}

/**
 * The calm closing line under everything: the extension's name and a one-line
 * hint, so the content never sits flush against the frame's bottom edge. No
 * controls — a footer, not a toolbar.
 */
function renderFooter(): HTMLElement {
  const footer = q('footer', 'ds-footer');
  footer.append(q('span', 'ds-footer-name', 'Design Studio'));
  footer.append(q('span', 'ds-footer-hint', 'Add references by ⌘-clicking an element in the live preview window.'));
  return footer;
}
//
// ONE list, not two: registered design projects and design chats (the sessions
// whose Design Mode is ON) share a single list, each row marked by a small
// leading type icon — a framed canvas for a project, a speech bubble for a chat.
// Each row is one button, so it is focusable and fires on Enter/Space without a
// nested control. A failed config/sessions read NEVER hides a row.

/**
 * The two leading type icons of the merged list, as inline stroke paths in the
 * app's 24×24 line-icon style: a framed canvas for a design project, a speech
 * bubble for a design chat. No emoji; rendered at 15px through `svgIcon`.
 */
const PROJECT_ROW_ICON = '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/>';
const CHAT_ROW_ICON = '<path d="M20 15.5a2.5 2.5 0 0 1-2.5 2.5H8l-5 3.5V6a2.5 2.5 0 0 1 2.5-2.5h12A2.5 2.5 0 0 1 20 6z"/>';

/** The small leading type icon span on a merged row (decorative; the button carries the label). */
function rowIcon(paths: string): HTMLElement {
  const span = q('span', 'ds-list-icon');
  span.setAttribute('aria-hidden', 'true');
  span.append(svgIcon(paths, 15));
  return span;
}

/** The loading/error/empty note for a list, with a Retry that reloads the page's lists. */
function listNote(message: string, kind: 'info' | 'error' = 'info'): HTMLElement {
  const note = q('div', `ds-list-note${kind === 'error' ? ' error' : ''}`);
  note.append(q('span', undefined, message));
  if (kind === 'error') {
    const retry = q<HTMLButtonElement>('button', 'ds-list-retry', 'Retry');
    retry.addEventListener('click', () => void loadDesignHome());
    note.append(retry);
  }
  return note;
}

/**
 * The ONE merged section below the composer: one heading, one list. A project
 * row and a chat row sit side by side, told apart by their leading type icon and
 * their action. `designWorkRows` collapses the two sources' snapshot states into
 * one, so Loading…, the error line + Retry, and the single empty line are the
 * only non-list states.
 */
function renderDesignSection(): HTMLElement {
  const section = q('section', 'ds-section');
  const head = q('div', 'ds-section-head');
  head.append(q('div', 'ds-section-label', 'Your design work'));
  // While a project is selected, the one calm reset lives in the heading.
  if (state.projectFilter) {
    const showAll = q<HTMLButtonElement>('button', 'ds-section-reset', 'Show all');
    showAll.title = 'Show every design project and chat';
    showAll.addEventListener('click', () => {
      state.projectFilter = null;
      rerender();
    });
    head.append(showAll);
  }
  section.append(head);
  const list = q('div', 'ds-list');
  // In the unfiltered view a listed project hides its own chats — they stay one
  // click away through "Open sessions". The filter view needs exactly those
  // rows, so it omits nothing and filters instead.
  const listedIds = state.projects?.kind === 'list' ? new Set(state.projects.rows.map((row) => row.id)) : new Set<string>();
  const view = designWorkRows(
    state.projects ?? { kind: 'loading' },
    state.designChats ?? { kind: 'loading' },
    state.projectFilter ? undefined : { omitChatProjectIds: listedIds },
  );
  if (view.kind === 'loading') {
    list.append(listNote('Loading…'));
  } else if (view.kind === 'error') {
    list.append(listNote(view.message, 'error'));
  } else if (view.kind === 'empty') {
    list.append(listNote(NO_DESIGN_WORK_MESSAGE));
  } else {
    const filter = state.projectFilter;
    const rows = filter
      ? view.rows.filter((row) => (row.kind === 'project' ? row.project.id === filter : row.chat.projectId === filter))
      : view.rows;
    for (const row of rows) {
      list.append(row.kind === 'project' ? renderProjectRow(row.project) : renderChatRow(row.chat));
    }
    // A selected project with no design session yet says so once, rather than
    // leaving the user looking at an unchanged list.
    if (filter && !rows.some((row) => row.kind === 'chat')) {
      list.append(listNote('No design sessions in this project yet.'));
    }
  }
  section.append(list);
  return section;
}

/**
 * A project row: a leading canvas icon, the name, its readiness badge and meta,
 * then the row's own action. The row NEVER starts a session — clicking the body
 * selects the project as the working target and filters the list to its chats
 * (`Open sessions`), and a ready project additionally offers `Preview`, which
 * raises its live window via `POST /open` and opens no session.
 */
function renderProjectRow(row: ProjectRow): HTMLElement {
  const ready = projectReady(row.config);
  const item = q('div', 'ds-list-row');
  const open = q<HTMLButtonElement>('button', 'ds-list-open');
  open.setAttribute('aria-label', `Show the design sessions in ${row.name}`);
  open.append(rowIcon(PROJECT_ROW_ICON));
  const main = q('div', 'ds-list-main');
  const titleLine = q('div', 'ds-list-title');
  titleLine.append(q('span', 'ds-list-name', row.name));
  titleLine.append(q('span', `ds-badge${ready ? ' ready' : ''}`, ready ? DESIGN_READY_BADGE : NO_CONFIG_BADGE));
  main.append(titleLine);
  main.append(q('div', 'ds-list-meta', projectMeta(row)));
  // A read that failed keeps the row and says so — the bug this section must not
  // reintroduce is a dropped row.
  if (row.configError) main.append(q('div', 'ds-list-warn', `Could not read .design-studio.json: ${row.configError}`));
  open.append(main);
  open.append(q('span', 'ds-list-go', state.projectFilter === row.id ? 'Showing' : 'Open sessions'));
  open.addEventListener('click', () => openProjectSessions(row));
  item.append(open);
  // Preview is offered only for a project with a url — it can do what it says.
  if (ready) {
    const preview = q<HTMLButtonElement>('button', 'ds-list-preview', 'Preview');
    preview.title = `Open the ${row.name} preview`;
    preview.setAttribute('aria-label', `Open the ${row.name} preview`);
    preview.addEventListener('click', () => void previewProject(row));
    item.append(preview);
  }
  return item;
}

/**
 * A project row's action: make the project the working target and filter the
 * merged list to its design chats, then bring the list into view. It NEVER
 * starts a session — that is the composer's send, and only there.
 */
function openProjectSessions(row: ProjectRow): void {
  state.selectedProjectId = row.id;
  state.projectFilter = row.id;
  rerender();
  scrollDesignSectionIntoView();
}

/** Bring the merged list into view after a project row selects it. Motion-aware. */
function scrollDesignSectionIntoView(): void {
  const section = pageBody?.querySelector<HTMLElement>('.ds-section');
  if (!section || typeof section.scrollIntoView !== 'function') return;
  const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  section.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
}

/**
 * A project row's `Preview` action: raise the project's live window with its
 * `.design-studio.json` url. No session is opened or created. A project with no
 * url cannot be previewed, so the button is not rendered (the guard is a backstop).
 */
async function previewProject(row: ProjectRow): Promise<void> {
  const url = row.config?.url?.trim();
  if (!url) {
    await host.toast({ kind: 'error', message: NO_PROJECT_URL_MESSAGE });
    return;
  }
  await openProjectWindow({ url }, row.directory, true);
}

/**
 * A chat row. Its config is the chat's OWN `.design-studio.json` (from the
 * chat's directory), so a chat isolated into `<project>/designs/<slug>` shows
 * its readiness and url exactly like a project row does.
 */
function renderChatRow(row: DesignChatRow): HTMLElement {
  const ready = projectReady(row.config);
  const item = q('div', 'ds-list-row');
  const open = q<HTMLButtonElement>('button', 'ds-list-open');
  open.setAttribute('aria-label', `Open the design chat ${row.title} in ${row.projectName}`);
  open.append(rowIcon(CHAT_ROW_ICON));
  const main = q('div', 'ds-list-main');
  const titleLine = q('div', 'ds-list-title');
  titleLine.append(q('span', 'ds-list-name', row.title));
  titleLine.append(q('span', `ds-badge${ready ? ' ready' : ''}`, ready ? DESIGN_READY_BADGE : NO_CONFIG_BADGE));
  main.append(titleLine);
  main.append(q('div', 'ds-list-meta', designChatMeta(row)));
  if (row.configError) main.append(q('div', 'ds-list-warn', `Could not read .design-studio.json: ${row.configError}`));
  open.append(main);
  open.append(q('span', 'ds-list-go', 'Open'));
  open.addEventListener('click', () => void openDesignChat(row));
  item.append(open);
  return item;
}

/**
 * A design-chat row's action: move the user into that session, then — when the
 * chat has its own readable config — bring up its live window with the dev
 * server rooted at the CHAT's directory (so an isolated `designs/<slug>`
 * workspace serves itself, not the project root). Silent on failure: the chat
 * still opens.
 */
async function openDesignChat(row: DesignChatRow): Promise<void> {
  try {
    await host.openSession(row.sessionId);
  } catch (error) {
    await host.toast({ kind: 'error', message: `Could not open the design chat: ${error instanceof Error ? error.message : String(error)}` });
    return;
  }
  const url = row.config?.url?.trim();
  if (url) await openProjectWindow({ url }, row.directory || state.directory, false);
}

// ---- live window state ----

/**
 * Update the status row's live indicators: the dimmed pick hint. Safe to call
 * from the poll loop.
 */
function renderWindowStatus(): void {
  if (hintEl) {
    hintEl.textContent = PICK_HINT;
    hintEl.classList.toggle('active', pickHintActive(state));
    hintEl.classList.toggle('idle', !pickHintActive(state));
  }
  renderSessionStatus();
}

/**
 * The compact session line below the toggle row. When the project is NOT ready
 * this is the WHOLE visible section: the one not-set-up line (the toggle and
 * hint are hidden by `renderRow`). When ready it is the design-session line as
 * before. Cheap text update, safe from the poll loop.
 */
function renderSessionStatus(): void {
  if (!sessionLineEl) return;
  if (!projectReady(state.config)) {
    sessionLineEl.textContent = NO_PROJECT_CONFIG_MESSAGE;
    sessionLineEl.classList.add('off');
    return;
  }
  sessionLineEl.textContent = designSessionStatus({ modeOn: state.mode.on, configUrl: state.config?.url ?? null });
  sessionLineEl.classList.toggle('off', !state.mode.on);
}

/**
 * Show the interactive row only when the project is ready (has a config with a
 * url). Not ready: hide the toggle bar and the ⌘-click hint, leaving exactly
 * the one not-set-up line — so there is NO clickable control and no way to
 * raise a "no url" toast. Re-run on every poll read, so a config that appears
 * (or is deleted) mid-session flips the section live.
 */
function renderRow(): void {
  const ready = projectReady(state.config);
  if (barEl) barEl.classList.toggle('hidden', !ready);
  if (hintEl) hintEl.classList.toggle('hidden', !ready);
  // A readiness flip that hides the interactive row must not drop focus to
  // `body`: move it to the visible session line.
  if (!ready && (focusInside(barEl) || focusInside(hintEl))) focusSessionLine();
  renderServerControl();
  renderWindowStatus();
}

export async function applyState(stateData: LiveState): Promise<void> {
  state.url = stateData.url;
  state.title = stateData.title;
  state.windowOpen = stateData.windowOpen;
  if (stateData.lastPick && stateData.pickSeq > state.lastSeq) {
    state.lastSeq = stateData.pickSeq;
    const pick: TrackedPick = { ...stateData.lastPick, seq: stateData.pickSeq, url: stateData.url, pickedAt: new Date() };
    // Design Mode: a pick IS the instruction context — attach without asking.
    if (state.mode.on) void addToChat(pick);
  }
  renderWindowStatus();
  // The user closed the live window by hand: that IS Design Mode going off. Flip
  // the mode (persist it) and reflect it in the widget — never auto-reopen. The
  // `pendingOpen` guard keeps our own opening window from being read as a close.
  if (!state.windowOpen && state.mode.on && !state.pendingOpen) {
    await turnModeOffByWindowClose();
  }
}

/**
 * The user closed the live window. Mirror that into Design Mode: OFF (persisted
 * and reflected in the widget). No window is reopened here.
 */
async function turnModeOffByWindowClose(): Promise<void> {
  if (!state.mode.on) return;
  state.mode.on = false;
  state.pendingOpen = false;
  await saveMode();
  renderModeUi();
  // The preview window is closed, which is Design Mode going OFF: stop the dev
  // server too, if it is safe to.
  try {
    await requestDevServerStop();
  } catch {
    /* a stop failure is surfaced by doStopDevServer's own toast */
  }
}

async function poll(): Promise<void> {
  if (document.visibilityState !== 'visible') return;
  // Re-detect `.design-studio.json` on every tick so the agent scaffolding one
  // mid-session flips the row to ready without a reload. Silent (mount reports
  // errors) and in-flight-guarded.
  void readStudioConfig(false);
  try {
    await applyState(await getState());
  } catch (error) {
    setStatus(error instanceof ServiceUnavailable ? `Local service not ready: ${error.message}` : `Live window error: ${error instanceof Error ? error.message : String(error)}`, 'error');
  }
  // Keep the server Start/Stop icon honest without blocking the next poll tick.
  void refreshServerStatus();
}

// ---- in-chat widget (status surface) ----

/** Cheap text update, safe to call from the poll loop. */
function renderModeUi(): void {
  if (modeToggleBtn) {
    modeToggleBtn.textContent = state.mode.on ? 'Design Mode: ON' : 'Design Mode: OFF';
    modeToggleBtn.title = state.mode.on ? 'Design Mode is on — click to turn it off' : 'Design Mode is off — click to turn it on';
    modeToggleBtn.classList.toggle('on', state.mode.on);
  }
  renderSessionStatus();
}

/**
 * What kind of surface a host surface name maps to. Pure, so a test can pin that
 * the chat Work Status row draws the shared row, that the rail panel draws only
 * its calm one-line pointer to the sidebar page, that the page draws the
 * full-screen home, and that nothing else draws anything.
 */
export type SurfaceKind = 'row' | 'note' | 'page' | 'none';

export function surfaceKind(surface: string): SurfaceKind {
  if (surface === 'status') return 'row';
  if (surface === 'panel') return 'note';
  if (surface === 'page') return 'page';
  return 'none';
}

/**
 * Report a frame height to the host, but only for the chat Work Status section,
 * whose frame the host sizes. The rail panel and page own their own height, so a
 * height request there would be meaningless. Never opens a window.
 */
function setSurfaceHeight(height: number): void {
  if (state.surface !== 'status') return;
  // A host refusal (teardown, disconnect) must not surface as an unhandled
  // rejection; the next observed size change reports again — no retry flood.
  void host.setHeight(height).catch(() => {});
}

/** The row content height already reported to the host, so unchanged sizes are not re-sent. */
let reportedStatusHeight = 0;
/** The ResizeObserver watching the row's content height; a rebuild supersedes it. */
let statusHeightObserver: ResizeObserver | null = null;
let statusHeightGeneration = 0;

/**
 * Measure only the content border box (already includes border and padding),
 * plus external vertical margins. Never measure the full-height body/#root:
 * that would feed the host's frame size back into its own height request.
 * The host clamps to 24–320; the row itself provides the overflow scroller.
 */
function reportContentHeight(content: HTMLElement, generation: number): void {
  if (content !== statusRoot || generation !== statusHeightGeneration || state.surface !== 'status') return;
  const verticalMargins = (element: HTMLElement): number => {
    const style = window.getComputedStyle(element);
    return (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0);
  };
  const height = Math.ceil(content.getBoundingClientRect().height + verticalMargins(content) + verticalMargins(document.body));
  // 0 = not laid out yet; ±1px float jitter is not a real change.
  if (height <= 0 || Math.abs(height - reportedStatusHeight) <= 1) return;
  reportedStatusHeight = height;
  setSurfaceHeight(height);
}

/** Start watching the row's content height; disconnect any superseded observer first. */
function observeRowHeight(): void {
  statusHeightObserver?.disconnect();
  statusHeightObserver = null;
  const generation = ++statusHeightGeneration;
  reportedStatusHeight = 0;
  const content = statusRoot;
  if (!content || state.surface !== 'status') return;
  if (typeof ResizeObserver === 'undefined') { reportContentHeight(content, generation); return; }
  statusHeightObserver = new ResizeObserver(() => reportContentHeight(content, generation));
  statusHeightObserver.observe(content);
  reportContentHeight(content, generation);
}


/**
 * The compact chat Work Status row: Start/Stop and Design Mode with the ⌘-click hint and
 * the one-line session status below. The Brief & options form is gone from the
 * row (user decision, 2026-10-13) — the full creation page keeps its composer
 * and brief field. No address bar and no browser chrome. Building it never
 * opens a window.
 */
export function buildRow(root: HTMLElement): void {
  statusRoot = q('div', 'ds-statusmode');
  const bar = q('div', 'ds-rowline');
  // Preview-dev-server Start/Stop control: left of the Design Mode toggle.
  serverBtn = q<HTMLButtonElement>('button', 'ds-server-control');
  serverBtn.addEventListener('click', () => void onServerControlClick());
  serverBtn.hidden = true;
  modeToggleBtn = q<HTMLButtonElement>('button', 'primary');
  // A plain ON/OFF toggle: turning it ON opens the live window (or focuses it
  // when already open); turning it OFF closes the window (see toggleMode).
  modeToggleBtn.addEventListener('click', () => {
    void toggleMode(!state.mode.on);
  });
  bar.append(serverBtn, modeToggleBtn);
  barEl = bar;
  sessionLineEl = q('div', 'ds-sessionline');
  hintEl = q('span', 'ds-hintline');
  serverAnnounceEl = q('div', 'ds-server-announce');
  serverAnnounceEl.setAttribute('aria-live', 'polite');
  serverAnnounceEl.setAttribute('aria-atomic', 'true');
  statusRoot.append(bar, sessionLineEl, hintEl, serverAnnounceEl);
  root.append(statusRoot);
  renderRow();
  // The host sizes this frame from the row's MEASURED content height.
  observeRowHeight();
}

/**
 * The full-screen sidebar page (surface "page"): the Design Studio creation
 * home. The hero, the composer, the working-directory selector and the idea
 * cards all live under one `renderPage`. Building it never opens a live window;
 * only Send (or Enter) does, through `startNewDesign`.
 */
function buildPage(root: HTMLElement): void {
  const wrap = q('div', 'ds ds-page');
  pageBody = q('div', 'ds-page-body');
  referenceLiveEl = q('div', 'ds-reference-announcement');
  referenceLiveEl.setAttribute('role', 'status');
  referenceLiveEl.setAttribute('aria-live', 'polite');
  referenceLiveEl.setAttribute('aria-atomic', 'true');
  wrap.append(pageBody, referenceLiveEl);
  root.append(wrap);
  // A click anywhere outside an open dropdown closes it, and Escape closes it
  // from anywhere in the frame. Registered once; the listeners outlive the
  // re-rendered DOM.
  window.addEventListener('click', onPageWindowClick);
  window.addEventListener('keydown', onPageKeydown);
  // Drops explain the pasted-path requirement; they never create guessed refs.
  // The window-level guards keep a stray drop from navigating the frame.
  wrap.addEventListener('dragenter', onPageDragEnter);
  wrap.addEventListener('dragover', onPageDragOver);
  wrap.addEventListener('dragleave', onPageDragLeave);
  wrap.addEventListener('drop', onPageDrop);
  window.addEventListener('dragover', onPageWindowDragOver);
  window.addEventListener('drop', onPageWindowDrop);
  renderPage();
  void loadDesignHome();
}

/** A file drag over anything keeps the browser from navigating on a stray drop. */
function onPageWindowDragOver(event: DragEvent): void {
  if (dragHasFiles(event)) event.preventDefault();
}

function onPageWindowDrop(event: DragEvent): void {
  if (dragHasFiles(event)) {
    event.preventDefault();
    dragDepth = 0;
    pageBody?.classList.remove('ds-drop');
  }
}

function build(root: HTMLElement): void {
  const kind = surfaceKind(state.surface);
  // The chat Work Status section draws the thin row; the rail panel draws only
  // its one-line pointer (the design work lives on the page); the page draws the
  // full-screen creation home. Any other surface renders nothing.
  if (kind === 'row') {
    buildRow(root);
    return;
  }
  if (kind === 'note') {
    buildPanelNote(root);
    return;
  }
  if (kind === 'page') {
    buildPage(root);
  }
}

/**
 * The rail panel surface: one calm line, nothing else. The real surface is the
 * sidebar page (`/design` and the composer are there); the rail panel keeps a
 * quiet pointer rather than an empty frame. No controls, no live state.
 */
function buildPanelNote(root: HTMLElement): void {
  const wrap = q('div', 'ds ds-panel-note');
  wrap.append(q('p', 'ds-panel-note-line', PANEL_SIDEBAR_HINT));
  root.append(wrap);
}

async function main(): Promise<void> {
  const root = document.getElementById('root');
  if (!root) throw new Error('missing #root');

  // The `/design` resolver: valid on the panel and page surfaces (the ones that
  // carry `commands`). Registered once, before the host asks.
  host.onResolve((request) => resolveDesignCommand(request.args));

  let started = false;
  host.onReady((context: HostReadyContext) => {
    applyHostReady(context, document.documentElement);
    state.surface = context.surface;
    state.directory = context.directory;
    state.sessionId = context.session?.id ?? null;
    state.resolveAllowed = context.surface === 'panel' || context.surface === 'page';
    if (started) return;
    started = true;
    build(root);
    setStatus('Loading…');
    void loadMode();
    void loadStudioConfig();
    // The row surfaces keep their live state fresh; the page does not poll.
    const kind = surfaceKind(state.surface);
    if (kind === 'row') {
      void poll();
      setInterval(() => void poll(), POLL_MS);
    }
  });

  // The current session's live snapshot keeps `sessionBusy` fresh: it cancels a
  // pending stop while the session works and performs it once idle.
  host.onSession((session) => {
    void applySessionSnapshot(session);
  });
  // A completed turn is the moment a pending stop is honoured.
  host.onSessionLifecycle((event) => {
    void handleSessionLifecycle(event);
  });

  host.onDirectory((directory) => {
    state.directory = directory;
    // Keep the last config (and its path) until the fresh read resolves:
    // nulling it here flickers the whole row hide→show on every directory
    // event. The stale config is guarded: `currentConfig()` gates the actions,
    // and the start/stop dir captures keep them targeting the NEW directory.
    state.serverStatus = null;
    state.serverPending = false;
    state.serverError = null;
    renderRow();
    rerender();
    void loadStudioConfig();
  });
}

/**
 * Test seam: `node --test` has no host, so a test points the panel at a project
 * dir directly instead of replaying an `onReady` context. Mirrors the live
 * `onDirectory` semantics — the same server-state resets, and a generation
 * bump so mid-flight actions recognise the switch.
 */
export function setProjectDirectory(dir: string | null): void {
  state.directory = dir;
  directoryGeneration += 1;
  state.serverStatus = null;
  state.serverPending = false;
  state.serverError = null;
}

/** Test seams for the unsent page draft, without installing a browser host. */
export function setSurface(surface: string): void {
  state.surface = surface;
}

export function setPrompt(prompt: string): void {
  state.prompt = prompt;
}

export function getPageDraft(): { prompt: string; references: DraftReference[]; error: string; path: string; referenceError: string; pending: boolean } {
  return { prompt: state.prompt, references: state.references.map((reference) => ({ ...reference })), error: state.pageError, path: attachPathDraft, referenceError, pending: referencePending };
}

export function resetReferenceDraft(): void {
  cancelReferenceValidation();
  state.references = [];
  attachPathDraft = '';
  referenceError = '';
}

export { renderComposer, renderReferenceDraft };

/** Test seam: pretend the host reported this session, so storage writes can target it. */
export function setSessionId(id: string | null): void {
  state.sessionId = id;
}

/** Test seam: the current Design Mode, so a test can assert toggle transitions. */
export function getModeState(): DesignMode {
  return { ...state.mode };
}

/** Test seam: whether the pending-open guard is held (an open or an ON transition). */
export function getPendingOpen(): boolean {
  return state.pendingOpen;
}

/** Test seam: set the chosen design-system preset id without replaying a page render. */
export function setDesignSystem(id: string | null): void {
  state.pageDesignSystemId = id;
}

/** Test seam: allow the `/design` resolver without replaying an `onReady` context. */
export function allowResolve(value: boolean): void {
  state.resolveAllowed = value;
}

/** Test seam: run the New-design flow directly. */
export { startNewDesign, resolveDesignCommand, loadProjects };

/** Test seam: the registered projects the last load recorded. */
export function getAllProjects(): RegisteredProject[] {
  return [...allProjects];
}

/** Test seam: pretend the user picked this project in the working-directory selector. */
export function setSelectedProject(id: string | null): void {
  state.selectedProjectId = id;
}

/** Test seam: set the current session's busy flag without a host snapshot. */
export function setSessionBusy(busy: boolean): void {
  state.sessionBusy = busy;
}

/** Test seam: clear the stop bookkeeping between cases. */
export function resetStopState(): void {
  state.sessionBusy = false;
  state.pendingStop = null;
  state.startedServers.clear();
  state.serverStatus = null;
  state.serverPending = false;
  state.serverError = null;
}

/** Test seam: the current stop bookkeeping. */
export function getStopState(): {
  pendingStop: boolean;
  pendingRequest: { dir: string; manual: boolean } | null;
  sessionBusy: boolean;
  startedServers: string[];
} {
  return {
    pendingStop: state.pendingStop !== null,
    pendingRequest: state.pendingStop ? { ...state.pendingStop } : null,
    sessionBusy: state.sessionBusy,
    startedServers: [...state.startedServers],
  };
}

/** Test seam: set the cached config, as if read for the current directory. */
export function setStudioConfig(config: StudioConfig | null): void {
  state.config = config;
  state.configDir = state.directory;
}

/** Test seam: the Start/Stop control's committed state. */
export function getServerControlState(): { status: boolean | null; pending: boolean; error: string | null } {
  return { status: state.serverStatus, pending: state.serverPending, error: state.serverError };
}

/** Test seam: the announcements `announceServer` made, in order. */
export function getServerAnnouncements(): string[] {
  return [...serverAnnouncements];
}

/** Test seam: clear the recorded announcements between cases. */
export function resetServerAnnouncements(): void {
  serverAnnouncements.length = 0;
}

/** Test seam: the poll-driven status read, without the poll loop. */
export { refreshServerStatus };

/** Test seam: the Start/Stop icon button's click handler, without a mounted row. */
export { onServerControlClick as clickServerControl };

void main();
