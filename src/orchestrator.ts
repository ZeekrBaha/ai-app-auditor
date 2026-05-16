import { detectStack } from './detect/stack.js';
import { healthCheck } from './checks/health.js';
import { buildCheck } from './checks/build.js';
import { lintCheck } from './checks/lint.js';
import { testCheck } from './checks/test.js';
import { secretCheck } from './checks/secret.js';
import { envCheck } from './checks/env.js';
import { neonCheck } from './checks/neon.js';
import { routeCheck } from './checks/route.js';
import { aiReportWriter, type AIDeps } from './ai/reportWriter.js';
import type { CheckContext, Finding, Report } from './types.js';
import type { CommandResult } from './runner/command.js';

export type RunAuditOptions = {
  repoPath: string;
  smoke: boolean;
  runCommand?: (cmd: string, opts: { cwd: string; timeoutMs: number }) => Promise<CommandResult>;
  createCompletion?: AIDeps['createCompletion'];
};

export async function runAudit(opts: RunAuditOptions): Promise<Report> {
  const stack = await detectStack(opts.repoPath);
  const ctx: CheckContext = { repoPath: opts.repoPath, stack };
  const deps = { runCommand: opts.runCommand };

  const all: Finding[] = [];
  all.push(...(await healthCheck(ctx)));
  all.push(...(await buildCheck(ctx, deps)));
  all.push(...(await lintCheck(ctx, deps)));
  all.push(...(await testCheck(ctx, deps)));
  all.push(...(await secretCheck(ctx)));
  all.push(...(await envCheck(ctx)));
  all.push(...(await neonCheck(ctx)));
  all.push(...(await routeCheck(ctx)));

  if (opts.smoke) {
    // @ts-expect-error Task 18 creates ./smoke/playwright.ts; dynamic import keeps the
    // orchestrator runnable today and lazy-loads playwright only when --smoke is passed.
    const { runSmokeTest } = await import('./smoke/playwright.js');
    all.push(...(await runSmokeTest(ctx)));
  }

  return aiReportWriter(all, stack, { createCompletion: opts.createCompletion });
}
