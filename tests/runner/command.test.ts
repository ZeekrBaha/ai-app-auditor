import { describe, it, expect } from 'vitest';
import { runCommand } from '../../src/runner/command.js';

describe('runCommand', () => {
  it('captures stdout and exit code 0 on success', async () => {
    const result = await runCommand('node -e "console.log(\'hi\')"', {
      cwd: process.cwd(),
      timeoutMs: 5000,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('hi');
    expect(result.timedOut).toBe(false);
  });

  it('captures non-zero exit code', async () => {
    const result = await runCommand('node -e "process.exit(2)"', {
      cwd: process.cwd(),
      timeoutMs: 5000,
    });
    expect(result.exitCode).toBe(2);
    expect(result.timedOut).toBe(false);
  });

  it('reports timeout', async () => {
    const result = await runCommand('node -e "setTimeout(()=>{}, 10000)"', {
      cwd: process.cwd(),
      timeoutMs: 200,
    });
    expect(result.timedOut).toBe(true);
  });

  it('captures stderr', async () => {
    const result = await runCommand('node -e "console.error(\'boom\')"', {
      cwd: process.cwd(),
      timeoutMs: 5000,
    });
    expect(result.stderr.trim()).toBe('boom');
  });
});
