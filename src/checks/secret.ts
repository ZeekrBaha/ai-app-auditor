import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { Check, Finding } from '../types.js';

const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', '.ai-app-auditor']);

const PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: 'OpenAI API key', re: /sk-[a-zA-Z0-9]{20,}/g },
  { name: 'AWS access key', re: /AKIA[0-9A-Z]{16}/g },
  { name: 'Neon connection string', re: /postgresql:\/\/[^@\s]+@ep-[a-z0-9-]+\.[a-z0-9-]+\.neon\.tech\//g },
  { name: 'Stripe live secret key', re: /sk_live_[a-zA-Z0-9]{20,}/g },
  { name: 'Stripe live publishable key', re: /pk_live_[a-zA-Z0-9]{20,}/g },
];

const TEXT_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.env']);

async function* walk(dir: string): AsyncGenerator<string> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (TEXT_EXTS.has(ext) || entry.name.startsWith('.env')) yield full;
    }
  }
}

export const secretCheck: Check = async (ctx) => {
  const findings: Finding[] = [];

  for await (const file of walk(ctx.repoPath)) {
    let content: string;
    try {
      content = await fs.readFile(file, 'utf8');
    } catch {
      continue;
    }
    const lines = content.split('\n');
    for (const { name, re } of PATTERNS) {
      for (let i = 0; i < lines.length; i++) {
        re.lastIndex = 0;
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
