import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { Report } from '../types.js';
import { renderMarkdown } from './markdown.js';
import { renderJson } from './json.js';

export async function writeOutputs(report: Report, repoPath: string): Promise<string> {
  const outDir = path.join(repoPath, '.ai-app-auditor');
  await fs.mkdir(outDir, { recursive: true });
  const md = renderMarkdown(report);
  const json = renderJson(report);
  await fs.writeFile(path.join(outDir, 'report.md'), md, 'utf8');
  await fs.writeFile(path.join(outDir, 'report.json'), json, 'utf8');
  return md;
}
