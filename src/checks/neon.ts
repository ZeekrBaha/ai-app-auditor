import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { Check, Finding } from '../types.js';
import { exists, walkFiles } from '../util/fs.js';

// Anchors require the auth call to start the identifier (not be a member call like firebase.auth()).
const AUTH_PATTERNS = [
  /(?:^|[^.\w-])auth\s*\(/,
  /(?:^|[^.\w-])getServerSession\s*\(/,
  /(?:^|[^.\w-])currentUser\s*\(/,
];

async function readEnvExampleKeys(repoPath: string): Promise<Set<string>> {
  try {
    const raw = await fs.readFile(path.join(repoPath, '.env.example'), 'utf8');
    return new Set(
      raw
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#') && l.includes('='))
        .map((l) => l.split('=')[0].trim()),
    );
  } catch {
    return new Set();
  }
}

export const neonCheck: Check = async (ctx) => {
  if (!ctx.stack.usesNeon) return [];

  const findings: Finding[] = [];

  const documented = await readEnvExampleKeys(ctx.repoPath);
  if (!documented.has('DATABASE_URL')) {
    findings.push({
      checkId: 'neon',
      severity: 'blocker',
      title: 'DATABASE_URL not in .env.example',
      detail: 'Neon requires DATABASE_URL. Document it in .env.example so collaborators and deploys can set it.',
    });
  }

  const hasDrizzle = ctx.stack.dependencies.includes('drizzle-orm');
  const hasPrisma = ctx.stack.dependencies.includes('prisma') || ctx.stack.dependencies.includes('@prisma/client');
  if (hasDrizzle && !(await exists(path.join(ctx.repoPath, 'drizzle')))) {
    findings.push({
      checkId: 'neon',
      severity: 'warning',
      title: 'Drizzle detected but no drizzle/ folder',
      detail: 'Add a migrations folder so schema changes are versioned.',
    });
  }
  if (hasPrisma && !(await exists(path.join(ctx.repoPath, 'prisma', 'migrations')))) {
    findings.push({
      checkId: 'neon',
      severity: 'warning',
      title: 'Prisma detected but no migrations folder',
      detail: 'Add prisma/migrations/ so schema changes are versioned.',
    });
  }

  const appDir = path.join(ctx.repoPath, 'app');
  if (!(await exists(appDir))) return findings;

  for await (const route of walkFiles(
    appDir,
    (e) => e.name === 'route.ts' || e.name === 'route.tsx',
  )) {
    const content = await fs.readFile(route, 'utf8');
    const usesNeonHere = content.includes('@neondatabase/serverless');
    if (!usesNeonHere) continue;
    const hasAuth = AUTH_PATTERNS.some((re) => re.test(content));
    if (!hasAuth) {
      findings.push({
        checkId: 'neon',
        severity: 'warning',
        title: 'API route queries Neon but no auth check detected',
        detail: `${path.relative(ctx.repoPath, route)} imports @neondatabase/serverless but has no auth()/getServerSession()/currentUser() call.`,
      });
    }
  }

  return findings;
};
