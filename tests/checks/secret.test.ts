import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { secretCheck } from '../../src/checks/secret.js';
import { detectStack } from '../../src/detect/stack.js';
import type { CheckContext } from '../../src/types.js';

const LEAKED = path.resolve(__dirname, '../../fixtures/leaked-secret');
const GOOD = path.resolve(__dirname, '../../fixtures/good-next-neon');

async function ctx(repoPath: string): Promise<CheckContext> {
  return { repoPath, stack: await detectStack(repoPath) };
}

describe('secretCheck', () => {
  it('flags OpenAI-style key as a blocker, with file path and line', async () => {
    const findings = await secretCheck(await ctx(LEAKED));
    const blockers = findings.filter((f) => f.severity === 'blocker');
    expect(blockers.length).toBeGreaterThanOrEqual(1);
    expect(blockers[0].detail).toContain('src/openai.ts');
    expect(blockers[0].detail).toMatch(/line \d+/);
  });

  it('does NOT include the raw secret string in the finding', async () => {
    const findings = await secretCheck(await ctx(LEAKED));
    const all = JSON.stringify(findings);
    expect(all).not.toContain('FAKEFAKEFAKEFAKEFAKE1234567890');
  });

  it('reports a pass for the good-next-neon fixture', async () => {
    const findings = await secretCheck(await ctx(GOOD));
    const blockers = findings.filter((f) => f.severity === 'blocker');
    expect(blockers).toHaveLength(0);
    expect(findings.some((f) => f.severity === 'pass')).toBe(true);
  });
});
