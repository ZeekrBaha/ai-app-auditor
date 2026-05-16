import type { Check, CheckContext, Finding } from '../types.js';

export type SmokeDriveResult = {
  consoleErrors: string[];
  failedRequests: string[];
  routeStatuses: Record<string, number>;
};

export type SmokeDeps = {
  startServer?: (ctx: CheckContext) => Promise<{ ready: boolean; stop?: () => Promise<void> }>;
  drive?: (ctx: CheckContext) => Promise<SmokeDriveResult>;
};

const COMMON_ROUTES = ['/login', '/signup', '/dashboard', '/admin'];

async function defaultStartServer(_ctx: CheckContext): Promise<{ ready: boolean; stop?: () => Promise<void> }> {
  throw new Error('Smoke test runtime not yet implemented. Run without --smoke for V1.');
}

async function defaultDrive(_ctx: CheckContext): Promise<SmokeDriveResult> {
  throw new Error('Smoke test runtime not yet implemented. Run without --smoke for V1.');
}

export const runSmokeTest: Check<SmokeDeps> = async (ctx, deps = {}) => {
  const startServer = deps.startServer ?? defaultStartServer;
  const drive = deps.drive ?? defaultDrive;

  const server = await startServer(ctx);
  if (!server.ready) {
    return [
      {
        checkId: 'smoke',
        severity: 'blocker',
        title: 'Dev server failed to start within 30s',
        detail: 'The app could not boot locally. Check `pnpm dev` manually.',
      },
    ];
  }

  try {
    const result = await drive(ctx);
    const findings: Finding[] = [];

    if (result.consoleErrors.length > 0) {
      findings.push({
        checkId: 'smoke',
        severity: 'blocker',
        title: 'Console error on homepage',
        detail: result.consoleErrors.join('\n'),
      });
    } else {
      findings.push({ checkId: 'smoke', severity: 'pass', title: 'homepage loaded clean', detail: '' });
    }

    for (const route of COMMON_ROUTES) {
      const status = result.routeStatuses[route];
      if (status === undefined) continue;
      if (status >= 500) {
        findings.push({
          checkId: 'smoke',
          severity: 'blocker',
          title: `${route} returned ${status}`,
          detail: 'Server error on a common route.',
        });
      } else if (status >= 400 && status !== 404) {
        findings.push({
          checkId: 'smoke',
          severity: 'warning',
          title: `${route} returned ${status}`,
          detail: 'Unexpected client error on a common route.',
        });
      }
    }

    return findings;
  } finally {
    if (server.stop) await server.stop();
  }
};
