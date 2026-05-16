import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { Check, Finding } from '../types.js';

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export const healthCheck: Check = async (ctx) => {
  const findings: Finding[] = [];

  if (!ctx.stack.hasLockfile) {
    findings.push({
      checkId: 'health',
      severity: 'warning',
      title: 'Missing lockfile',
      detail:
        'No pnpm-lock.yaml / package-lock.json / yarn.lock / bun.lockb found. Run your package manager install to create one.',
    });
  }

  if (!ctx.stack.hasEnvExample) {
    findings.push({
      checkId: 'health',
      severity: 'warning',
      title: 'Missing .env.example',
      detail: 'Add a .env.example documenting required environment variables.',
    });
  }

  if (!(await exists(path.join(ctx.repoPath, 'README.md')))) {
    findings.push({
      checkId: 'health',
      severity: 'warning',
      title: 'Missing README',
      detail: 'Add a README.md describing the project.',
    });
  }

  if (await exists(path.join(ctx.repoPath, 'package.json'))) {
    findings.push({ checkId: 'health', severity: 'pass', title: 'package.json present', detail: '' });
  }

  if (await exists(path.join(ctx.repoPath, 'tsconfig.json'))) {
    findings.push({ checkId: 'health', severity: 'pass', title: 'tsconfig.json present', detail: '' });
  }

  return findings;
};
