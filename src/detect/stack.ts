import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { StackInfo } from '../types.js';

type PackageJson = {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readPackageJson(repoPath: string): Promise<PackageJson> {
  const raw = await fs.readFile(path.join(repoPath, 'package.json'), 'utf8');
  return JSON.parse(raw) as PackageJson;
}

async function detectPackageManager(repoPath: string): Promise<StackInfo['packageManager']> {
  if (await exists(path.join(repoPath, 'pnpm-lock.yaml'))) return 'pnpm';
  if (await exists(path.join(repoPath, 'bun.lockb'))) return 'bun';
  if (await exists(path.join(repoPath, 'yarn.lock'))) return 'yarn';
  if (await exists(path.join(repoPath, 'package-lock.json'))) return 'npm';
  return 'unknown';
}

export async function detectStack(repoPath: string): Promise<StackInfo> {
  const pkg = await readPackageJson(repoPath);
  const dependencies = Object.keys(pkg.dependencies ?? {});
  const framework: StackInfo['framework'] = dependencies.includes('next') ? 'next' : 'unknown';
  const packageManager = await detectPackageManager(repoPath);
  const hasLockfile = packageManager !== 'unknown';
  const hasEnvExample = await exists(path.join(repoPath, '.env.example'));
  const usesNeon = dependencies.includes('@neondatabase/serverless');

  return {
    framework,
    packageManager,
    scripts: pkg.scripts ?? {},
    dependencies,
    hasLockfile,
    hasEnvExample,
    usesNeon,
  };
}
