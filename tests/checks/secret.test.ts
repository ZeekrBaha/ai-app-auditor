import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { secretCheck } from '../../src/checks/secret.js';
import { detectStack } from '../../src/detect/stack.js';
import type { CheckContext } from '../../src/types.js';

const LEAKED = path.resolve(__dirname, '../../fixtures/leaked-secret');
const GOOD = path.resolve(__dirname, '../../fixtures/good-next-neon');

async function ctx(repoPath: string): Promise<CheckContext> {
  return { repoPath, stack: await detectStack(repoPath) };
}

describe('secretCheck', () => {
  it('flags OpenAI-style key as a blocker, with file path and line', async () => {
    const findings = await secretCheck(await ctx(LEAKED));
    const blockers = findings.filter((f) => f.severity === 'blocker');
    expect(blockers.length).toBeGreaterThanOrEqual(1);
    expect(blockers[0].detail).toContain('src/openai.ts');
    expect(blockers[0].detail).toMatch(/line \d+/);
  });

  it('does NOT include the raw secret string in the finding', async () => {
    const findings = await secretCheck(await ctx(LEAKED));
    const all = JSON.stringify(findings);
    expect(all).not.toContain('FAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE1234567890');
  });

  it('reports a pass for the good-next-neon fixture', async () => {
    const findings = await secretCheck(await ctx(GOOD));
    const blockers = findings.filter((f) => f.severity === 'blocker');
    expect(blockers).toHaveLength(0);
    expect(findings.some((f) => f.severity === 'pass')).toBe(true);
  });

  it('does not false-positive on identifiers that merely contain "sk-..."', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'aaa-secret-'));
    try {
      await fs.writeFile(
        path.join(tmp, 'identifiers.ts'),
        "export const handler = 'webhook-sk-stripeintegrationhandler';\n",
      );
      const findings = await secretCheck({
        repoPath: tmp,
        stack: {
          framework: 'unknown',
          packageManager: 'unknown',
          scripts: {},
          dependencies: [],
          hasLockfile: false,
          hasEnvExample: false,
          usesNeon: false,
        },
      });
      expect(findings.filter((f) => f.severity === 'blocker')).toHaveLength(0);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
