import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { writeOutputs } from '../../src/output/write.js';
import type { Report } from '../../src/types.js';

const report: Report = {
  verdict: 'ship',
  score: 100,
  blockers: [],
  warnings: [],
  passed: [],
  summary: 'all good',
  fixOrder: [],
  generatedAt: '2026-05-16T00:00:00.000Z',
};

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'aaa-test-'));
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('writeOutputs', () => {
  it('creates .ai-app-auditor/ with report.md and report.json', async () => {
    await writeOutputs(report, tmp);
    const outDir = path.join(tmp, '.ai-app-auditor');
    const files = await fs.readdir(outDir);
    expect(files.sort()).toEqual(['report.json', 'report.md']);
  });

  it('report.json round-trips to the input report', async () => {
    await writeOutputs(report, tmp);
    const raw = await fs.readFile(path.join(tmp, '.ai-app-auditor', 'report.json'), 'utf8');
    expect(JSON.parse(raw)).toEqual(report);
  });
});
