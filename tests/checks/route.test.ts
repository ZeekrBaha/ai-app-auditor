import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { routeCheck } from '../../src/checks/route.js';
import { detectStack } from '../../src/detect/stack.js';
import type { CheckContext } from '../../src/types.js';

const PUBLIC = path.resolve(__dirname, '../../fixtures/public-admin');
const GOOD = path.resolve(__dirname, '../../fixtures/good-next-neon');

async function ctx(repoPath: string): Promise<CheckContext> {
  return { repoPath, stack: await detectStack(repoPath) };
}

describe('routeCheck', () => {
  it('blocks unprotected /admin', async () => {
    const findings = await routeCheck(await ctx(PUBLIC));
    const blocker = findings.find(
      (f) => f.severity === 'blocker' && f.title.includes('/admin'),
    );
    expect(blocker).toBeDefined();
  });

  it('passes for good-next-neon (middleware covers /admin)', async () => {
    const findings = await routeCheck(await ctx(GOOD));
    expect(findings.filter((f) => f.severity === 'blocker')).toHaveLength(0);
  });

  it('always emits a pass finding with route count', async () => {
    const findings = await routeCheck(await ctx(GOOD));
    const countFinding = findings.find(
      (f) => f.severity === 'pass' && f.title.startsWith('Detected'),
    );
    expect(countFinding).toBeDefined();
    expect(countFinding!.title).toMatch(/Detected \d+ App Router routes?/);
  });
});
