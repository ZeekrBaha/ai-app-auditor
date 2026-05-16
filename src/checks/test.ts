import type { Check, Finding } from '../types.js';
import { runCommand as defaultRunCommand, type CommandResult } from '../runner/command.js';

type Deps = {
  runCommand?: (cmd: string, opts: { cwd: string; timeoutMs: number }) => Promise<CommandResult>;
};

function lastNLines(s: string, n: number): string {
  return s.split('\n').slice(-n).join('\n');
}

export const testCheck = (async (ctx, deps: Deps = {}) => {
  const run = deps.runCommand ?? defaultRunCommand;
  const findings: Finding[] = [];

  if (!ctx.stack.scripts.test) {
    findings.push({
      checkId: 'test',
      severity: 'warning',
      title: 'No tests defined',
      detail: 'Add a "test" script so regressions are caught before deploy.',
    });
    return findings;
  }

  const result = await run(`${ctx.stack.packageManager} run test`, {
    cwd: ctx.repoPath,
    timeoutMs: 180_000,
  });

  if (result.timedOut) {
    findings.push({ checkId: 'test', severity: 'blocker', title: 'Tests exceeded 180s', detail: '' });
    return findings;
  }

  if (result.exitCode !== 0) {
    findings.push({
      checkId: 'test',
      severity: 'blocker',
      title: 'Tests failed',
      detail: 'The test suite exited non-zero.',
      evidence: lastNLines(result.stderr || result.stdout, 40),
    });
    return findings;
  }

  findings.push({ checkId: 'test', severity: 'pass', title: 'Tests passed', detail: '' });
  return findings;
}) as Check & ((ctx: import('../types.js').CheckContext, deps?: Deps) => Promise<Finding[]>);
