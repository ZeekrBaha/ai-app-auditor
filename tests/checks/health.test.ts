import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { healthCheck } from '../../src/checks/health.js';
import { detectStack } from '../../src/detect/stack.js';
import type { CheckContext } from '../../src/types.js';

const GOOD = path.resolve(__dirname, '../../fixtures/good-next-neon');

async function ctx(repoPath: string): Promise<CheckContext> {
  return { repoPath, stack: await detectStack(repoPath) };
}

describe('healthCheck', () => {
  it('passes for the good-next-neon fixture (lockfile + env.example + README + package.json + tsconfig)', async () => {
    const findings = await healthCheck(await ctx(GOOD));
    const titles = findings.map((f) => f.title);
    expect(titles).toContain('package.json present');
    expect(titles).toContain('tsconfig.json present');
    expect(findings.filter((f) => f.severity === 'warning')).toHaveLength(0);
  });

  it('every finding has the checkId "health"', async () => {
    const findings = await healthCheck(await ctx(GOOD));
    for (const f of findings) expect(f.checkId).toBe('health');
  });
});
