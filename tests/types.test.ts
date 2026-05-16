import { describe, it, expect } from 'vitest';
import type { StackInfo, Finding, CheckContext, Report } from '../src/types.js';

describe('shared types', () => {
  it('Finding has the expected severity union', () => {
    const f: Finding = {
      checkId: 'demo',
      severity: 'blocker',
      title: 't',
      detail: 'd',
    };
    expect(f.severity).toBe('blocker');
  });

  it('StackInfo carries framework + packageManager', () => {
    const s: StackInfo = {
      framework: 'next',
      packageManager: 'pnpm',
      scripts: { build: 'next build' },
      dependencies: ['next'],
      hasLockfile: true,
      hasEnvExample: false,
      usesNeon: false,
    };
    expect(s.framework).toBe('next');
  });

  it('Report carries verdict + score + AI fields', () => {
    const r: Report = {
      verdict: 'ship',
      score: 100,
      blockers: [],
      warnings: [],
      passed: [],
      summary: '',
      fixOrder: [],
      generatedAt: new Date().toISOString(),
    };
    expect(r.verdict).toBe('ship');
  });

  it('CheckContext bundles repoPath and stack', () => {
    const ctx: CheckContext = {
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
    };
    expect(ctx.repoPath).toBe('/tmp');
  });
});
