// Design Mode: the switch that turns a chat session into a design session.
//
// It lives in three native hooks, because a guest cannot re-skin the host chat:
//  · `/design [on|off|<type>] [brief…]` — a slash command resolved by the panel;
//    toggling returns a context chip on the composer (the "design system is on"
//    signal the model sees when the user sends).
//  · a Work Status section (surface "status") rendered inside the chat — the
//    visible "the chat changed" part: the micro-brief widget. A guest cannot
//    inject chat messages, so the widget configures the session and fills the
//    composer with the first message.
//  · per-session mode persisted in host storage, keyed by session id. Starting
//    a design session seeds it, so the new session opens with the widget ON.
import type { AttachIssueRequest } from '@openchamber/sdk';
import { DIRECTIONS, type DirectionId } from './craft.ts';
import { VERIFY_PROTOCOL } from '../shared/harness-text.ts';
import { DESIGN_SYSTEMS, type DesignSystemPreset } from '../shared/design-systems.ts';
import type { StudioConfig } from './api.ts';

export { VERIFY_PROTOCOL };

export type DesignType = 'wireframe' | 'hi-fi' | 'prototype' | 'deck' | 'custom';

export const DESIGN_TYPES: DesignType[] = ['wireframe', 'hi-fi', 'prototype', 'deck', 'custom'];

export const TYPE_HINT: Record<DesignType, string> = {
  wireframe: 'structure and navigation only — no final colour, type or copy',
  'hi-fi': 'static screens with the full design system (tokens, type, colour)',
  prototype: 'a real, interactive app with a dev server, all five states and motion',
  deck: 'a presentation deck (HTML slides) with its own nav and print layout',
  custom: 'ask what is being made, then choose the closest approach',
};

export type Fidelity = 'wireframe' | 'hi-fi' | 'interactive';

export const FIDELITIES: Fidelity[] = ['wireframe', 'hi-fi', 'interactive'];

export const FIDELITY_HINT: Record<Fidelity, string> = {
  wireframe: 'low fidelity: boxes, flows and labels, no polish',
  'hi-fi': 'final visual quality: tokens, type, colour, spacing',
  interactive: 'hi-fi plus working interactions and transitions',
};

/** Select options shared by the wizard and the in-chat widget. English only. */
export const TYPE_OPTIONS: Array<[DesignType, string]> = [
  ['wireframe', 'Wireframe'],
  ['hi-fi', 'Hi-fi screens'],
  ['prototype', 'Interactive prototype'],
  ['deck', 'Presentation deck'],
  ['custom', 'Custom'],
];

export const FIDELITY_OPTIONS: Array<[Fidelity, string]> = [
  ['hi-fi', 'Hi-fi'],
  ['wireframe', 'Wireframe'],
  ['interactive', 'Interactive'],
];

// ---- design-system presets (pure: the picker's list, filter and swatch rules) ----

/**
 * The composer control's label when no preset is chosen. It is also the first
 * entry of the picker list, so the default and the "clear" outcome read the same.
 */
export const NO_DESIGN_SYSTEM = 'No design system';

/** The preset with this id, or null for null/undefined/unknown ids. */
export function findDesignSystem(id: string | null | undefined): DesignSystemPreset | null {
  if (!id) return null;
  return DESIGN_SYSTEMS.find((preset) => preset.id === id) ?? null;
}

/** The composer control's label for a chosen id: the preset name, else "No design system". */
export function designSystemLabel(id: string | null | undefined): string {
  return findDesignSystem(id)?.name ?? NO_DESIGN_SYSTEM;
}

/**
 * Case-insensitive filter over a preset's name, category and description. An
 * empty (or whitespace) query keeps every preset; the order is the catalog order.
 */
export function filterDesignSystems(query: string, presets: DesignSystemPreset[] = DESIGN_SYSTEMS): DesignSystemPreset[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return presets.slice();
  return presets.filter(
    (preset) =>
      preset.name.toLowerCase().includes(needle) ||
      preset.category.toLowerCase().includes(needle) ||
      preset.description.toLowerCase().includes(needle),
  );
}

/**
 * Group presets by their category for the list, preserving first-seen order so
 * the grouping stays stable as the filter narrows. One label per group.
 */
export function designSystemGroups(presets: DesignSystemPreset[]): Array<{ category: string; presets: DesignSystemPreset[] }> {
  const order: string[] = [];
  const groups = new Map<string, DesignSystemPreset[]>();
  for (const preset of presets) {
    let bucket = groups.get(preset.category);
    if (!bucket) {
      bucket = [];
      groups.set(preset.category, bucket);
      order.push(preset.category);
    }
    bucket.push(preset);
  }
  return order.map((category) => ({ category, presets: groups.get(category)! }));
}

/**
 * The token order the swatch strip prefers: the colour roles a designer reads
 * first (canvas, accent, text, borders, feedback), before any extra colours.
 */
const SWATCH_TOKEN_ORDER = [
  '--bg', '--surface', '--surface-warm', '--accent', '--accent-hover', '--accent-active',
  '--fg', '--muted', '--border', '--success', '--warn', '--danger',
];

/**
 * Whether a token value can be painted as a swatch on its own: a literal colour,
 * not a `var(...)` indirection or a `color-mix(...)` that only resolves inside
 * the preset. Keeps the strip honest — an unresolvable token is left out.
 */
export function isColorTokenValue(value: string): boolean {
  const text = value.trim().toLowerCase();
  return (
    /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(text) ||
    /^(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch)\(/.test(text)
  );
}

/**
 * A few colour swatches from a preset's tokens, in a deliberate order and capped
 * so the strip stays a glance. The swatch takes the token colour; the strip's own
 * container stays OpenChamber.
 */
export function designSystemSwatches(preset: DesignSystemPreset, max = 8): Array<{ name: string; value: string }> {
  const preferred = SWATCH_TOKEN_ORDER.filter((name) => isColorTokenValue(preset.tokens[name] ?? ''));
  const extras = Object.keys(preset.tokens).filter(
    (name) => !SWATCH_TOKEN_ORDER.includes(name) && isColorTokenValue(preset.tokens[name]!),
  );
  return [...preferred, ...extras].slice(0, max).map((name) => ({ name, value: preset.tokens[name]! }));
}

export type DesignMode = {
  on: boolean;
  type: DesignType;
  direction: 'auto' | DirectionId;
  fidelity: Fidelity;
  brief: string;
};

export const DEFAULT_MODE: DesignMode = { on: false, type: 'hi-fi', direction: 'auto', fidelity: 'hi-fi', brief: '' };

export type ParsedDesignArgs = {
  on: boolean;
  type: DesignType | null;
  brief: string;
};

/**
 * `/design [args]`:
 *   ""          → on, keep the current type
 *   "off"       → off
 *   "on …"      → on, keep the current type
 *   "<type> …"  → on with that type
 *   anything else → on, current type, whole text is the brief
 */
export function parseDesignArgs(raw: string): ParsedDesignArgs {
  const text = raw.trim();
  const [first = '', ...rest] = text.split(/\s+/);
  const brief = rest.join(' ');
  if (/^off$/i.test(first)) return { on: false, type: null, brief };
  if (first === '' || /^on$/i.test(first)) return { on: true, type: null, brief };
  const type = DESIGN_TYPES.find((candidate) => candidate === first.toLowerCase());
  if (type) return { on: true, type, brief };
  return { on: true, type: null, brief: text };
}

export function modeStorageKey(sessionId: string | null): string | null {
  return sessionId ? `mode/${sessionId}` : null;
}

// ---- the persistent design marker ----
//
// The `mode/<id>` key says whether Design Mode is ON *right now*; turning the
// mode off overwrites it with `{on:false}`, so "Your design work" forgets a
// chat the moment its window closes. This marker is the opposite: written once
// when Design Mode turns ON for a session and NEVER cleared, so a chat stays a
// design chat for good. It is per-device, like the mode key, so it is only one
// of the three signals `isDesignSession` reads (the session's own mode chip is
// the cross-device one).

/** The host storage key holding a session's permanent design marker, or null. */
export function designMarkerKey(sessionId: string | null): string | null {
  return sessionId ? `design/${sessionId}` : null;
}

/** The marker payload: `on` is the load-bearing bit; `at` records the ON moment. */
export function designMarkerValue(at: Date = new Date()): { on: true; at: string } {
  return { on: true, at: at.toISOString() };
}

/**
 * Whether a stored value is our persistent design marker. Reads `on` loosely, so
 * any extra fields (like `at`) never invalidate it. Pure.
 */
export function isDesignMarker(value: unknown): boolean {
  return Boolean(value && typeof value === 'object' && (value as { on?: unknown }).on === true);
}

/**
 * The inverse of `designMarkerKey`: the session id a `design/<id>` host storage
 * key refers to, or null for any other key. DOM-free, so the chats scan can
 * parse the keys `host.storage.keys()` returns. A test pins it against
 * `designMarkerKey` so the `design/` prefix cannot drift.
 */
export function designSessionIdFromKey(key: string): string | null {
  const prefix = 'design/';
  return key.startsWith(prefix) && key.length > prefix.length ? key.slice(prefix.length) : null;
}

/**
 * Every `attach` / `start-session` payload must carry an http(s) URL — the host
 * rejects anything else with "URL must be http or https.". The design session
 * has no real page yet, so fall back to a placeholder that the chips can show.
 */
export const PLACEHOLDER_URL = 'https://design.local/session';

export function isHttpUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** A URL safe to send to the host: the project's when valid, a placeholder otherwise. */
export function attachUrl(value: string | undefined): string {
  return isHttpUrl(value) ? (value as string) : PLACEHOLDER_URL;
}

/** `foo/bar/baz` → `baz`; tolerates trailing separators and backslashes. */
export function fileBaseName(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '');
  return trimmed.split(/[\\/]/).pop() || path;
}

/**
 * The project's own http(s) url from `.design-studio.json`, or null. Every
 * `attach` chip must carry an http(s) url (a hard host rule), so this is the
 * single gate the composer's `+` sources consult. Pure.
 */
export function projectHttpUrl(config: StudioConfig | null | undefined): string | null {
  const url = config?.url?.trim();
  return isHttpUrl(url) ? (url as string) : null;
}

/**
 * Whether the `+` attach control can offer anything at all: a source is attachable
 * only when the project has an http(s) url, so with none there is no `+` to show
 * (never a `+` that does nothing). Pure, shared with the composer and a test.
 */
export function attachAvailable(config: StudioConfig | null | undefined): boolean {
  return projectHttpUrl(config) !== null;
}

/**
 * The chat chip for a project reference. `url` must already be http(s) — callers
 * gate on `projectHttpUrl`. The id is the registered project id when there is one,
 * else the directory's basename, so a second reference replaces the first.
 */
export function projectReferenceChip(input: { projectId?: string | null; dir: string; name: string; url: string }): AttachIssueRequest {
  const handle = input.projectId?.trim() || fileBaseName(input.dir);
  return {
    providerId: 'design-studio',
    id: `project-${handle}`.slice(0, 110),
    title: input.name,
    url: input.url,
    text: `Project reference: ${input.dir}`,
  };
}

/**
 * The chat chip for a FILE reference, built from a PATH the user gave — a file
 * dropped onto the page (its `File.name`, the only thing a dropped file carries
 * into the guest frame) or a path pasted into the `+` panel. The file's own url
 * is the PROJECT's url (files have none of their own), the id and title are the
 * basename, so the same file replaces its own chip instead of stacking. Nothing
 * is uploaded — a reference the agent reads from the project, never the file
 * itself. `url` must be http(s).
 */
export function fileReferenceChip(input: { path: string; url: string; dropped?: boolean }): AttachIssueRequest {
  const base = fileBaseName(input.path);
  return {
    providerId: 'design-studio',
    id: `file-${base}`.slice(0, 128),
    title: base,
    url: input.url,
    text: input.dropped
      ? `File reference: ${base} (dropped into Design Studio)`
      : `File reference: ${input.path}`,
  };
}

/**
 * The next index when an arrow key walks a popover's list, wrapping at both ends.
 * A `current` of -1 (nothing focused yet) enters the list from the matching end.
 * Pure, so the one keyboard contract both pickers share is unit-testable without
 * a DOM.
 */
export function popoverStep(current: number, count: number, delta: number): number {
  if (count <= 0) return -1;
  if (current < 0) return delta > 0 ? 0 : count - 1;
  return (current + delta + count) % count;
}

/** Storage payload for a design session that was started with the mode ON. */
export function seedModeValue(type: DesignType, brief: string): Pick<DesignMode, 'on' | 'type' | 'brief'> {
  return { on: true, type, brief: brief.slice(0, 2000) };
}

/**
 * The `data` payload a page-started design session carries on its `startSession`
 * request, shaped exactly like the mode chip's `data` (`buildModeChip`): the
 * session record echoes it back as `items[].data`, where `isModeChipData` reads
 * `data.mode.on` — so a session started from the page is a design chat even when
 * the post-session storage writes lose the race against the frame teardown.
 */
export function seedSessionData(type: DesignType, brief: string): { mode: Pick<DesignMode, 'on' | 'type' | 'brief'> } {
  return { mode: seedModeValue(type, brief) };
}

/** Map a `.design-studio.json` `type` onto a valid DesignType for the widget. */
export function seedModeFromConfig(config: StudioConfig | null): { on: true; type: DesignType } {
  const type = config && DESIGN_TYPES.includes(config.type as DesignType) ? (config.type as DesignType) : 'custom';
  return { on: true, type };
}

export function directionLabel(value: 'auto' | DirectionId): string {
  return value === 'auto' ? 'Auto (infer from the brief)' : DIRECTIONS[value].name;
}

export type DesignBriefSpec = {
  type: DesignType;
  direction: 'auto' | DirectionId;
  fidelity: Fidelity;
  brief: string;
  /**
   * The chosen design-system preset id (see shared/design-systems.ts), or null /
   * omitted for "No design system". Names the system in the prompt and travels
   * into `/scaffold`.
   */
  designSystemId?: string | null;
};

/**
 * The bounded verification-loop contract, appended to every prompt that asks
 * the agent to build or edit. Now defined in `shared/harness-text.ts` (the single
 * source of truth shared with the service) and re-exported here for the panel.
 */

/**
 * The session's first message: what we are making and under which rules.
 * With a `.design-studio.json` the project already exists — open and edit it.
 * Without one, the agent scaffolds the project and writes the config itself.
 */
export function designSessionPrompt(spec: DesignBriefSpec, config: StudioConfig | null): string {
  const brief = spec.brief.trim();
  const preset = findDesignSystem(spec.designSystemId);
  const lines: string[] = [
    `Design brief — ${spec.type}: ${TYPE_HINT[spec.type]}`,
    `Visual direction: ${directionLabel(spec.direction)}. Lock it before building.`,
    `Fidelity: ${spec.fidelity} — ${FIDELITY_HINT[spec.fidelity]}.`,
    brief ? `Brief: ${brief}` : 'Brief: none given — ask at most 5 questions with sensible defaults, then proceed.',
  ];
  if (preset) {
    lines.push(
      `Design system: ${preset.name} (${preset.category}) — its tokens and DESIGN.md are authoritative; use them as given and keep every screen inside the system.`,
    );
  }
  lines.push('');
  if (config) {
    lines.push(
      `Project: ${config.name ?? '(unnamed)'}${config.url ? ` at ${config.url}` : ''}.`,
      config.url ? 'Open it in the Design Studio browser before anything else.' : 'Open the project in the Design Studio browser before anything else.',
      'Design system: the project\'s DESIGN.md / tokens.css are authoritative; keep every screen inside them.',
    );
  } else {
    lines.push(
      'No .design-studio.json yet — create the project and its design system as part of this first build:',
      '1. Scaffold the project for this type: create the files and scripts it needs (for prototype/interactive, a real app with a dev server; for a deck, HTML slides).',
      '2. Write `.design-studio.json` at the project root: { "version": 1, "name": "...", "type": "...", "url": "<the URL it will be served on>", "command": "<dev command>", "harness": { "direction": "...", "fidelity": "..." } }.',
      '3. Install dependencies and start it BOUND TO ALL INTERFACES (for Vite: `vite --host`), then report the URL. The in-app headless browser resolves localhost to IPv4, so an IPv6-only server shows "This site can\'t be reached".',
      'Keep every screen inside DESIGN.md / tokens.css once created.',
    );
  }
  lines.push(
    'Workflow: the user points at elements in the live browser; each click arrives as a reference chip. Apply what it asks for and keep the system consistent.',
    '',
    VERIFY_PROTOCOL,
  );
  return lines.join('\n');
}

/** The chip the composer shows while Design Mode is on. Same id → replaces itself. */
export function buildModeChip(sessionId: string | null, mode: DesignMode, config: StudioConfig | null): AttachIssueRequest {
  const id = `design-mode-${(sessionId || 'adhoc').slice(0, 110)}`;
  const lines = [
    'Design Mode: ON',
    `Artifact type: ${mode.type} — ${TYPE_HINT[mode.type]}`,
    `Visual direction: ${directionLabel(mode.direction)} · Fidelity: ${mode.fidelity}`,
    mode.brief ? `Brief: ${mode.brief}` : 'Brief: the user will say or type it next.',
    config
      ? `Project: ${config.name ?? '(unnamed)'}${config.url ? ` · ${config.url}` : ''} · configured type: ${config.type ?? mode.type}`
      : 'Project: no .design-studio.json yet — scaffold the project and write one.',
    'Design system: DESIGN.md and tokens.css are authoritative when present; keep every screen inside them.',
    'Workflow: the user clicks elements in the live browser; each click arrives as a reference chip. Apply the change they ask for and keep the system consistent.',
    VERIFY_PROTOCOL,
  ];
  return {
    providerId: 'design-studio',
    id,
    title: `Design Mode · ${mode.type}`,
    url: attachUrl(config?.url),
    text: lines.join('\n').slice(0, 16000),
    data: {
      mode: { on: true, type: mode.type, direction: mode.direction, fidelity: mode.fidelity, brief: mode.brief.slice(0, 2000) },
      project: config ? { name: config.name ?? null, type: config.type ?? null, url: config.url ?? null } : null,
    },
  };
}
