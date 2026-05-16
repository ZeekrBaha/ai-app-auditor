import type { Check, Finding } from '../types.js';
import { runCommand as defaultRunCommand, type CommandResult } from '../runner/command.js';
import { lastNLines } from '../util/text.js';

type Deps = {
  runCommand?: (cmd: string, opts: { cwd: string; timeoutMs: number }) => Promise<CommandResult>;
};

export const buildCheck: Check<Deps> = async (ctx, deps = {}) => {
  const run = deps.runCommand ?? defaultRunCommand;
  const findings: Finding[] = [];

  if (!ctx.stack.scripts.build) {
    findings.push({
      checkId: 'build',
      severity: 'warning',
      title: 'No build script defined',
      detail: 'Add a "build" script to package.json so the project can be deployed.',
    });
    return findings;
  }

  const result = await run(`${ctx.stack.packageManager} run build`, {
    cwd: ctx.repoPath,
    timeoutMs: 120_000,
  });

  if (result.timedOut) {
    findings.push({
      checkId: 'build',
      severity: 'blocker',
      title: 'Build exceeded 120s',
      detail: 'The build command did not complete within 120 seconds.',
    });
    return findings;
  }

  if (result.exitCode !== 0) {
    findings.push({
      checkId: 'build',
      severity: 'blocker',
      title: 'Build failed',
      detail: 'Production build exited with a non-zero status.',
      evidence: lastNLines(result.stderr || result.stdout, 40),
    });
    return findings;
  }

  findings.push({ checkId: 'build', severity: 'pass', title: 'Build succeeded', detail: '' });
  return findings;
};
