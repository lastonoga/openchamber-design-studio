// Thin, typed seam over the two things the panel is allowed to do: talk to the
// host (attach references to the chat) and reach its own local service through
// `serviceRequest`. Everything that can fail in a way the UI must explain is
// normalized to either `ServiceUnavailable` or a plain Error.
//
// The live view is a real headful Chrome window the service owns; the panel
// only opens/navigates it (`/open`), raises it without reloading (`/focus`) and
// reads its state (`/state`). Picking is a Cmd/Ctrl-click gesture in the live
// window itself, not a route. There is no rendered surface to size.
import { connectHost, HostRequestError } from '@openchamber/sdk';
import type { GuestProjectsSnapshot, GuestSessionRecord, GuestSessionsSnapshot } from '@openchamber/sdk';
import type { VerifyConfig } from '../shared/verify-types.ts';

export const host = connectHost();

/** The service is declared but not approved/spawned, or died. */
export class ServiceUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServiceUnavailable';
  }
}

function describe(error: unknown): string {
  if (error instanceof HostRequestError) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return String(error);
}

async function callService<T>(
  path: string,
  query?: Record<string, string>,
  method: 'GET' | 'POST' | 'PUT' = 'GET',
  body?: string,
): Promise<T> {
  let result;
  try {
    result = await host.serviceRequest({ method, path, query, body });
  } catch (error) {
    throw new ServiceUnavailable(describe(error));
  }
  if (result.status !== 200) {
    let detail = `HTTP ${result.status}`;
    try {
      const parsed = JSON.parse(result.body) as { error?: string };
      if (parsed.error) detail = parsed.error;
    } catch {
      /* body was not JSON */
    }
    throw new ServiceUnavailable(detail);
  }
  return JSON.parse(result.body) as T;
}

export type PickPayload = {
  selector: string;
  tag: string;
  classes: string;
  text: string;
  outerHTML: string;
  styles: Record<string, string>;
  rect: { x: number; y: number; width: number; height: number };
};

/** The real window the service drives: its page and last pick. */
export type LiveState = {
  url: string;
  title: string;
  lastPick: PickPayload | null;
  pickSeq: number;
  windowOpen: boolean;
};

/** What `POST /open` answers after opening/navigating the real window. */
export type OpenResult = {
  ok: boolean;
  url: string;
  title: string;
  settled: boolean;
  /** True when the service spawned the project's dev server for this open. */
  started?: boolean;
  /** Actionable reason when `ok` is false (the dev server is down, or open failed). */
  error?: string;
};

/** Status shown in the dock while an open (and dev-server start) is in flight. */
export const OPENING_STATUS = 'Starting dev server…';

/**
 * Open (or navigate) the real Chrome window to `url`. When `dir` is given, the
 * service first makes sure the project's dev server is running and answers a
 * failed start instead of opening a window on a dead page.
 */
export function openLive(url: string, dir?: string): Promise<OpenResult> {
  return callService<OpenResult>('/open', undefined, 'POST', JSON.stringify(dir ? { url, dir } : { url }));
}

/**
 * Close the live Chrome window and quit Chrome (Design Mode going OFF). The
 * service removes the throwaway profile, so a later `openLive` relaunches fresh.
 */
export function closeLive(): Promise<{ ok: boolean }> {
  return callService<{ ok: boolean }>('/close', undefined, 'POST');
}

/** What `POST /server/stop` answers: whether a recorded server was stopped. */
export type ServerStopResult = { ok: boolean; stopped?: boolean; error?: string };

/**
 * Stop the project's dev server. The service only kills a process group it
 * started for `dir`; an unknown dir is a safe no-op (`ok:true, stopped:false`).
 * This is the raw escape hatch — callers decide WHEN to call it (the smart stop
 * on Design Mode OFF, or the manual Stop preview action).
 */
export function stopDevServer(dir: string): Promise<ServerStopResult> {
  return callService<ServerStopResult>('/server/stop', undefined, 'POST', JSON.stringify({ dir }));
}

/** What `POST /server/start` answers: whether the dev server is up and who started it. */
export type ServerStartResult = { ok: boolean; started?: boolean; up?: boolean; error?: string };

/**
 * Start (or confirm) the dev server for `dir`. When `url` is omitted the
 * service reads the project's `.design-studio.json` url. The service only
 * attempts to start loopback addresses; a non-loopback url is a 400.
 */
export function startDevServer(dir: string, url?: string): Promise<ServerStartResult> {
  return callService<ServerStartResult>('/server/start', undefined, 'POST', JSON.stringify({ dir, url }));
}

/**
 * What `GET /server/status` answers: reachability, port and group leader.
 * `error` mirrors the service's own `DevServerStatus.error`: a condition the
 * service reports alongside the status (a recorded identity or port
 * conflict). When present the reachability bit must not be rendered as a
 * trustworthy green Start.
 */
export type ServerStatus = { up: boolean; port: number | null; pid?: number; error?: string };

/** The recorded dev-server status for a project dir (never starts one). */
export function getServerStatus(dir: string): Promise<ServerStatus> {
  return callService<ServerStatus>('/server/status', { dir });
}

/** Live window state: current page, pick mode, window open/closed. */
export function getState(): Promise<LiveState> {
  return callService<LiveState>('/state');
}

/**
 * Raise the live Chrome window (POST /focus) without navigating or reloading
 * it, so the user can see the page they are about to Cmd-click. Safe with no
 * window open.
 */
export function focusLive(): Promise<{ ok: boolean }> {
  return callService<{ ok: boolean }>('/focus', undefined, 'POST');
}

/**
 * Flash a picked element in the live preview window: `POST /highlight` with its
 * selector. The ~600 ms flash is done service-side, so hover is fire-and-forget
 * and a failure is never surfaced to the user. `Highlight in preview` uses the
 * same route.
 */
export function highlightElement(selector: string): Promise<{ ok: boolean }> {
  return callService<{ ok: boolean }>('/highlight', undefined, 'POST', JSON.stringify({ selector }));
}

export type StudioConfig = {
  version?: number;
  name?: string;
  type?: string;
  url?: string;
  command?: string;
  entry?: string;
  harness?: { direction?: string; fidelity?: string; critiquePolicy?: string; verify?: VerifyConfig };
  pick?: Record<string, unknown>;
};

/** The project's `.design-studio.json`, resolved by the service in a fixed order. */
export function getConfig(dir: string): Promise<{ config: StudioConfig | null; path: string | null }> {
  return callService('/config', { dir });
}

/** Validate an explicitly pasted file path without uploading its contents. */
export function validateReferencePath(dir: string, path: string): Promise<{ path: string; sourceDirectory: string }> {
  return callService('/reference', undefined, 'POST', JSON.stringify({ dir, path }));
}

/** What `POST /harness` answers after writing/refreshing the in-session plugin. */
export type HarnessResult = {
  path: string;
  created: boolean;
  updated: boolean;
  changed: boolean;
};

/**
 * Ask the service to write the project-local OpenCode v2 plugin that runs the
 * Design Studio harness (craft rules + verification mandate) inside agent
 * sessions. Called when Design Mode turns ON for a ready project. Best-effort
 * from the caller: a design session still works without it.
 */
export function ensureHarness(dir: string): Promise<HarnessResult> {
  return callService<HarnessResult>('/harness', undefined, 'POST', JSON.stringify({ dir }));
}

/** Recognize legacy moved sessions so their existing targets remain usable. */
export function isDesignWorkspaceDir(dir: string | null | undefined): boolean {
  return /(^|[\\/])designs([\\/]|$)/.test(String(dir ?? ''));
}

// ---- scaffolding (immediate project initialization) ----

/** What `POST /scaffold` is asked to build: the project dir plus the brief. */
export type ScaffoldSpec = {
  type: string;
  direction?: string;
  fidelity?: string;
  brief?: string;
  /**
   * The chosen design-system preset id (shared/design-systems.ts), when the user
   * picked one. The service lane reads it to seed the project's DESIGN.md /
   * tokens.css; omitted for "No design system".
   */
  designSystemId?: string;
};

/** What `POST /scaffold` answers: the served URL and the files it wrote, or an actionable error. */
export type ScaffoldResult =
  | { ok: true; url: string; files: string[] }
  | { ok: false; error: string };

/**
 * Scaffold the project at `dir` from the design spec (the service writes
 * `.design-studio.json` and the starter files). Called when a design flow starts
 * in a project that has no config yet. A non-200 answer throws `ServiceUnavailable`;
 * a business failure comes back as `{ ok: false, error }`.
 */
export function scaffoldProject(dir: string, spec: ScaffoldSpec): Promise<ScaffoldResult> {
  return callService<ScaffoldResult>('/scaffold', undefined, 'POST', JSON.stringify({ dir, ...spec }));
}

// The service's `/files` route stays (tests/service coverage), but the panel no
// longer lists project files: the `+` references a file by DROP or a PASTED
// path, which needs no listing (see `fileReferenceChip` in mode.ts).

// ---- project list (pure) ----

/** One registered project as the wizard and the page render it. */
export type ProjectRow = {
  id: string;
  name: string;
  directory: string;
  /** Its readable `.design-studio.json`, or null when there is none / it failed. */
  config: StudioConfig | null;
  /** The service error when the config read failed, else null. Never hides the row. */
  configError: string | null;
};

/** The per-project outcome of reading its `.design-studio.json`. */
export type ProjectConfigRead = { config: StudioConfig | null; error: string | null };

/**
 * What the Projects list should show, derived purely from the workspace snapshot
 * and the per-project config reads. `loading` and `error` are the snapshot's own
 * states. A project is a DESIGN project only when it HAS a design file: a config
 * read that succeeded and found nothing (`config` null, no `error`) drops the
 * project. A read that FAILED keeps the row (config null + `configError`), so a
 * broken service never silently hides a project. The true empty state is thus a
 * ready snapshot whose projects all have no design file (or none at all).
 */
export type ProjectsView =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'empty' }
  | { kind: 'list'; rows: ProjectRow[] };

/** The snapshot a project list is built from. */
export type ProjectsSnapshot = Pick<GuestProjectsSnapshot, 'state' | 'projects'>;

/**
 * Map the host's projects snapshot and the per-project config reads onto what the
 * list renders. Pure, so the wizard and the page share one rule and a test can
 * pin every state. `configs` is keyed by project directory.
 */
export function projectRows(
  snapshot: ProjectsSnapshot,
  configs: Record<string, ProjectConfigRead> = {},
): ProjectsView {
  if (snapshot.state === 'loading') return { kind: 'loading' };
  if (snapshot.state === 'error') return { kind: 'error', message: 'Could not load projects.' };
  const rows: ProjectRow[] = [];
  for (const project of snapshot.projects) {
    const read = configs[project.directory];
    // A read that SUCCEEDED and found no config means this project has no design
    // file, so it is not a design project and drops out of the list. A read that
    // FAILED still keeps the row (configError), so a broken service cannot hide a
    // project. An unread project (no entry) is kept as well.
    if (read && read.config === null && !read.error) continue;
    rows.push({
      id: project.id,
      name: project.name,
      directory: project.directory,
      config: read?.config ?? null,
      configError: read?.error ?? null,
    });
  }
  if (rows.length === 0) return { kind: 'empty' };
  return { kind: 'list', rows };
}

// ---- design projects & design chats (pure) ----

/** The badge a design project row shows when its `.design-studio.json` is readable. */
export const DESIGN_READY_BADGE = 'Design ready';
/** The badge a project row shows when there is no usable `.design-studio.json` (or the read failed). */
export const NO_CONFIG_BADGE = 'No config yet';
/**
 * The merged list's true empty state: a ready project snapshot with no design
 * project AND no design chat. One line, since projects and chats share one list.
 */
export const NO_DESIGN_WORK_MESSAGE = 'No design work yet. Create one above.';
/**
 * The rail panel surface's whole content: a calm pointer to the sidebar page,
 * since the rail panel itself is intentionally empty. One line, no controls.
 */
export const PANEL_SIDEBAR_HINT = 'Design Studio opens from the sidebar.';

/**
 * The inverse of `modeStorageKey` (mode.ts): the session id a `mode/<id>` host
 * storage key refers to, or null for any other key. Kept DOM-free so the chats
 * list can parse the keys `host.storage.keys()` returns. A test pins it against
 * `modeStorageKey` so the `mode/` prefix cannot drift.
 */
export function modeSessionIdFromKey(key: string): string | null {
  const prefix = 'mode/';
  return key.startsWith(prefix) && key.length > prefix.length ? key.slice(prefix.length) : null;
}

/** The human label for a design chat row: the session title, else a short id. */
export function designChatLabel(session: { id: string; title?: string }): string {
  const title = session.title?.trim();
  return title ? title : session.id.slice(0, 8);
}

/**
 * The meta line under a project row: `<type> · <url>` for a readable config, the
 * configured type alone when the config has no url, and the directory otherwise.
 */
export function projectMeta(row: ProjectRow): string {
  if (!row.config) return row.directory;
  const type = row.config.type?.trim() || 'custom';
  const url = row.config.url?.trim();
  return url ? `${type} · ${url}` : type;
}

/**
 * The meta line under a design-chat row: `<type> · <url>` for the chat's OWN
 * readable config, the configured type alone when it has no url, and the chat's
 * own directory otherwise. Pure, so the row and a test share one rule.
 */
export function designChatMeta(row: DesignChatRow): string {
  if (!row.config) return row.directory || row.projectName;
  const type = row.config.type?.trim() || 'custom';
  const url = row.config.url?.trim();
  return url ? `${type} · ${url}` : type;
}

/** One registered project's sessions snapshot, as the design-chats list reads it. */
export type ProjectSessions = {
  projectId: string;
  projectName: string;
  snapshot: GuestSessionsSnapshot;
};

/** A design chat: a session whose per-session Design Mode is ON. */
export type DesignChatRow = {
  sessionId: string;
  projectId: string;
  projectName: string;
  title: string;
  /**
   * The session's OWN working directory (the `listSessions` record's
   * `directory`). For an isolated chat this is `<project>/designs/<slug>`, where
   * its own `.design-studio.json` lives — NOT the project root. The dev-server
   * and config actions resolve against this, not the project root.
   */
  directory: string;
  /** The chat directory's readable `.design-studio.json`, or null when there is none. */
  config?: StudioConfig | null;
  /** The service error when the chat directory's config read failed, else null. */
  configError?: string | null;
  /** The session's last-updated time; the merged list orders chats by it. */
  updatedAt: number;
};

/**
 * What the design-chats list should show, derived from each project's sessions
 * snapshot and the set of session ids whose Design Mode is ON. A project whose
 * snapshot failed is counted, never allowed to hide the rows the readable
 * projects contribute: the error state appears only when no row survives.
 * `loading` anywhere keeps the list loading; the true empty state is only for a
 * ready, non-empty set of projects with no ON session. Pure, so the page and a
 * test share one rule.
 */
export type DesignChatsView =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'empty' }
  | { kind: 'list'; rows: DesignChatRow[] };

/**
 * Every registered project a scan or a target resolution needs, from a workspace
 * snapshot. Chats are listed REGARDLESS of `.design-studio.json`: a project with
 * no config never hides the design sessions inside it, so this list is
 * deliberately NOT the config-filtered `projectRows`. The `directory` is what
 * target resolution matches the frame's current directory against. Pure.
 */
export type RegisteredProject = { id: string; name: string; directory: string };

export function allProjectsFromSnapshot(snapshot: ProjectsSnapshot): RegisteredProject[] {
  if (snapshot.state !== 'ready') return [];
  return snapshot.projects.map((project) => ({ id: project.id, name: project.name, directory: project.directory }));
}

// ---- the creation flow's target (pure) ----

/**
 * The actionable refusal when the current directory belongs to NO registered
 * project. The composer must not scaffold/start there: a session without a
 * registered `projectId` lands in the frame's own (unregistered) directory,
 * where the chats scan never looks — and scaffolding there once wrote a design
 * project into OpenChamber's own chats folder. Pure copy, shared with a test.
 */
export const NEEDS_PROJECT_MESSAGE =
  'Add this folder to OpenChamber as a project first — design sessions live in registered projects.';

/**
 * Where a creation flow targets. A `project` target is a REGISTERED project:
 * its directory, its registered id (sent as the session's `projectId`, so the
 * new chat lands where the chats scan can see it) and the config already read
 * for that directory (null when it has none, or the read failed). A
 * `needs-project` target means the current directory belongs to no registered
 * project: the composer refuses — it never scaffolds into an unregistered
 * directory.
 */
export type DesignTarget =
  | { kind: 'project'; dir: string; projectId: string; config: StudioConfig | null }
  | { kind: 'needs-project'; dir: string | null };

/**
 * Whether `dir` lies inside `root` (or IS it). A plain prefix match on the
 * absolute paths the host reports, separated by `/` — no normalization, no
 * case folding: both strings come from the same host.
 */
export function pathContains(root: string, dir: string): boolean {
  return dir === root || dir.startsWith(`${root}/`);
}

/**
 * Resolve what a creation flow targets. A project picked in the working-directory
 * selector wins. Otherwise the frame's current directory is matched against the
 * REGISTERED projects (`allProjectsFromSnapshot`, not the config-filtered rows):
 * the exact directory first, else the deepest registered project that contains
 * it. Nothing matching is a `needs-project` target, which the composer refuses
 * on. Pure, so the page and a test share one rule.
 */
export function resolveDesignTarget(input: {
  directory: string | null;
  selectedProjectId: string | null;
  projects: RegisteredProject[];
  rows: ProjectRow[];
}): DesignTarget {
  const picked = input.selectedProjectId
    ? input.projects.find((project) => project.id === input.selectedProjectId)
    : undefined;
  if (picked) return projectTarget(picked, input.rows);
  if (input.directory) {
    const exact = input.projects.find((project) => project.directory === input.directory);
    if (exact) return projectTarget(exact, input.rows);
    let containing: RegisteredProject | undefined;
    for (const project of input.projects) {
      // The DEEPEST containing project wins when registered projects nest.
      if (pathContains(project.directory, input.directory) && (!containing || project.directory.length > containing.directory.length)) {
        containing = project;
      }
    }
    if (containing) {
      // An isolated per-chat workspace (`<project>/designs/<slug>`) is its OWN
      // design target: the chat's `.design-studio.json` lives IN it, not at the
      // project root, so the scaffold/open actions must resolve against this
      // directory while the containing project still supplies the registered id.
      if (isDesignWorkspaceDir(input.directory)) {
        return { kind: 'project', dir: input.directory, projectId: containing.id, config: configForDir(input.rows, input.directory) };
      }
      return projectTarget(containing, input.rows);
    }
  }
  return { kind: 'needs-project', dir: input.directory };
}

function projectTarget(project: RegisteredProject, rows: ProjectRow[]): DesignTarget {
  const row = rows.find((candidate) => candidate.directory === project.directory);
  return { kind: 'project', dir: project.directory, projectId: project.id, config: row?.config ?? null };
}

/** The readable config a row recorded for `dir`, or null when none row matches. */
function configForDir(rows: ProjectRow[], dir: string): StudioConfig | null {
  return rows.find((row) => row.directory === dir)?.config ?? null;
}

/**
 * Whether a single attached item's `data` is this package's Design Mode chip.
 * `buildModeChip` (mode.ts) writes `data.mode = { on: true, … }`, and the
 * session record echoes every attached chip's `data` back to us (SDK
 * `GuestSessionRecord.items[].data`). Kept loose on purpose: only `mode.on` is
 * load-bearing, so any other mode fields can change without breaking detection.
 */
export function isModeChipData(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const mode = (data as { mode?: unknown }).mode;
  return Boolean(mode && typeof mode === 'object' && (mode as { on?: unknown }).on === true);
}

/**
 * Whether a session snapshot itself shows Design Mode was ON: at least one of
 * its attached items carries our mode chip. This is the PRIMARY signal — it
 * survives on any machine, since the chip is part of the session, while our own
 * `mode/<id>` storage key is per-device and only a fallback.
 */
export function sessionShowsDesignMode(session: Pick<GuestSessionRecord, 'items'>): boolean {
  return Array.isArray(session.items) && session.items.some((item) => isModeChipData(item.data));
}

/**
 * Whether a session is a design chat. Four signals, any one is enough:
 *  · the snapshot shows our mode chip (`sessionShowsDesignMode`), the cross-device one;
 *  · the live `mode/<id>` key says ON (`onSessionIds`), the per-device fallback;
 *  · the persistent `design/<id>` marker exists (`markerSessionIds`), which survives
 *    the mode being switched off, so a finished design chat stays listed;
 *  · a `mode/<id>` key merely EXISTS (`modeKeySessionIds`, regardless of its `on`
 *    value), which is written the first time Design Mode is used and covers a
 *    history that predates the marker, so an older design chat is still listed.
 * Pure, so the page and a test share one rule.
 */
export function isDesignSession(
  session: Pick<GuestSessionRecord, 'id' | 'items'>,
  onSessionIds: ReadonlySet<string>,
  markerSessionIds?: ReadonlySet<string>,
  modeKeySessionIds?: ReadonlySet<string>,
): boolean {
  return (
    sessionShowsDesignMode(session) ||
    onSessionIds.has(session.id) ||
    Boolean(markerSessionIds?.has(session.id)) ||
    Boolean(modeKeySessionIds?.has(session.id))
  );
}

export function designChatRows(
  listings: ProjectSessions[],
  onSessionIds: ReadonlySet<string>,
  markerSessionIds?: ReadonlySet<string>,
  modeKeySessionIds?: ReadonlySet<string>,
): DesignChatsView {
  if (listings.length === 0) return { kind: 'empty' };
  const failed: string[] = [];
  const rows: DesignChatRow[] = [];
  let loading = false;
  for (const listing of listings) {
    if (listing.snapshot.state === 'error') {
      failed.push(listing.projectName);
      continue;
    }
    if (listing.snapshot.state === 'loading') {
      loading = true;
      continue;
    }
    for (const session of listing.snapshot.sessions) {
      if (session.archivedAt) continue;
      if (!isDesignSession(session, onSessionIds, markerSessionIds, modeKeySessionIds)) continue;
      rows.push({
        sessionId: session.id,
        projectId: listing.projectId,
        projectName: listing.projectName,
        title: designChatLabel(session),
        // The chat resolves its config from its OWN directory, so an isolated
        // `designs/<slug>` chat still reads as a design chat with its config.
        directory: session.directory ?? '',
        config: null,
        configError: null,
        updatedAt: session.updatedAt,
      });
    }
  }
  if (loading) return { kind: 'loading' };
  if (rows.length === 0 && failed.length > 0) {
    return { kind: 'error', message: `Could not load design chats for ${failed.join(', ')}.` };
  }
  if (rows.length === 0) return { kind: 'empty' };
  return { kind: 'list', rows };
}

// ---- the merged design-work list (pure) ----

/**
 * One row of the merged list below the composer: a registered design project or
 * a design chat (a session whose Design Mode is ON). The `kind` marker is what
 * lets the renderer give each its own leading type icon and action while the
 * list itself stays one list.
 */
export type DesignWorkRow =
  | { kind: 'project'; project: ProjectRow }
  | { kind: 'chat'; chat: DesignChatRow };

/**
 * What the single merged list should show. Same snapshot states as its two
 * sources, collapsed to one: `loading` while either source is loading, `error`
 * when a source failed (the project snapshot's message first, then the chats'),
 * `empty` only when both are ready with nothing to show, and otherwise `list`.
 */
export type DesignWorkView =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'empty' }
  | { kind: 'list'; rows: DesignWorkRow[] };

/**
 * Merge the projects view and the design-chats view into one ordered list.
 * Ordering is predictable and stable: every PROJECT first, in the order the
 * workspace reports it; then every CHAT, most recently updated first. Projects
 * lead because a project is the durable thing the user made, while a chat is a
 * working session on it. No filters, no tabs — the two sources simply share one
 * array, each row tagged with its `kind`.
 */
/**
 * Options for `designWorkRows`.
 */
export type DesignWorkOptions = {
  /**
   * Project ids whose chats are omitted from the merged list: the project row
   * already reaches its sessions through "Open sessions", so repeating each of
   * its chats as a top-level row duplicates the project. Chats of projects NOT
   * in this set stay — a config-less/legacy project drops out of the project
   * rows but must keep its chats visible. Omitted only in the unfiltered view:
   * the "Open sessions" filter needs those rows (see `renderDesignSection`).
   */
  omitChatProjectIds?: ReadonlySet<string>;
};

export function designWorkRows(
  projects: ProjectsView,
  chats: DesignChatsView,
  options: DesignWorkOptions = {},
): DesignWorkView {
  if (projects.kind === 'loading' || chats.kind === 'loading') return { kind: 'loading' };
  if (projects.kind === 'error') return { kind: 'error', message: projects.message };
  if (chats.kind === 'error') return { kind: 'error', message: chats.message };
  const omit = options.omitChatProjectIds ?? null;
  const rows: DesignWorkRow[] = [];
  if (projects.kind === 'list') for (const project of projects.rows) rows.push({ kind: 'project', project });
  if (chats.kind === 'list') {
    const ordered = [...chats.rows].sort((a, b) => b.updatedAt - a.updatedAt);
    for (const chat of ordered) {
      // Exact-id match only: a missing ('') or foreign projectId never collides
      // with a listed project id.
      if (omit?.has(chat.projectId)) continue;
      rows.push({ kind: 'chat', chat });
    }
  }
  if (rows.length === 0) return { kind: 'empty' };
  return { kind: 'list', rows };
}

// ---- pure helpers (kept DOM-free so they can be unit-tested) ----

/**
 * The status row's compact pick gesture hint. A reference is added by holding
 * Cmd (macOS) or Ctrl and clicking an element in the live window — there is no
 * pick-mode toggle. One short line in the row.
 */
export const PICK_HINT = '⌘-click an element to add a reference';

/**
 * The hint is ACTIVE only while the live window is open; with no window there is
 * nothing to Cmd-click, so the status row shows it dimmed. Pure so the row and a
 * test share one rule.
 */
export function pickHintActive(state: Pick<LiveState, 'windowOpen'>): boolean {
  return state.windowOpen;
}

/**
 * One-line summary of the real window for the status row.
 */
export function formatWindowStatus(state: Pick<LiveState, 'windowOpen' | 'url' | 'title'>): string {
  if (!state.windowOpen) return 'Window closed';
  const where = state.url && state.url !== 'about:blank' ? state.url : 'no page open';
  return state.title ? `Window open · ${where} — ${state.title}` : `Window open · ${where}`;
}

/**
 * One line describing the outcome of an open, for the status row. A failed open
 * carries the service's actionable error rather than a dead window.
 */
export function formatOpenStatus(result: OpenResult): string {
  if (result.ok) return result.started ? 'Dev server started · window open' : 'Window open';
  return result.error ?? 'Could not open the window';
}

// ---- dev-server stop decision (pure) ----

/** The inputs to the smart-stop decision on Design Mode OFF. */
export type StopDevServerDecision = {
  /** The current session's live `SessionSnapshot.busy`. */
  busy: boolean;
  /** How many OTHER design sessions in the same project dir are not idle. */
  otherActiveDesignSessions: number;
  /** Whether THIS panel started the dev server (never stop one we did not). */
  startedByUs: boolean;
};

/**
 * Whether Design Mode OFF may stop the project's dev server. All three must
 * hold: we started it, our session is idle, and no other design session in the
 * same project dir is active. Pure, so the panel and a test share one rule.
 */
export function shouldStopDevServer(input: StopDevServerDecision): boolean {
  return input.startedByUs && !input.busy && input.otherActiveDesignSessions === 0;
}

/**
 * Count the design sessions OTHER than `currentSessionId` that are still active
 * (activity not `idle`) in one sessions snapshot. A session counts as a design
 * session when it carries our mode chip or a persistent design marker. Pure.
 */
export function countOtherActiveDesignSessions(
  sessions: ReadonlyArray<Pick<GuestSessionRecord, 'id' | 'items' | 'activity'>>,
  currentSessionId: string | null,
  markerSessionIds: ReadonlySet<string>,
): number {
  let count = 0;
  for (const session of sessions) {
    if (currentSessionId && session.id === currentSessionId) continue;
    const isDesign = markerSessionIds.has(session.id) || sessionShowsDesignMode(session);
    if (isDesign && session.activity !== 'idle') count += 1;
  }
  return count;
}

/**
 * The status section's one-line session line: whether THIS session is a design
 * session (Design Mode ON) and whether the project has a `.design-studio.json`
 * url. Pure, so the row and a test share one rule and one exact copy.
 */
export function designSessionStatus(state: { modeOn: boolean; configUrl: string | null }): string {
  if (!state.modeOn) return 'Design mode is off — start a design session to pick elements';
  const url = state.configUrl?.trim();
  return url
    ? `Design session · .design-studio.json found · ${url}`
    : 'Design session · no .design-studio.json url yet';
}

/** Actionable message when a project has no url to open. */
export const NO_PROJECT_URL_MESSAGE =
  'No .design-studio.json url for this project — add one, or turn the dev server on first';

/**
 * Why the `+` reference sources can be unavailable: every attach chip must carry
 * an http(s) url (a hard host rule), so a project with none has nothing to offer.
 * Shown both as the overlay's explanatory line and, when nothing is available,
 * as the reason the `+` is not shown at all. Pure copy, shared with a test.
 */
export const ATTACH_NEEDS_URL =
  'References need an http(s) url from .design-studio.json.';

/**
 * The one line the row shows when the project has no usable `.design-studio.json`.
 * This is the WHOLE section in that state: no toggle, no Focus, nothing clickable
 * (so it can never raise a "no url" error). Pure copy, shared with a test.
 */
export const NO_PROJECT_CONFIG_MESSAGE =
  "No .design-studio.json here — Design Studio isn't set up in this project.";

/**
 * Whether a project is "ready": it has a `.design-studio.json` whose `url` is a
 * non-empty string. The SINGLE source of truth for whether the row offers the
 * Design Mode toggle and Focus at all. Pure, so the row and a test share it.
 */
export function projectReady(config: StudioConfig | null | undefined): boolean {
  return Boolean(config?.url?.trim());
}

/**
 * Whether a URL points at a loopback host. The service starts a dev server for
 * loopback URLs only; a remote address is opened as-is, so we never hand the
 * service a dir alongside a non-loopback URL it would refuse.
 */
export function isLoopbackUrl(raw: string): boolean {
  try {
    const host = new URL(raw).hostname.toLowerCase().replace(/^\[|\]$/g, '');
    return host === 'localhost' || host === '::1' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
  } catch {
    return false;
  }
}

/**
 * What opening a project's live window should do: open `url` (with `dir` — the
 * project root the service starts a dev server from — only for a loopback URL),
 * or report an actionable message when the project has no url. Pure, so the
 * status row's Open action and Design Mode turning ON share one decision.
 */
export type ProjectOpenDecision =
  | { kind: 'open'; url: string; dir?: string }
  | { kind: 'message'; message: string };

export function decideProjectOpen(
  config: StudioConfig | null | undefined,
  projectDir: string | null | undefined,
): ProjectOpenDecision {
  const url = config?.url?.trim();
  if (!url) return { kind: 'message', message: NO_PROJECT_URL_MESSAGE };
  return projectDir && isLoopbackUrl(url) ? { kind: 'open', url, dir: projectDir } : { kind: 'open', url };
}

// The exact camelCase key set PICK_SCRIPT (service/browser.ts, `stylesFor`)
// emits — read those keys, not hyphenated CSS names, or the section is empty.
const PICK_STYLE_KEYS = [
  'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textAlign',
  'color', 'backgroundColor', 'borderTopWidth', 'borderStyle', 'borderColor', 'borderRadius',
  'padding', 'margin', 'display', 'gap', 'width', 'height',
];

/** `HH:MM:SS` in local time, for the chip's moment line. */
function localTimeOf(day: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${pad(day.getHours())}:${pad(day.getMinutes())}:${pad(day.getSeconds())}`;
}

/** The text of a picked element's chat reference chip. */
export function referenceText(pick: PickPayload, url: string, pickedAt?: Date): string {
  const styles = PICK_STYLE_KEYS
    .filter((key) => pick.styles[key] && pick.styles[key] !== 'normal' && pick.styles[key] !== 'none')
    .map((key) => `  ${key}: ${pick.styles[key]};`)
    .join('\n');
  return [
    'Reference from Design Studio',
    ...(pickedAt ? [`Picked at ${localTimeOf(pickedAt)}`] : []),
    `URL: ${url}`,
    `Selector: ${pick.selector}`,
    `Tag: ${pick.tag}${pick.classes ? `  Classes: ${pick.classes}` : ''}`,
    pick.text ? `Text: ${JSON.stringify(pick.text)}` : 'Text: (empty)',
    'Current styles:',
    styles || '  (none of note)',
    'Markup:',
    '```html',
    pick.outerHTML,
    '```',
  ].join('\n');
}

// ---- colour helpers (pure) ----

/** Parse `#rgb`, `#rrggbb` or `rgb()/rgba()` into 0–255 channels; null otherwise. */
function parseColor(value: string): [number, number, number] | null {
  const text = value.trim().toLowerCase();
  const hex = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hex) {
    let digits = hex[1]!;
    if (digits.length === 3) digits = digits.split('').map((c) => c + c).join('');
    return [parseInt(digits.slice(0, 2), 16), parseInt(digits.slice(2, 4), 16), parseInt(digits.slice(4, 6), 16)];
  }
  const rgb = text.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return null;
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (value: number): number => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * WCAG contrast ratio between two colours (1–21), rounded to one decimal, or
 * `null` when either colour is not a plain hex/rgb value (e.g. `oklch(...)` or a
 * `currentColor`). Pure, so the "Fix contrast" prompt and a test share one rule.
 */
export function contrastRatio(foreground: string, background: string): number | null {
  const fg = parseColor(foreground);
  const bg = parseColor(background);
  if (!fg || !bg) return null;
  const a = relativeLuminance(fg);
  const b = relativeLuminance(bg);
  const [hi, lo] = a >= b ? [a, b] : [b, a];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 10) / 10;
}

/**
 * The token a picked element's colour should come from. We can only guess from
 * the property that carries a hardcoded colour; `null` when there is none, so
 * the caller can fall back to a neutral name. Pure.
 */
export function tokenNameFor(styles: Record<string, string>): string | null {
  if (styles.backgroundColor) return '--color-surface';
  if (styles.color) return '--color-text';
  if (styles.borderColor) return '--color-border';
  return null;
}
