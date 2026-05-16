import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { detectStack } from '../../src/detect/stack.js';

const FIXTURE = path.resolve(__dirname, '../../fixtures/good-next-neon');

describe('detectStack', () => {
  it('detects Next.js framework', async () => {
    const stack = await detectStack(FIXTURE);
    expect(stack.framework).toBe('next');
  });

  it('detects pnpm package manager when pnpm-lock.yaml present', async () => {
    const stack = await detectStack(FIXTURE);
    expect(stack.packageManager).toBe('pnpm');
  });

  it('returns scripts from package.json', async () => {
    const stack = await detectStack(FIXTURE);
    expect(stack.scripts.build).toBe('next build');
    expect(stack.scripts.lint).toBe('next lint');
  });

  it('lists prod dependencies', async () => {
    const stack = await detectStack(FIXTURE);
    expect(stack.dependencies).toContain('next');
    expect(stack.dependencies).toContain('@neondatabase/serverless');
  });

  it('flags hasLockfile and hasEnvExample', async () => {
    const stack = await detectStack(FIXTURE);
    expect(stack.hasLockfile).toBe(true);
    expect(stack.hasEnvExample).toBe(true);
  });

  it('sets usesNeon true when @neondatabase/serverless is a dep', async () => {
    const stack = await detectStack(FIXTURE);
    expect(stack.usesNeon).toBe(true);
  });
});
