import { describe, it, expect, vi } from 'vitest';
import { aiReportWriter } from '../../src/ai/reportWriter.js';
import type { Finding, StackInfo } from '../../src/types.js';

const stack: StackInfo = {
  framework: 'next',
  packageManager: 'pnpm',
  scripts: {},
  dependencies: [],
  hasLockfile: true,
  hasEnvExample: true,
  usesNeon: true,
};

const findings: Finding[] = [
  { checkId: 'build', severity: 'blocker', title: 'Build failed', detail: 'exit 1' },
  { checkId: 'health', severity: 'warning', title: 'Missing README', detail: '' },
  { checkId: 'route', severity: 'pass', title: 'Detected 3 routes', detail: '' },
];

describe('aiReportWriter', () => {
  it('throws when OPENAI_API_KEY is not set', async () => {
    const prev = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    await expect(aiReportWriter(findings, stack, { createCompletion: vi.fn() })).rejects.toThrow(
      /OPENAI_API_KEY required/,
    );
    if (prev !== undefined) process.env.OPENAI_API_KEY = prev;
  });

  it('merges deterministic score/verdict with AI-written summary/fixOrder', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    const createCompletion = vi.fn().mockResolvedValue({
      summary: 'Build is broken; fix it first.',
      fixOrder: ['Build failed', 'Missing README'],
    });
    const report = await aiReportWriter(findings, stack, { createCompletion });
    expect(report.verdict).toBe('do-not-ship');
    expect(report.score).toBe(75);
    expect(report.summary).toBe('Build is broken; fix it first.');
    expect(report.fixOrder).toEqual(['Build failed', 'Missing README']);
    expect(report.generatedAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it('retries once on API failure, then succeeds', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    const createCompletion = vi
      .fn()
      .mockRejectedValueOnce(new Error('rate_limit'))
      .mockResolvedValueOnce({ summary: 's', fixOrder: [] });
    const report = await aiReportWriter(findings, stack, { createCompletion });
    expect(createCompletion).toHaveBeenCalledTimes(2);
    expect(report.summary).toBe('s');
  });

  it('strips `evidence` from findings before passing them to the AI (privacy)', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    const withEvidence: Finding[] = [
      {
        checkId: 'build',
        severity: 'blocker',
        title: 'Build failed',
        detail: 'exit 1',
        evidence: '/Users/baha/secret/path/file.ts:42 leaked source line here',
      },
    ];
    const createCompletion = vi.fn().mockResolvedValue({ summary: 's', fixOrder: [] });
    await aiReportWriter(withEvidence, stack, { createCompletion });
    const sentFindings = createCompletion.mock.calls[0][0].findings;
    for (const f of sentFindings) {
      expect(f).not.toHaveProperty('evidence');
    }
  });

  it('throws if both attempts fail', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    const createCompletion = vi.fn().mockRejectedValue(new Error('still bad'));
    await expect(aiReportWriter(findings, stack, { createCompletion })).rejects.toThrow(/still bad/);
    expect(createCompletion).toHaveBeenCalledTimes(2);
  });
});
