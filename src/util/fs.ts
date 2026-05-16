import { promises as fs } from 'node:fs';

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
