import { describe, it, expect, vi } from 'vitest';
import { buildCheck } from '../../src/checks/build.js';
import type { CheckContext } from '../../src/types.js';

function ctx(scripts: Record<string, string>): CheckContext {
  return {
    repoPath: '/tmp',
    stack: {
      framework: 'next',
      packageManager: 'pnpm',
      scripts,
      dependencies: [],
      hasLockfile: true,
      hasEnvExample: false,
      usesNeon: false,
    },
  };
}

describe('buildCheck', () => {
  it('returns warning when build script missing', async () => {
    const run = vi.fn();
    const findings = await buildCheck(ctx({}), { runCommand: run });
    expect(run).not.toHaveBeenCalled();
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('warning');
    expect(findings[0].title).toBe('No build script defined');
  });

  it('returns pass when build exits 0', async () => {
    const run = vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '', timedOut: false });
    const findings = await buildCheck(ctx({ build: 'next build' }), { runCommand: run });
    expect(findings[0].severity).toBe('pass');
    expect(findings[0].title).toBe('Build succeeded');
  });

  it('returns blocker when build exits non-zero, with last 40 lines of stderr', async () => {
    const stderr = Array.from({ length: 60 }, (_, i) => `line ${i}`).join('\n');
    const run = vi.fn().mockResolvedValue({ exitCode: 1, stdout: '', stderr, timedOut: false });
    const findings = await buildCheck(ctx({ build: 'next build' }), { runCommand: run });
    expect(findings[0].severity).toBe('blocker');
    expect(findings[0].title).toBe('Build failed');
    const lines = (findings[0].evidence ?? '').split('\n');
    expect(lines).toHaveLength(40);
    expect(lines[39]).toBe('line 59');
  });

  it('returns blocker when build times out', async () => {
    const run = vi.fn().mockResolvedValue({ exitCode: 1, stdout: '', stderr: '', timedOut: true });
    const findings = await buildCheck(ctx({ build: 'next build' }), { runCommand: run });
    expect(findings[0].severity).toBe('blocker');
    expect(findings[0].title).toBe('Build exceeded 120s');
  });
});
