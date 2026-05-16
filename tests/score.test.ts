import { describe, it, expect } from 'vitest';
import { scoreFindings } from '../src/score.js';
import type { Finding } from '../src/types.js';

function f(severity: Finding['severity'], title = 't'): Finding {
  return { checkId: 'demo', severity, title, detail: '' };
}

describe('scoreFindings', () => {
  it('starts at 100 with no findings → ship', () => {
    const r = scoreFindings([]);
    expect(r.score).toBe(100);
    expect(r.verdict).toBe('ship');
  });

  it('-20 per blocker, -5 per warning, floored at 0', () => {
    const r = scoreFindings([f('blocker'), f('blocker'), f('warning'), f('warning')]);
    expect(r.score).toBe(50);
  });

  it('floors at 0', () => {
    const r = scoreFindings(Array.from({ length: 10 }, () => f('blocker')));
    expect(r.score).toBe(0);
  });

  it('any blocker → do-not-ship even if score >= 50', () => {
    const r = scoreFindings([f('blocker'), f('pass'), f('pass')]);
    expect(r.verdict).toBe('do-not-ship');
    expect(r.score).toBe(80);
  });

  it('score < 50 → do-not-ship even with no blockers', () => {
    const r = scoreFindings(Array.from({ length: 11 }, () => f('warning')));
    expect(r.score).toBe(45);
    expect(r.verdict).toBe('do-not-ship');
  });

  it('partitions findings into blockers/warnings/passed', () => {
    const r = scoreFindings([f('blocker', 'B'), f('warning', 'W'), f('pass', 'P')]);
    expect(r.blockers).toHaveLength(1);
    expect(r.warnings).toHaveLength(1);
    expect(r.passed).toHaveLength(1);
  });
});
