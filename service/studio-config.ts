// Per-project Design Studio configuration.
//
// The agent owns it: when it scaffolds a design project it writes one of these
// next to the code, so the extension can open the right URL with no setup from
// the user. The extension only reads it (and can edit it from the dock).
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { VerifyConfig } from '../shared/verify-types.ts';

/** Where a config may live, in resolution order. The first match wins. */
export const CONFIG_CANDIDATES = ['.design-studio.json', 'design-studio.json', 'design/.design-studio.json'];
export const DEFAULT_CONFIG_PATH = CONFIG_CANDIDATES[0]!;

export type StudioConfig = {
  version: number;
  name?: string;
  /** wireframe | hi-fi | prototype | deck | custom */
  type?: string;
  /** URL the extension opens automatically. */
  url?: string;
  /** Dev command, informational (the agent runs it). */
  command?: string;
  /** Static entry file for non-served types. */
  entry?: string;
  harness?: {
    direction?: string;
    fidelity?: string;
    critiquePolicy?: string;
    // Preset id from shared/design-systems.ts, when the project was scaffolded with one.
    designSystem?: string;
    verify?: VerifyConfig;
  };
  pick?: Record<string, unknown>;
};

async function isFile(abs: string): Promise<boolean> {
  try {
    return (await fs.stat(abs)).isFile();
  } catch {
    return false;
  }
}

export async function resolveConfigPath(root: string): Promise<string | null> {
  for (const rel of CONFIG_CANDIDATES) {
    const abs = path.join(root, rel);
    if (await isFile(abs)) return abs;
  }
  return null;
}

export async function readStudioConfig(root: string): Promise<{ config: StudioConfig | null; path: string | null }> {
  const abs = await resolveConfigPath(root);
  if (!abs) return { config: null, path: null };
  const rel = path.relative(root, abs);
  try {
    const parsed = JSON.parse(await fs.readFile(abs, 'utf8')) as unknown;
    return { config: parsed && typeof parsed === 'object' ? (parsed as StudioConfig) : null, path: rel };
  } catch {
    return { config: null, path: rel };
  }
}

/** Write the config text. Validates JSON and confines the path to the project. */
export async function writeStudioConfig(root: string, rel: string | null, text: string): Promise<{ path: string }> {
  const relPath = rel && rel.trim() ? rel.trim() : DEFAULT_CONFIG_PATH;
  const rootAbs = path.resolve(root);
  const abs = path.resolve(rootAbs, relPath);
  if (abs !== rootAbs && !abs.startsWith(rootAbs + path.sep)) throw new Error('path outside project');
  JSON.parse(text); // rejects invalid JSON before touching disk
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, text, 'utf8');
  return { path: relPath };
}
