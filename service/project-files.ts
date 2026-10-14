// Project file listing.
//
// The panel iframe cannot touch the filesystem, so when the user wants to
// attach a FILE reference to a message it asks the service for the files under
// a project root and shows them in a picker. The listing is deliberately
// narrow: the source-shaped files a user is likely to attach, never the noise a
// dependency install or a build leaves behind, and never a path that escapes
// the project root through a symlink.
import { promises as fs, constants } from 'node:fs';
import path from 'node:path';

/**
 * Resolve only an explicitly pasted path, never a dropped File.name. Relative
 * paths are confined to the captured real source root; an absolute external
 * path is an explicit user selection. Inspect metadata/access, not file bytes.
 */
export async function resolveReferencePath(dir: string, input: string): Promise<{ path: string; sourceDirectory: string }> {
  const controls = /[\u0000-\u001f\u007f-\u009f]/;
  if (typeof dir !== 'string' || !path.isAbsolute(dir) || controls.test(dir)) {
    throw new Error('Source directory must be a valid absolute project path. Select a project and try again.');
  }
  if (typeof input !== 'string' || input.trim() === '') {
    throw new Error('Paste a non-empty accessible file path.');
  }
  if (controls.test(input)) {
    throw new Error('File paths cannot contain control characters. Paste a valid file path.');
  }
  let sourceDirectory: string;
  try {
    sourceDirectory = await fs.realpath(dir);
    if (!(await fs.stat(sourceDirectory)).isDirectory()) throw new Error('not a directory');
  } catch {
    throw new Error('Source project directory is not accessible. Select an accessible project and try again.');
  }
  const absolute = path.isAbsolute(input);
  const inside = (target: string): boolean => {
    const relative = path.relative(sourceDirectory, target);
    return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
  };
  const candidate = path.resolve(sourceDirectory, input);
  if (!absolute && !inside(candidate)) {
    throw new Error('Relative file path is outside the source project. Paste its absolute path to select an external file.');
  }
  let canonical: string;
  try {
    canonical = await fs.realpath(candidate);
  } catch {
    throw new Error('File not found or not accessible. Check the pasted path and its permissions.');
  }
  if (!absolute && !inside(canonical)) {
    throw new Error('Relative file path resolves outside the source project through a symlink. Paste its absolute path to select an external file.');
  }
  try {
    const stat = await fs.stat(canonical);
    if (!stat.isFile()) throw new Error('not a regular file');
  } catch (error) {
    if (error instanceof Error && error.message === 'not a regular file') {
      throw new Error('Reference must be a regular file, not a directory or special file. Paste a file path.');
    }
    throw new Error('File is not accessible. Check the pasted path and its permissions.');
  }
  try {
    await fs.access(canonical, constants.R_OK);
  } catch {
    throw new Error('File is not readable. Check its permissions or paste another file path.');
  }
  return { path: canonical, sourceDirectory };
}

/**
 * Directories that are never descended into, in addition to any dotted
 * directory. A dotted directory is tooling: `.git`, `.next`, `.cache`,
 * `.design-studio`, `.openchamber`, and the like. Dotted *files* are kept at
 * every level, since project config lives in files such as
 * `.design-studio.json`.
 */
export const SKIP_DIRS = new Set(['node_modules', 'dist', 'build']);

/** How many files a listing returns by default, and the hard ceiling. */
export const DEFAULT_FILE_LIMIT = 500;
export const MAX_FILE_LIMIT = 2000;

function shouldSkipDir(name: string): boolean {
  return name.startsWith('.') || SKIP_DIRS.has(name);
}

/** True when `target` is `root` or lies beneath it. Both are real paths. */
function isInside(root: string, target: string): boolean {
  return target === root || target.startsWith(root + path.sep);
}

/**
 * List the files under an absolute `dir`, recursively, as sorted POSIX paths
 * relative to `dir`. Directories are never returned. The walk skips
 * `node_modules`, `dist`, `build`, and any dotted directory (see `SKIP_DIRS`),
 * and it never follows a symlink whose real target lies outside `dir` or would
 * revisit a directory already walked. The result is capped at `limit` entries
 * (default 500, hard max 2000).
 *
 * Throws when `dir` is not absolute, when `limit` is not a positive integer, or
 * when `dir` itself cannot be read.
 */
export async function listProjectFiles(dir: string, limit?: number): Promise<string[]> {
  if (typeof dir !== 'string' || !path.isAbsolute(dir)) {
    throw new Error('dir must be an absolute path');
  }
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
    throw new Error('limit must be a positive integer');
  }
  const cap = Math.min(limit ?? DEFAULT_FILE_LIMIT, MAX_FILE_LIMIT);

  const rootAbs = path.resolve(dir);
  // Resolve a symlinked root itself (on macOS /tmp is a symlink to /private/tmp)
  // so the escape check compares against the real location.
  const rootReal = await fs.realpath(rootAbs);

  const found: string[] = [];
  const visitedDirs = new Set<string>([rootReal]);

  const walk = async (absDir: string): Promise<void> => {
    if (found.length >= cap) return;
    let entries;
    try {
      entries = await fs.readdir(absDir, { withFileTypes: true });
    } catch {
      return; // an unreadable subdirectory is skipped, never fatal
    }
    // Name order makes both the walk and the cap deterministic.
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    for (const entry of entries) {
      if (found.length >= cap) return;
      const abs = path.join(absDir, entry.name);

      if (entry.isSymbolicLink()) {
        // A symlink may point outside the project or form a cycle. Follow it
        // only when its real target stays inside the root and is a directory we
        // have not walked; otherwise ignore it entirely.
        let real: string;
        try {
          real = await fs.realpath(abs);
        } catch {
          continue;
        }
        if (!isInside(rootReal, real)) continue;
        let stat;
        try {
          stat = await fs.stat(real);
        } catch {
          continue;
        }
        if (stat.isDirectory()) {
          if (shouldSkipDir(entry.name) || visitedDirs.has(real)) continue;
          visitedDirs.add(real);
          await walk(abs);
        } else if (stat.isFile()) {
          found.push(path.relative(rootAbs, abs));
        }
        continue;
      }

      if (entry.isDirectory()) {
        if (shouldSkipDir(entry.name)) continue;
        await walk(abs);
      } else if (entry.isFile()) {
        found.push(path.relative(rootAbs, abs));
      }
    }
  };

  await walk(rootAbs);

  return found
    .map((rel) => rel.split(path.sep).join('/'))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .slice(0, cap);
}
