import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../../src/output/markdown.js';
import type { Report } from '../../src/types.js';

const report: Report = {
  verdict: 'do-not-ship',
  score: 60,
  blockers: [{ checkId: 'build', severity: 'blocker', title: 'Build failed', detail: 'exit 1' }],
  warnings: [{ checkId: 'health', severity: 'warning', title: 'Missing README', detail: '' }],
  passed: [{ checkId: 'route', severity: 'pass', title: 'Detected 2 routes', detail: '' }],
  summary: 'Fix the build first.',
  fixOrder: ['Build failed', 'Missing README'],
  generatedAt: '2026-05-16T00:00:00.000Z',
};

describe('renderMarkdown', () => {
  it('includes verdict and score', () => {
    const md = renderMarkdown(report);
    expect(md).toContain('Verdict: do-not-ship');
    expect(md).toContain('Score: 60/100');
  });

  it('lists blockers, warnings, passed sections', () => {
    const md = renderMarkdown(report);
    expect(md).toMatch(/## Critical Blockers[\s\S]*Build failed/);
    expect(md).toMatch(/## Warnings[\s\S]*Missing README/);
    expect(md).toMatch(/## Passed Checks[\s\S]*Detected 2 routes/);
  });

  it('includes the AI summary and fix order', () => {
    const md = renderMarkdown(report);
    expect(md).toContain('Fix the build first.');
    expect(md).toMatch(/## Fix First[\s\S]*1\. Build failed[\s\S]*2\. Missing README/);
  });
});
