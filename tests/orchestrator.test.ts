import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import { runAudit } from '../src/orchestrator.js';
import type { Finding, Reporter } from '../src/types.js';

const GOOD = path.resolve(__dirname, '../fixtures/good-next-neon');
const BROKEN = path.resolve(__dirname, '../fixtures/broken-build');

const aiOk = vi.fn().mockResolvedValue({
  summary: 'looks ok',
  fixOrder: [],
});

describe('runAudit', () => {
  let prevKey: string | undefined;
  beforeEach(() => {
    prevKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'sk-test';
  });
  afterEach(() => {
    if (prevKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prevKey;
  });

  it('returns ship for good-next-neon (AI mocked, runCommand mocked to pass everything)', async () => {
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

  it('emits start/done events for each pipeline step in order', async () => {
    const runCommand = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, stdout: '', stderr: '', timedOut: false });

    type Event =
      | { kind: 'start'; step: string }
      | { kind: 'done'; step: string; findingCount: number; durationMs: number };
    const events: Event[] = [];
    const reporter: Reporter = {
      start: (step) => events.push({ kind: 'start', step }),
      done: (step, findings: Finding[], durationMs) =>
        events.push({ kind: 'done', step, findingCount: findings.length, durationMs }),
    };

    await runAudit({
      repoPath: GOOD,
      smoke: false,
      runCommand,
      createCompletion: aiOk,
      reporter,
    });

    const expectedSteps = [
      'Project health',
      'Build',
      'Lint',
      'Tests',
      'Secret scan',
      'Env hygiene',
      'Neon DB checks',
      'App Router auth',
      'AI report',
    ];

    expect(events.map((e) => `${e.kind}:${e.step}`)).toEqual(
      expectedSteps.flatMap((s) => [`start:${s}`, `done:${s}`]),
    );
    for (const e of events) {
      if (e.kind === 'done') {
        expect(e.durationMs).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('returns do-not-ship when build fails', async () => {
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
