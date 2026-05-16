import type { Check, Finding } from '../types.js';
import { runCommand as defaultRunCommand, type CommandResult } from '../runner/command.js';

type Deps = {
  runCommand?: (cmd: string, opts: { cwd: string; timeoutMs: number }) => Promise<CommandResult>;
};

function lastNLines(s: string, n: number): string {
  return s.split('\n').slice(-n).join('\n');
}

export const lintCheck = (async (ctx, deps: Deps = {}) => {
  const run = deps.runCommand ?? defaultRunCommand;
  const findings: Finding[] = [];

  if (!ctx.stack.scripts.lint) {
    findings.push({
      checkId: 'lint',
      severity: 'warning',
      title: 'No lint script defined',
      detail: 'Add a "lint" script so lint issues are caught before deploy.',
    });
    return findings;
  }

  const result = await run(`${ctx.stack.packageManager} run lint`, {
    cwd: ctx.repoPath,
    timeoutMs: 60_000,
  });

  if (result.timedOut) {
    findings.push({ checkId: 'lint', severity: 'warning', title: 'Lint exceeded 60s', detail: '' });
    return findings;
  }

  if (result.exitCode !== 0) {
    findings.push({
      checkId: 'lint',
      severity: 'warning',
      title: 'Lint failed',
      detail: 'Lint reported issues.',
      evidence: lastNLines(result.stderr || result.stdout, 40),
    });
    return findings;
  }

  findings.push({ checkId: 'lint', severity: 'pass', title: 'Lint passed', detail: '' });
  return findings;
}) as Check & ((ctx: import('../types.js').CheckContext, deps?: Deps) => Promise<Finding[]>);
