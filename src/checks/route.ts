import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { Check, Finding } from '../types.js';
import { exists } from '../util/fs.js';

async function* walkPages(repoPath: string): AsyncGenerator<string> {
  const appDir = path.join(repoPath, 'app');
  if (!(await exists(appDir))) return;
  async function* recur(dir: string): AsyncGenerator<string> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) yield* recur(full);
      else if (e.isFile() && (e.name === 'page.ts' || e.name === 'page.tsx')) yield full;
    }
  }
  yield* recur(appDir);
}

async function readMiddleware(repoPath: string): Promise<string | null> {
  for (const name of ['middleware.ts', 'middleware.js']) {
    const p = path.join(repoPath, name);
    if (await exists(p)) return fs.readFile(p, 'utf8');
  }
  return null;
}

export const routeCheck: Check = async (ctx) => {
  const findings: Finding[] = [];

  const pages: string[] = [];
  for await (const f of walkPages(ctx.repoPath)) pages.push(f);

  const hasAdmin = pages.some((p) => p.includes(`${path.sep}admin${path.sep}`));
  const hasDashboard = pages.some((p) => p.includes(`${path.sep}dashboard${path.sep}`));
  const mw = await readMiddleware(ctx.repoPath);

  if (hasAdmin) {
    if (!mw || !mw.includes('/admin')) {
      findings.push({
        checkId: 'route',
        severity: 'blocker',
        title: '/admin route exists with no middleware protection',
        detail: 'Add middleware.ts that matches /admin/:path* and enforces auth.',
      });
    }
  }
  if (hasDashboard) {
    if (!mw || !mw.includes('/dashboard')) {
      findings.push({
        checkId: 'route',
        severity: 'warning',
        title: '/dashboard route exists with no middleware protection',
        detail: 'Add middleware.ts that matches /dashboard/:path* and enforces auth.',
      });
    }
  }

  findings.push({
    checkId: 'route',
    severity: 'pass',
    title: `Detected ${pages.length} route${pages.length === 1 ? '' : 's'}`,
    detail: '',
  });

  return findings;
};
