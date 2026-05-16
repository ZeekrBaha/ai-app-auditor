import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { envCheck } from '../../src/checks/env.js';
import { detectStack } from '../../src/detect/stack.js';
import type { CheckContext } from '../../src/types.js';

const MISSING = path.resolve(__dirname, '../../fixtures/missing-env');
const GOOD = path.resolve(__dirname, '../../fixtures/good-next-neon');

async function ctx(repoPath: string): Promise<CheckContext> {
  return { repoPath, stack: await detectStack(repoPath) };
}

describe('envCheck', () => {
  it('warns for each var used in source but missing from .env.example', async () => {
    const findings = await envCheck(await ctx(MISSING));
    const titles = findings.map((f) => f.title);
    expect(titles).toContain('Document `DATABASE_URL` in .env.example');
    expect(titles).toContain('Document `UNDOCUMENTED_VAR` in .env.example');
  });

  it('blocks risky NEXT_PUBLIC_*_SECRET-like vars', async () => {
    const findings = await envCheck(await ctx(MISSING));
    const blocker = findings.find(
      (f) => f.severity === 'blocker' && f.title.includes('NEXT_PUBLIC_STRIPE_SECRET'),
    );
    expect(blocker).toBeDefined();
  });

  it('passes for good-next-neon (all used vars are in .env.example)', async () => {
    const findings = await envCheck(await ctx(GOOD));
    const warnings = findings.filter((f) => f.severity === 'warning');
    expect(warnings).toHaveLength(0);
  });
});
