import { promises as fs, type Dirent } from 'node:fs';
import * as path from 'node:path';

export const SKIP_DIRS: ReadonlySet<string> = new Set([
  'node_modules',
  '.next',
  '.git',
  'dist',
  '.ai-app-auditor',
]);

export async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function* walkFiles(
  root: string,
  predicate: (entry: Dirent) => boolean,
  opts: { skipDirs?: ReadonlySet<string> } = {},
): AsyncGenerator<string> {
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (opts.skipDirs?.has(entry.name)) continue;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) yield* walkFiles(full, predicate, opts);
    else if (entry.isFile() && predicate(entry)) yield full;
  }
}
