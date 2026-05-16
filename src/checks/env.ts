import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { Check, Finding } from '../types.js';
import { SKIP_DIRS, walkFiles } from '../util/fs.js';

const TEXT_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const RISKY_SUFFIXES = ['KEY', 'SECRET', 'TOKEN', 'PASSWORD'];

const PROCESS_ENV_RE = /process\.env\.([A-Z][A-Z0-9_]+)/g;

async function readEnvExampleKeys(repoPath: string): Promise<Set<string>> {
  try {
    const raw = await fs.readFile(path.join(repoPath, '.env.example'), 'utf8');
    const keys = raw
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#') && l.includes('='))
      .map((l) => l.split('=')[0].trim());
    return new Set(keys);
  } catch {
    return new Set();
  }
}

export const envCheck: Check = async (ctx) => {
  const used = new Set<string>();
  for await (const file of walkFiles(
    ctx.repoPath,
    (e) => TEXT_EXTS.has(path.extname(e.name)),
    { skipDirs: SKIP_DIRS },
  )) {
    let content: string;
    try {
      content = await fs.readFile(file, 'utf8');
    } catch {
      continue;
    }
    PROCESS_ENV_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = PROCESS_ENV_RE.exec(content)) !== null) used.add(m[1]);
  }

  const documented = await readEnvExampleKeys(ctx.repoPath);
  const findings: Finding[] = [];

  for (const v of used) {
    if (v.startsWith('NEXT_PUBLIC_') && RISKY_SUFFIXES.some((s) => v.endsWith(s) || v.includes(`_${s}_`))) {
      findings.push({
        checkId: 'env',
        severity: 'blocker',
        title: `Risky public env var: ${v}`,
        detail: `\`${v}\` looks like a secret but is exposed to the client because it starts with NEXT_PUBLIC_. Rename or move to server-only.`,
      });
      continue;
    }
    if (!documented.has(v)) {
      findings.push({
        checkId: 'env',
        severity: 'warning',
        title: `Document \`${v}\` in .env.example`,
        detail: `\`${v}\` is referenced in source but not declared in .env.example.`,
      });
    }
  }

  if (findings.length === 0) {
    findings.push({ checkId: 'env', severity: 'pass', title: 'All env vars documented', detail: '' });
  }

  return findings;
};
