import { describe, it, expect, beforeAll } from 'vitest';
import { execa } from 'execa';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';

const ROOT = path.resolve(__dirname, '..');
const CLI = path.join(ROOT, 'dist', 'cli.js');
const GOOD = path.join(ROOT, 'fixtures', 'good-next-neon');

beforeAll(async () => {
  await execa('pnpm', ['build'], { cwd: ROOT });
}, 60_000);

describe('cli', () => {
  it('exits 1 when OPENAI_API_KEY is missing', async () => {
    const env = { ...process.env };
    delete env.OPENAI_API_KEY;
    const { exitCode, stderr } = await execa('node', [CLI, '--path', GOOD], {
      env,
      reject: false,
    });
    expect(exitCode).toBe(1);
    expect(stderr).toContain('OPENAI_API_KEY required');
  });

  it('exits 1 when path does not exist', async () => {
    const { exitCode, stderr } = await execa('node', [CLI, '--path', '/nonexistent/path/xyz'], {
      env: { ...process.env, OPENAI_API_KEY: 'sk-test' },
      reject: false,
    });
    expect(exitCode).toBe(1);
    expect(stderr.toLowerCase()).toMatch(/path|not.*exist|not.*directory/);
  });

  it('exits 1 when path has no package.json', async () => {
    const tmp = await fs.mkdtemp(path.join(ROOT, 'tmp-cli-'));
    try {
      const { exitCode, stderr } = await execa('node', [CLI, '--path', tmp], {
        env: { ...process.env, OPENAI_API_KEY: 'sk-test' },
        reject: false,
      });
      expect(exitCode).toBe(1);
      expect(stderr).toContain('package.json');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
