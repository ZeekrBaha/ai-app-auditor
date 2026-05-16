import { describe, it, expect, vi } from 'vitest';
import { runSmokeTest } from '../../src/smoke/playwright.js';
import type { CheckContext } from '../../src/types.js';

const ctx: CheckContext = {
  repoPath: '/tmp',
  stack: {
    framework: 'next',
    packageManager: 'pnpm',
    scripts: { dev: 'next dev' },
    dependencies: [],
    hasLockfile: true,
    hasEnvExample: true,
    usesNeon: false,
  },
};

describe('runSmokeTest', () => {
  it('returns blocker when dev server fails to boot', async () => {
    const startServer = vi.fn().mockResolvedValue({ ready: false });
    const drive = vi.fn();
    const findings = await runSmokeTest(ctx, { startServer, drive });
    expect(drive).not.toHaveBeenCalled();
    expect(findings[0].severity).toBe('blocker');
    expect(findings[0].title).toBe('Dev server failed to start within 30s');
  });

  it('returns pass when homepage loads clean', async () => {
    const startServer = vi.fn().mockResolvedValue({ ready: true, stop: vi.fn() });
    const drive = vi.fn().mockResolvedValue({
      consoleErrors: [],
      failedRequests: [],
      routeStatuses: { '/login': 200, '/admin': 404 },
    });
    const findings = await runSmokeTest(ctx, { startServer, drive });
    expect(findings.some((f) => f.severity === 'pass' && f.title.includes('homepage'))).toBe(true);
  });

  it('returns blocker on console error', async () => {
    const startServer = vi.fn().mockResolvedValue({ ready: true, stop: vi.fn() });
    const drive = vi.fn().mockResolvedValue({
      consoleErrors: ['ReferenceError: foo is not defined'],
      failedRequests: [],
      routeStatuses: {},
    });
    const findings = await runSmokeTest(ctx, { startServer, drive });
    expect(findings.some((f) => f.severity === 'blocker' && f.title.includes('Console error'))).toBe(true);
  });

  it('warns on non-404 4xx on common route', async () => {
    const startServer = vi.fn().mockResolvedValue({ ready: true, stop: vi.fn() });
    const drive = vi.fn().mockResolvedValue({
      consoleErrors: [],
      failedRequests: [],
      routeStatuses: { '/login': 403, '/admin': 404 },
    });
    const findings = await runSmokeTest(ctx, { startServer, drive });
    expect(findings.some((f) => f.severity === 'warning' && f.title.includes('/login'))).toBe(true);
  });

  it('blocks on 5xx on common route', async () => {
    const startServer = vi.fn().mockResolvedValue({ ready: true, stop: vi.fn() });
    const drive = vi.fn().mockResolvedValue({
      consoleErrors: [],
      failedRequests: [],
      routeStatuses: { '/dashboard': 500 },
    });
    const findings = await runSmokeTest(ctx, { startServer, drive });
    expect(findings.some((f) => f.severity === 'blocker' && f.title.includes('/dashboard'))).toBe(true);
  });
});
