// Panel configuration persisted with host.storage. Everything the harness can be
// tuned by lives here — no hardcoded defaults beyond these, which is exactly the
// trap OpenDesign fell into.
import { host } from './api.ts';

export type Device = 'desktop' | 'tablet' | 'mobile';
export type Fidelity = 'wireframe' | 'hi-fi' | 'interactive';
export type CritiquePolicy = 'required' | 'opt-in' | 'opt-out';

export type AppConfig = {
  /** Folder that holds design boards. */
  root: string;
  /** Canonical HTML entry, relative to the project. */
  entry: string;
  device: Device;
  /** 'auto' or a DirectionId from craft.ts (kept as a string to avoid a cycle). */
  direction: string;
  fidelity: Fidelity;
  critiquePolicy: CritiquePolicy;
  /** Brand contract the harness injects when present. */
  designMdPath: string;
  /** Token file the harness injects when present. */
  tokensPath: string;
};

export const DEFAULT_CONFIG: AppConfig = {
  root: 'design',
  entry: '',
  device: 'desktop',
  direction: 'auto',
  fidelity: 'hi-fi',
  critiquePolicy: 'required',
  designMdPath: 'design/DESIGN.md',
  tokensPath: 'design/tokens.css',
};

const CONFIG_KEY = 'config';

export async function loadConfig(): Promise<AppConfig> {
  try {
    const stored = (await host.storage.get(CONFIG_KEY)) as Partial<AppConfig> | undefined;
    if (stored && typeof stored === 'object') return { ...DEFAULT_CONFIG, ...stored };
  } catch {
    /* fall through to defaults */
  }
  return { ...DEFAULT_CONFIG };
}

export async function saveConfig(config: AppConfig): Promise<void> {
  try {
    await host.storage.set(CONFIG_KEY, config as unknown as Record<string, string>);
  } catch {
    /* storage is a convenience, not a requirement */
  }
}
