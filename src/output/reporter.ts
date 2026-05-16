import type { Finding, Reporter } from '../types.js';

export type StderrReporterOptions = {
  total: number;
  write: (s: string) => void;
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function summarize(findings: Finding[]): string {
  const blockers = findings.filter((f) => f.severity === 'blocker').length;
  const warnings = findings.filter((f) => f.severity === 'warning').length;
  if (blockers > 0) return `✗ ${blockers} blocker${blockers === 1 ? '' : 's'}`;
  if (warnings > 0) return `⚠ ${warnings} warning${warnings === 1 ? '' : 's'}`;
  return '✓';
}

export function createStderrReporter(opts: StderrReporterOptions): Reporter {
  let index = 0;
  return {
    start: (step) => {
      index += 1;
      opts.write(`[${index}/${opts.total}] ${step}...`);
    },
    done: (_step, findings, durationMs) => {
      opts.write(` ${summarize(findings)} (${formatDuration(durationMs)})\n`);
    },
  };
}
