import type { Finding } from './types.js';

export type ScoreResult = {
  verdict: 'ship' | 'do-not-ship';
  score: number;
  blockers: Finding[];
  warnings: Finding[];
  passed: Finding[];
};

export function scoreFindings(findings: Finding[]): ScoreResult {
  const blockers = findings.filter((f) => f.severity === 'blocker');
  const warnings = findings.filter((f) => f.severity === 'warning');
  const passed = findings.filter((f) => f.severity === 'pass');

  const raw = 100 - blockers.length * 20 - warnings.length * 5;
  const score = Math.max(0, raw);
  const verdict: 'ship' | 'do-not-ship' = blockers.length > 0 || score < 50 ? 'do-not-ship' : 'ship';

  return { verdict, score, blockers, warnings, passed };
}
