import { describe, it, expect } from 'vitest';
import { renderJson } from '../../src/output/json.js';
import type { Report } from '../../src/types.js';

const report: Report = {
  verdict: 'ship',
  score: 100,
  blockers: [],
  warnings: [],
  passed: [],
  summary: 'ok',
  fixOrder: [],
  generatedAt: '2026-05-16T00:00:00.000Z',
};

describe('renderJson', () => {
  it('returns a parseable JSON string that round-trips to the report', () => {
    const json = renderJson(report);
    const parsed = JSON.parse(json);
    expect(parsed).toEqual(report);
  });

  it('is pretty-printed with 2-space indent', () => {
    const json = renderJson(report);
    expect(json).toContain('\n  "verdict"');
  });
});
