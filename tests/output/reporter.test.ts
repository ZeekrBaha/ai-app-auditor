import { describe, it, expect } from 'vitest';
import { createStderrReporter } from '../../src/output/reporter.js';
import type { Finding } from '../../src/types.js';

function blocker(): Finding {
  return { checkId: 'x', severity: 'blocker', title: 't', detail: 'd' };
}
function warning(): Finding {
  return { checkId: 'x', severity: 'warning', title: 't', detail: 'd' };
}
function pass(): Finding {
  return { checkId: 'x', severity: 'pass', title: 't', detail: 'd' };
}

describe('createStderrReporter', () => {
  it('prints [n/N] step on start and ✓/✗/⚠ with duration on done', () => {
    const lines: string[] = [];
    const reporter = createStderrReporter({ total: 3, write: (s) => lines.push(s) });

    reporter.start('Project health');
    reporter.done('Project health', [pass()], 12);
    reporter.start('Build');
    reporter.done('Build', [blocker()], 8400);
    reporter.start('Env hygiene');
    reporter.done('Env hygiene', [warning()], 50);

    const joined = lines.join('');
    expect(joined).toContain('[1/3] Project health');
    expect(joined).toContain('[2/3] Build');
    expect(joined).toContain('[3/3] Env hygiene');
    expect(joined).toMatch(/✓.*12ms/);
    expect(joined).toMatch(/✗ 1 blocker.*8\.4s/);
    expect(joined).toMatch(/⚠ 1 warning.*50ms/);
  });

  it('treats all-pass findings as success even when count > 0', () => {
    const lines: string[] = [];
    const reporter = createStderrReporter({ total: 1, write: (s) => lines.push(s) });

    reporter.start('Tests');
    reporter.done('Tests', [pass(), pass()], 100);

    expect(lines.join('')).toMatch(/✓/);
    expect(lines.join('')).not.toMatch(/✗|⚠/);
  });
});
