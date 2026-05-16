import { describe, it, expect, vi } from 'vitest';
import { lintCheck } from '../../src/checks/lint.js';
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

describe('lintCheck', () => {
  it('warning when lint script missing', async () => {
    const findings = await lintCheck(ctx({}), { runCommand: vi.fn() });
    expect(findings[0].severity).toBe('warning');
    expect(findings[0].title).toBe('No lint script defined');
  });

  it('pass on exit 0', async () => {
    const run = vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '', timedOut: false });
    const findings = await lintCheck(ctx({ lint: 'next lint' }), { runCommand: run });
    expect(findings[0].severity).toBe('pass');
  });

  it('warning on non-zero (NOT blocker)', async () => {
    const run = vi.fn().mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'oops', timedOut: false });
    const findings = await lintCheck(ctx({ lint: 'next lint' }), { runCommand: run });
    expect(findings[0].severity).toBe('warning');
    expect(findings[0].title).toBe('Lint failed');
  });

  it('warning on timeout', async () => {
    const run = vi.fn().mockResolvedValue({ exitCode: 1, stdout: '', stderr: '', timedOut: true });
    const findings = await lintCheck(ctx({ lint: 'next lint' }), { runCommand: run });
    expect(findings[0].severity).toBe('warning');
    expect(findings[0].title).toBe('Lint exceeded 60s');
  });
});
