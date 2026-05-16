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
import type { CheckContext, Finding, Report, Reporter } from './types.js';
import type { CommandResult } from './runner/command.js';

export type RunAuditOptions = {
  repoPath: string;
  smoke: boolean;
  runCommand?: (cmd: string, opts: { cwd: string; timeoutMs: number }) => Promise<CommandResult>;
  createCompletion?: AIDeps['createCompletion'];
  reporter?: Reporter;
};

const silentReporter: Reporter = { start: () => {}, done: () => {} };

async function runStep(
  reporter: Reporter,
  step: string,
  fn: () => Promise<Finding[]>,
): Promise<Finding[]> {
  reporter.start(step);
  const t0 = Date.now();
  const findings = await fn();
  reporter.done(step, findings, Date.now() - t0);
  return findings;
}

export async function runAudit(opts: RunAuditOptions): Promise<Report> {
  const reporter = opts.reporter ?? silentReporter;
  const stack = await detectStack(opts.repoPath);
  const ctx: CheckContext = { repoPath: opts.repoPath, stack };
  const deps = { runCommand: opts.runCommand };

  const all: Finding[] = [];
  all.push(...(await runStep(reporter, 'Project health', () => healthCheck(ctx))));
  all.push(...(await runStep(reporter, 'Build', () => buildCheck(ctx, deps))));
  all.push(...(await runStep(reporter, 'Lint', () => lintCheck(ctx, deps))));
  all.push(...(await runStep(reporter, 'Tests', () => testCheck(ctx, deps))));
  all.push(...(await runStep(reporter, 'Secret scan', () => secretCheck(ctx))));
  all.push(...(await runStep(reporter, 'Env hygiene', () => envCheck(ctx))));
  all.push(...(await runStep(reporter, 'Neon DB checks', () => neonCheck(ctx))));
  all.push(...(await runStep(reporter, 'App Router auth', () => routeCheck(ctx))));

  if (opts.smoke) {
    const { runSmokeTest } = await import('./smoke/playwright.js');
    all.push(...(await runStep(reporter, 'Smoke test', () => runSmokeTest(ctx))));
  }

  reporter.start('AI report');
  const t0 = Date.now();
  const report = await aiReportWriter(all, stack, { createCompletion: opts.createCompletion });
  reporter.done('AI report', [], Date.now() - t0);
  return report;
}
