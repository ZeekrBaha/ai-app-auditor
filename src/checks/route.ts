import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { Check, Finding } from '../types.js';
import { exists, walkFiles } from '../util/fs.js';

async function readMiddleware(repoPath: string): Promise<string | null> {
  for (const name of ['middleware.ts', 'middleware.js']) {
    const p = path.join(repoPath, name);
    if (await exists(p)) return fs.readFile(p, 'utf8');
  }
  return null;
}

export const routeCheck: Check = async (ctx) => {
  const findings: Finding[] = [];

  const appDir = path.join(ctx.repoPath, 'app');
  const pages: string[] = [];
  if (await exists(appDir)) {
    for await (const f of walkFiles(
      appDir,
      (e) => e.name === 'page.ts' || e.name === 'page.tsx',
    )) {
      pages.push(f);
    }
  }

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
    title: `Detected ${pages.length} App Router route${pages.length === 1 ? '' : 's'}`,
    detail: '',
  });

  return findings;
};
