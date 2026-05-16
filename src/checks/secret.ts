import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { Check, Finding } from '../types.js';
import { SKIP_DIRS, walkFiles } from '../util/fs.js';

// Patterns intentionally lack the /g flag — we only call test() per-line, never iterate matches.
const PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: 'OpenAI API key', re: /\bsk-(?:proj-)?[a-zA-Z0-9_-]{40,}/ },
  { name: 'AWS access key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Neon connection string', re: /postgresql:\/\/[^@\s]+@ep-[a-z0-9-]+\.[a-z0-9-]+\.neon\.tech\// },
  { name: 'Stripe live secret key', re: /\bsk_live_[a-zA-Z0-9]{20,}/ },
  { name: 'Stripe live publishable key', re: /\bpk_live_[a-zA-Z0-9]{20,}/ },
];

const TEXT_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md']);

export const secretCheck: Check = async (ctx) => {
  const findings: Finding[] = [];

  for await (const file of walkFiles(
    ctx.repoPath,
    (e) => TEXT_EXTS.has(path.extname(e.name)) || e.name.startsWith('.env'),
    { skipDirs: SKIP_DIRS },
  )) {
    let content: string;
    try {
      content = await fs.readFile(file, 'utf8');
    } catch {
      continue;
    }
    const lines = content.split('\n');
    for (const { name, re } of PATTERNS) {
      for (let i = 0; i < lines.length; i++) {
        if (re.test(lines[i])) {
          const rel = path.relative(ctx.repoPath, file);
          findings.push({
            checkId: 'secret',
            severity: 'blocker',
            title: `${name} found in source`,
            detail: `Possible ${name} at ${rel} line ${i + 1}. Move it to an environment variable.`,
          });
        }
      }
    }
  }

  if (findings.length === 0) {
    findings.push({ checkId: 'secret', severity: 'pass', title: 'No secrets found in source', detail: '' });
  }

  return findings;
};
