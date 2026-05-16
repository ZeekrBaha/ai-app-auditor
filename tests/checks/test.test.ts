import { describe, it, expect, vi } from 'vitest';
import { testCheck } from '../../src/checks/test.js';
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

describe('testCheck', () => {
  it('warning when test script missing', async () => {
    const findings = await testCheck(ctx({}), { runCommand: vi.fn() });
    expect(findings[0].severity).toBe('warning');
    expect(findings[0].title).toBe('No tests defined');
  });

  it('pass on exit 0', async () => {
    const run = vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '', timedOut: false });
    const findings = await testCheck(ctx({ test: 'vitest run' }), { runCommand: run });
    expect(findings[0].severity).toBe('pass');
  });

  it('blocker on non-zero', async () => {
    const run = vi.fn().mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'fail', timedOut: false });
    const findings = await testCheck(ctx({ test: 'vitest run' }), { runCommand: run });
    expect(findings[0].severity).toBe('blocker');
    expect(findings[0].title).toBe('Tests failed');
  });

  it('blocker on timeout', async () => {
    const run = vi.fn().mockResolvedValue({ exitCode: 1, stdout: '', stderr: '', timedOut: true });
    const findings = await testCheck(ctx({ test: 'vitest run' }), { runCommand: run });
    expect(findings[0].severity).toBe('blocker');
    expect(findings[0].title).toBe('Tests exceeded 180s');
  });
});
