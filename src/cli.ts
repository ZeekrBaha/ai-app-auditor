#!/usr/bin/env node
import { Command } from 'commander';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { runAudit } from './orchestrator.js';
import { writeOutputs } from './output/write.js';
import { exists } from './util/fs.js';

async function main() {
  const program = new Command();
  program
    .name('ai-app-auditor')
    .description('Pre-deploy quality and safety scanner for AI-generated Next.js + Neon apps')
    .option('--path <dir>', 'repo path to scan', '.')
    .option('--smoke', 'also run Playwright smoke test', false)
    .parse(process.argv);

  const opts = program.opts<{ path: string; smoke: boolean }>();
  const repoPath = path.resolve(opts.path);

  if (!process.env.OPENAI_API_KEY) {
    process.stderr.write('OPENAI_API_KEY required. Set it in your shell or .env. See README.\n');
    process.exit(1);
  }

  let stat;
  try {
    stat = await fs.stat(repoPath);
  } catch {
    process.stderr.write(`Path does not exist: ${repoPath}\n`);
    process.exit(1);
  }
  if (!stat.isDirectory()) {
    process.stderr.write(`Path is not a directory: ${repoPath}\n`);
    process.exit(1);
  }
  if (!(await exists(path.join(repoPath, 'package.json')))) {
    process.stderr.write('Not a Node.js project (no package.json found).\n');
    process.exit(1);
  }

  try {
    const report = await runAudit({ repoPath, smoke: opts.smoke });
    const md = await writeOutputs(report, repoPath);
    process.stdout.write(md);
    process.exit(report.verdict === 'ship' ? 0 : 2);
  } catch (err) {
    process.stderr.write(`ai-app-auditor failed: ${(err as Error).message}\n`);
    process.exit(1);
  }
}

main();
