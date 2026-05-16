import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { neonCheck } from '../../src/checks/neon.js';
import { detectStack } from '../../src/detect/stack.js';
import type { CheckContext } from '../../src/types.js';

const NOAUTH = path.resolve(__dirname, '../../fixtures/neon-noauth');
const GOOD = path.resolve(__dirname, '../../fixtures/good-next-neon');

async function ctx(repoPath: string): Promise<CheckContext> {
  return { repoPath, stack: await detectStack(repoPath) };
}

describe('neonCheck', () => {
  it('blocks when DATABASE_URL not in .env.example', async () => {
    const findings = await neonCheck(await ctx(NOAUTH));
    const blocker = findings.find(
      (f) => f.severity === 'blocker' && f.title.includes('DATABASE_URL'),
    );
    expect(blocker).toBeDefined();
  });

  it('warns when API route imports neon but has no auth check', async () => {
    const findings = await neonCheck(await ctx(NOAUTH));
    const warn = findings.find(
      (f) => f.severity === 'warning' && f.title.includes('no auth check detected'),
    );
    expect(warn).toBeDefined();
    expect(warn?.detail).toContain('app/api/users/route.ts');
  });

  it('passes for good-next-neon (DATABASE_URL documented + route has auth())', async () => {
    const findings = await neonCheck(await ctx(GOOD));
    expect(findings.filter((f) => f.severity === 'blocker')).toHaveLength(0);
    expect(findings.filter((f) => f.severity === 'warning' && f.title.includes('no auth check detected'))).toHaveLength(0);
  });

  it('returns empty (no findings) when stack.usesNeon is false', async () => {
    const findings = await neonCheck({
      repoPath: '/tmp',
      stack: {
        framework: 'next',
        packageManager: 'pnpm',
        scripts: {},
        dependencies: [],
        hasLockfile: false,
        hasEnvExample: false,
        usesNeon: false,
      },
    });
    expect(findings).toHaveLength(0);
  });
});
