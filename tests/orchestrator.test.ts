import { describe, it, expect, vi } from 'vitest';
import * as path from 'node:path';
import { runAudit } from '../src/orchestrator.js';

const GOOD = path.resolve(__dirname, '../fixtures/good-next-neon');
const BROKEN = path.resolve(__dirname, '../fixtures/broken-build');

const aiOk = vi.fn().mockResolvedValue({
  summary: 'looks ok',
  fixOrder: [],
});

describe('runAudit', () => {
  it('returns ship for good-next-neon (AI mocked, runCommand mocked to pass everything)', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    const runCommand = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, stdout: '', stderr: '', timedOut: false });
    const report = await runAudit({
      repoPath: GOOD,
      smoke: false,
      runCommand,
      createCompletion: aiOk,
    });
    expect(report.verdict).toBe('ship');
    expect(report.score).toBe(100);
  });

  it('returns do-not-ship when build fails', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    const runCommand = vi.fn().mockImplementation(async (cmd: string) => {
      if (cmd.includes('build')) return { exitCode: 1, stdout: '', stderr: 'boom', timedOut: false };
      return { exitCode: 0, stdout: '', stderr: '', timedOut: false };
    });
    const report = await runAudit({
      repoPath: BROKEN,
      smoke: false,
      runCommand,
      createCompletion: aiOk,
    });
    expect(report.verdict).toBe('do-not-ship');
    expect(report.blockers.some((b) => b.checkId === 'build')).toBe(true);
  });
});
