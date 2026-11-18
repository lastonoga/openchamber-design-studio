// Where the live view runs: Design Studio's own Chrome window ("own"), or the
// browser OpenChamber already gives the agent through `openchamber_web` ("host").
//
// Own mode needs a Chrome binary AND a screen to draw its window on. OpenChamber
// starts guest services with a whitelisted environment (PATH, HOME, TMPDIR,
// XDG_* and a few Windows variables; see `inheritedServiceEnv` in the host), so
// neither `DISPLAY`/`WAYLAND_DISPLAY` nor any `DS_*` override reaches the
// service there. Everything the service needs is therefore discovered on disk:
//
//   - the Chrome binary from the standard install locations per platform, or a
//     `chromePath` in the service config file;
//   - a Linux display from the X11 sockets in /tmp/.X11-unix or a Wayland socket
//     in XDG_RUNTIME_DIR, handed to Chrome explicitly;
//   - the mode from `browserMode` in the service config file.
//
// The config file is `config.json` in OPENCHAMBER_SERVICE_DATA_DIR (the folder
// the host keeps for this extension across restarts and updates). Environment
// variables still win when present, so tests and hand-started services keep
// working with DS_CHROME_PATH / DS_BROWSER_MODE.
//
// `auto` (the default) picks own mode when Chrome and a display are found and
// host mode otherwise, so a headless server never tries to spawn a window.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export type BrowserMode = 'own' | 'host';
export type RequestedBrowserMode = BrowserMode | 'auto';

export const BROWSER_MODES: readonly RequestedBrowserMode[] = ['auto', 'own', 'host'];
export const SERVICE_CONFIG_FILE = 'config.json';

/** What the service config file may hold. Unknown keys are ignored. */
export type ServiceConfig = {
  browserMode?: RequestedBrowserMode;
  chromePath?: string;
};

/** How Chrome must be started to reach a screen. */
export type DisplayInfo = {
  found: boolean;
  /** Variables to add to Chrome's environment (DISPLAY or WAYLAND_DISPLAY). */
  env: Record<string, string>;
  /** Extra Chrome flags (Wayland needs the Ozone platform set). */
  args: string[];
  /** Human-readable description, for /browser and error messages. */
  description: string;
};

export type BrowserSetup = {
  /** The mode in force. */
  mode: BrowserMode;
  /** What was asked for (config, env, or the `auto` default). */
  requested: RequestedBrowserMode;
  /** Why `mode` was chosen, in one sentence. */
  reason: string;
  /** The Chrome binary own mode launches, or null when none was found. */
  chromePath: string | null;
  /** Every location that was checked, in order, when none was set explicitly. */
  chromeCandidates: string[];
  display: DisplayInfo;
  /** Absolute path of the service config file (it may not exist). */
  configPath: string | null;
  /** Set when the config file exists but could not be read. */
  configError?: string;
};

/** Injectable filesystem/env view, so every decision here is testable. */
export type Probe = {
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  exists: (file: string) => boolean;
  list: (dir: string) => string[];
  read: (file: string) => string;
};

export const realProbe: Probe = {
  platform: process.platform,
  env: process.env,
  exists: (file) => existsSync(file),
  list: (dir) => {
    try {
      return readdirSync(dir);
    } catch {
      return [];
    }
  },
  read: (file) => readFileSync(file, 'utf8'),
};

/** Standard Chrome/Chromium install locations, most specific first. */
export function chromeCandidates(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string[] {
  if (platform === 'darwin') {
    const home = env.HOME;
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      ...(home ? [path.join(home, 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome')] : []),
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ];
  }
  if (platform === 'win32') {
    // PROGRAMFILES is not in the host's whitelist; SYSTEMDRIVE and LOCALAPPDATA are.
    const drive = env.SYSTEMDRIVE ?? 'C:';
    const local = env.LOCALAPPDATA;
    return [
      `${drive}\\Program Files\\Google\\Chrome\\Application\\chrome.exe`,
      `${drive}\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe`,
      ...(local ? [path.win32.join(local, 'Google\\Chrome\\Application\\chrome.exe')] : []),
    ];
  }
  return [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/opt/google/chrome/chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
    '/usr/local/bin/chromium',
  ];
}

/**
 * The Chrome binary to launch: an explicit path (env, then config) when given —
 * returned even if missing so the error names it — else the first standard
 * location that exists, else null.
 */
export function resolveChromePath(probe: Probe, configured?: string): { path: string | null; candidates: string[] } {
  const explicit = probe.env.DS_CHROME_PATH?.trim() || configured?.trim();
  if (explicit) return { path: explicit, candidates: [explicit] };
  const candidates = chromeCandidates(probe.platform, probe.env);
  return { path: candidates.find((candidate) => probe.exists(candidate)) ?? null, candidates };
}

/**
 * Whether Chrome can open a window, and how to point it at the screen. macOS and
 * Windows always have one for a logged-in user. Linux needs an X11 or Wayland
 * server; the host strips DISPLAY/WAYLAND_DISPLAY, so the sockets are looked up
 * on disk and passed to Chrome explicitly.
 */
export function detectDisplay(probe: Probe): DisplayInfo {
  if (probe.platform !== 'linux') {
    return { found: true, env: {}, args: [], description: `${probe.platform} desktop` };
  }
  const display = probe.env.DISPLAY?.trim();
  if (display) return { found: true, env: { DISPLAY: display }, args: [], description: `X11 display ${display}` };
  const wayland = probe.env.WAYLAND_DISPLAY?.trim();
  if (wayland) {
    return { found: true, env: { WAYLAND_DISPLAY: wayland }, args: ['--ozone-platform=wayland'], description: `Wayland display ${wayland}` };
  }
  const x11 = probe
    .list('/tmp/.X11-unix')
    .map((name) => /^X(\d+)$/.exec(name)?.[1])
    .filter((n): n is string => n !== undefined)
    .sort((a, b) => Number(a) - Number(b));
  if (x11.length > 0) {
    const value = `:${x11[0]}`;
    return { found: true, env: { DISPLAY: value }, args: [], description: `X11 display ${value}` };
  }
  const runtime = probe.env.XDG_RUNTIME_DIR;
  if (runtime) {
    const socket = probe
      .list(runtime)
      .filter((name) => /^wayland-\d+$/.test(name))
      .sort()[0];
    if (socket) {
      return { found: true, env: { WAYLAND_DISPLAY: socket }, args: ['--ozone-platform=wayland'], description: `Wayland display ${socket}` };
    }
  }
  return { found: false, env: {}, args: [], description: 'no X11 or Wayland display' };
}

function isRequestedMode(value: unknown): value is RequestedBrowserMode {
  return typeof value === 'string' && (BROWSER_MODES as readonly string[]).includes(value);
}

/** Read the service config file. A missing file is an empty config. */
export function readServiceConfig(probe: Probe, configPath: string | null): { config: ServiceConfig; error?: string } {
  if (!configPath || !probe.exists(configPath)) return { config: {} };
  try {
    const parsed = JSON.parse(probe.read(configPath)) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { config: {}, error: `${configPath} must hold a JSON object` };
    }
    const raw = parsed as Record<string, unknown>;
    const config: ServiceConfig = {};
    if (isRequestedMode(raw.browserMode)) config.browserMode = raw.browserMode;
    else if (raw.browserMode !== undefined) {
      return { config: {}, error: `browserMode in ${configPath} must be one of ${BROWSER_MODES.join(', ')}` };
    }
    if (typeof raw.chromePath === 'string' && raw.chromePath.trim() !== '') config.chromePath = raw.chromePath.trim();
    return { config };
  } catch (error) {
    return { config: {}, error: `could not read ${configPath}: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/** Decide the mode from what was asked for and what is installed. Pure. */
export function decideMode(
  requested: RequestedBrowserMode,
  chromePath: string | null,
  chromeExists: boolean,
  display: DisplayInfo,
): { mode: BrowserMode; reason: string } {
  if (requested === 'host') return { mode: 'host', reason: 'browserMode is set to "host".' };
  if (requested === 'own') return { mode: 'own', reason: 'browserMode is set to "own".' };
  if (!chromePath || !chromeExists) {
    return { mode: 'host', reason: 'Chrome or Chromium was not found on this machine, so the OpenChamber browser panel is used.' };
  }
  if (!display.found) {
    return { mode: 'host', reason: `Chrome was found but there is ${display.description} to open a window on, so the OpenChamber browser panel is used.` };
  }
  return { mode: 'own', reason: `Chrome was found at ${chromePath} and ${display.description} is available.` };
}

/** Resolve the full setup. `dataDir` is OPENCHAMBER_SERVICE_DATA_DIR. */
export function resolveBrowserSetup(probe: Probe, dataDir: string | undefined): BrowserSetup {
  const configPath = dataDir ? path.join(dataDir, SERVICE_CONFIG_FILE) : null;
  const { config, error } = readServiceConfig(probe, configPath);
  const envMode = probe.env.DS_BROWSER_MODE?.trim();
  const requested: RequestedBrowserMode = isRequestedMode(envMode) ? envMode : config.browserMode ?? 'auto';
  const chrome = resolveChromePath(probe, config.chromePath);
  const display = detectDisplay(probe);
  const chromeExists = chrome.path !== null && probe.exists(chrome.path);
  const decision = decideMode(requested, chrome.path, chromeExists, display);
  return {
    mode: decision.mode,
    requested,
    reason: decision.reason,
    chromePath: chrome.path,
    chromeCandidates: chrome.candidates,
    display,
    configPath,
    ...(error ? { configError: error } : {}),
  };
}

let cached: BrowserSetup | null = null;

/**
 * The setup for this service process. Resolved once; the config file is read at
 * startup, so a change takes effect when the extension restarts.
 */
export function browserSetup(): BrowserSetup {
  if (!cached) cached = resolveBrowserSetup(realProbe, process.env.OPENCHAMBER_SERVICE_DATA_DIR);
  return cached;
}

/** Test hook: forget the cached setup. */
export function resetBrowserSetup(): void {
  cached = null;
}

/** Thrown when a route needs Design Studio's own Chrome but host mode is on. */
export class HostModeError extends Error {
  constructor(feature: string) {
    super(
      `${feature} needs Design Studio's own Chrome window, which is not used here (host browser mode). ` +
        'Use the openchamber_web browser tool instead: in Settings → General → OpenChamber Tools → Browser provider, ' +
        'choose "OpenChamber Web" so the page opens in the OpenChamber browser panel.',
    );
    this.name = 'HostModeError';
  }
}

/** The message for a launch with no usable Chrome binary. */
export function chromeNotFoundMessage(setup: BrowserSetup): string {
  const where = setup.configPath ?? 'the service config file';
  if (setup.chromePath) {
    return `Chrome was not found at ${setup.chromePath}. Fix "chromePath" in ${where}, or set "browserMode": "host" to use the OpenChamber browser panel instead.`;
  }
  return (
    `Chrome or Chromium was not found (checked ${setup.chromeCandidates.join(', ')}). ` +
    `Install it, set "chromePath" in ${where}, or set "browserMode": "host" to use the OpenChamber browser panel instead.`
  );
}
