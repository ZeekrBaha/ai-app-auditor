# ai-app-auditor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TypeScript CLI (`npx ai-app-auditor`) that scans an AI-generated Next.js + Neon app, runs deterministic checks, asks OpenAI `gpt-4o-mini` to summarize the findings, and produces a ship / do-not-ship verdict with prioritized fixes.

**Architecture:** Pure-function pipeline — `detectStack` → `runChecks` (8 checks, all pure async functions returning `Finding[]`) → optional `runSmokeTest` (Playwright, behind `--smoke`) → deterministic score/verdict → `aiReportWriter` (single OpenAI call) → `writeOutputs` (Markdown + JSON in `.ai-app-auditor/`). Strict TDD throughout: every behavior gets a failing test first.

**Tech Stack:** TypeScript (Node 20+), pnpm, Vitest, OpenAI SDK (`gpt-4o-mini`), Playwright (chromium, opt-in), `commander` for arg parsing, `execa` for child processes.

---

## File Structure

**Project root:** `/Users/baha/Desktop/llm-ai-projects/ai-app-auditor/`

| File | Responsibility |
|---|---|
| `package.json` | Deps, scripts, `bin` entry |
| `tsconfig.json` | Strict TS config |
| `vitest.config.ts` | Test runner config (exclude smoke by default) |
| `.gitignore` | `node_modules`, `dist`, `.ai-app-auditor`, `.env` |
| `README.md` | Usage, install, `OPENAI_API_KEY` requirement |
| `src/types.ts` | All shared types (`StackInfo`, `Finding`, `Check`, `Report`, `CheckContext`) |
| `src/runner/command.ts` | Timeout-wrapped child-process exec |
| `src/detect/stack.ts` | `detectStack(repoPath)` — reads `package.json`, lockfile presence, deps |
| `src/checks/health.ts` | Lockfile / README / .env.example / package.json / tsconfig.json checks |
| `src/checks/build.ts` | Runs `pnpm build` via `runCommand` |
| `src/checks/lint.ts` | Runs lint script via `runCommand` |
| `src/checks/test.ts` | Runs test script via `runCommand` |
| `src/checks/secret.ts` | Regex scan for OpenAI/AWS/Neon/Stripe keys |
| `src/checks/env.ts` | `process.env.X` references vs `.env.example` diff |
| `src/checks/neon.ts` | Neon-specific: `DATABASE_URL` in example, migrations, route auth |
| `src/checks/route.ts` | Next.js App Router `/admin` and `/dashboard` protection |
| `src/smoke/playwright.ts` | Dev-server boot + homepage + common routes (only `--smoke`) |
| `src/score.ts` | Deterministic verdict + score from `Finding[]` |
| `src/ai/reportWriter.ts` | Single OpenAI structured-output call; merges with deterministic fields |
| `src/output/markdown.ts` | `Report` → Markdown string |
| `src/output/json.ts` | `Report` → JSON string |
| `src/output/write.ts` | Writes both files to `.ai-app-auditor/`, prints Markdown to stdout |
| `src/orchestrator.ts` | Composes the full pipeline (called by CLI and integration tests) |
| `src/cli.ts` | Arg parsing, exit codes, top-level error handling |
| `tests/**/*.test.ts` | Mirrors `src/` |
| `fixtures/good-next-neon/` | Clean reference fixture |
| `fixtures/broken-build/` | Build script exits non-zero |
| `fixtures/leaked-secret/` | Has `sk-...` in source |
| `fixtures/missing-env/` | Uses `process.env.FOO`, empty `.env.example` |
| `fixtures/public-admin/` | `app/admin/page.tsx` + no middleware |
| `fixtures/neon-noauth/` | Neon import in route, no auth import |

---

## Task 1: Project skeleton + tooling

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `src/index.ts` (placeholder)
- Create: `tests/smoke.test.ts` (single sanity test to prove vitest works)

- [ ] **Step 1: Verify Node version**

Run: `node --version`
Expected: `v20.x.x` or higher. If not, install Node 20+ before continuing.

- [ ] **Step 2: Verify pnpm is installed**

Run: `pnpm --version`
Expected: any version. If not installed: `npm install -g pnpm`.

- [ ] **Step 3: Write `package.json`**

```json
{
  "name": "ai-app-auditor",
  "version": "0.0.1",
  "description": "Pre-deploy quality and safety scanner for AI-generated Next.js + Neon apps",
  "type": "module",
  "bin": {
    "ai-app-auditor": "./dist/cli.js"
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run --exclude 'tests/smoke/**'",
    "test:watch": "vitest --exclude 'tests/smoke/**'",
    "test:smoke": "vitest run tests/smoke",
    "typecheck": "tsc --noEmit",
    "start": "node dist/cli.js"
  },
  "dependencies": {
    "commander": "^12.1.0",
    "execa": "^9.5.1",
    "openai": "^4.77.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "playwright": "^1.49.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  },
  "engines": {
    "node": ">=20"
  }
}
```

- [ ] **Step 4: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": false,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests", "fixtures"]
}
```

- [ ] **Step 5: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/smoke/**', 'node_modules', 'dist'],
    testTimeout: 10000,
  },
});
```

- [ ] **Step 6: Write `.gitignore`**

```
node_modules
dist
.ai-app-auditor
.env
.env.local
*.log
.DS_Store
```

- [ ] **Step 7: Write placeholder `src/index.ts`**

```ts
export const version = '0.0.1';
```

- [ ] **Step 8: Write `tests/smoke.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { version } from '../src/index.js';

describe('toolchain sanity', () => {
  it('imports from src and runs a test', () => {
    expect(version).toBe('0.0.1');
  });
});
```

- [ ] **Step 9: Install dependencies**

Run: `pnpm install`
Expected: lockfile created, `node_modules/` populated, no errors.

- [ ] **Step 10: Run the sanity test**

Run: `pnpm test`
Expected: 1 test passes.

- [ ] **Step 11: Run typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 12: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts .gitignore src/ tests/ pnpm-lock.yaml
git commit -m "chore: scaffold ai-app-auditor with TS + Vitest"
```

---

## Task 2: Shared types

**Files:**
- Create: `src/types.ts`
- Create: `tests/types.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/types.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import type { StackInfo, Finding, CheckContext, Report } from '../src/types.js';

describe('shared types', () => {
  it('Finding has the expected severity union', () => {
    const f: Finding = {
      checkId: 'demo',
      severity: 'blocker',
      title: 't',
      detail: 'd',
    };
    expect(f.severity).toBe('blocker');
  });

  it('StackInfo carries framework + packageManager', () => {
    const s: StackInfo = {
      framework: 'next',
      packageManager: 'pnpm',
      scripts: { build: 'next build' },
      dependencies: ['next'],
      hasLockfile: true,
      hasEnvExample: false,
      usesNeon: false,
    };
    expect(s.framework).toBe('next');
  });

  it('Report carries verdict + score + AI fields', () => {
    const r: Report = {
      verdict: 'ship',
      score: 100,
      blockers: [],
      warnings: [],
      passed: [],
      summary: '',
      fixOrder: [],
      generatedAt: new Date().toISOString(),
    };
    expect(r.verdict).toBe('ship');
  });

  it('CheckContext bundles repoPath and stack', () => {
    const ctx: CheckContext = {
      repoPath: '/tmp',
      stack: {
        framework: 'next',
        packageManager: 'pnpm',
        scripts: {},
        dependencies: [],
        hasLockfile: false,
        hasEnvExample: false,
        usesNeon: false,
      },
    };
    expect(ctx.repoPath).toBe('/tmp');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test tests/types.test.ts`
Expected: FAIL — `Cannot find module '../src/types.js'`.

- [ ] **Step 3: Write `src/types.ts`**

```ts
export type StackInfo = {
  framework: 'next' | 'unknown';
  packageManager: 'pnpm' | 'npm' | 'yarn' | 'bun' | 'unknown';
  scripts: Record<string, string>;
  dependencies: string[];
  hasLockfile: boolean;
  hasEnvExample: boolean;
  usesNeon: boolean;
};

export type CheckContext = {
  repoPath: string;
  stack: StackInfo;
};

export type Finding = {
  checkId: string;
  severity: 'blocker' | 'warning' | 'pass';
  title: string;
  detail: string;
  evidence?: string;
};

export type Check = (ctx: CheckContext) => Promise<Finding[]>;

export type Report = {
  verdict: 'ship' | 'do-not-ship';
  score: number;
  blockers: Finding[];
  warnings: Finding[];
  passed: Finding[];
  summary: string;
  fixOrder: string[];
  generatedAt: string;
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test tests/types.test.ts`
Expected: 4 tests pass.

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts tests/types.test.ts
git commit -m "feat(types): add shared StackInfo, Finding, Report types"
```

---

## Task 3: `runCommand` — timeout-wrapped child-process exec

**Files:**
- Create: `src/runner/command.ts`
- Create: `tests/runner/command.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/runner/command.test.ts`:
```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test tests/runner/command.test.ts`
Expected: FAIL — `Cannot find module`.

- [ ] **Step 3: Implement `src/runner/command.ts`**

```ts
import { execa } from 'execa';

export type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};

export type CommandOptions = {
  cwd: string;
  timeoutMs: number;
};

export async function runCommand(cmd: string, opts: CommandOptions): Promise<CommandResult> {
  try {
    const result = await execa(cmd, {
      cwd: opts.cwd,
      timeout: opts.timeoutMs,
      shell: true,
      reject: false,
    });
    return {
      exitCode: typeof result.exitCode === 'number' ? result.exitCode : 1,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      timedOut: Boolean(result.timedOut),
    };
  } catch (err: unknown) {
    const e = err as { timedOut?: boolean; exitCode?: number; stdout?: string; stderr?: string };
    return {
      exitCode: typeof e.exitCode === 'number' ? e.exitCode : 1,
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? String(err),
      timedOut: Boolean(e.timedOut),
    };
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test tests/runner/command.test.ts`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/runner/command.ts tests/runner/command.test.ts
git commit -m "feat(runner): timeout-wrapped runCommand via execa"
```

---

## Task 4: Build the `good-next-neon` fixture

**Files:**
- Create: `fixtures/good-next-neon/package.json`
- Create: `fixtures/good-next-neon/tsconfig.json`
- Create: `fixtures/good-next-neon/.env.example`
- Create: `fixtures/good-next-neon/README.md`
- Create: `fixtures/good-next-neon/pnpm-lock.yaml` (empty file, presence only)
- Create: `fixtures/good-next-neon/middleware.ts`
- Create: `fixtures/good-next-neon/app/page.tsx`
- Create: `fixtures/good-next-neon/app/admin/page.tsx`
- Create: `fixtures/good-next-neon/app/api/users/route.ts`

- [ ] **Step 1: Create directory structure**

Run: `mkdir -p fixtures/good-next-neon/app/admin fixtures/good-next-neon/app/api/users`
Expected: directories exist.

- [ ] **Step 2: Write `fixtures/good-next-neon/package.json`**

```json
{
  "name": "good-next-neon",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "lint": "next lint",
    "test": "vitest run"
  },
  "dependencies": {
    "next": "15.0.0",
    "react": "19.0.0",
    "react-dom": "19.0.0",
    "@neondatabase/serverless": "0.10.0"
  },
  "devDependencies": {
    "typescript": "5.7.0"
  }
}
```

- [ ] **Step 3: Write `fixtures/good-next-neon/tsconfig.json`**

```json
{ "compilerOptions": { "target": "ES2022", "strict": true } }
```

- [ ] **Step 4: Write `fixtures/good-next-neon/.env.example`**

```
DATABASE_URL=
NEXT_PUBLIC_APP_NAME=
```

- [ ] **Step 5: Write `fixtures/good-next-neon/README.md`**

```md
# good-next-neon fixture

Reference clean Next.js + Neon app for ai-app-auditor tests.
```

- [ ] **Step 6: Create empty lockfile**

Run: `touch fixtures/good-next-neon/pnpm-lock.yaml`
Expected: file exists.

- [ ] **Step 7: Write `fixtures/good-next-neon/middleware.ts`**

```ts
import { NextResponse } from 'next/server';

export function middleware() {
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/dashboard/:path*'],
};
```

- [ ] **Step 8: Write `fixtures/good-next-neon/app/page.tsx`**

```tsx
export default function HomePage() {
  const name = process.env.NEXT_PUBLIC_APP_NAME ?? 'App';
  return <h1>{name}</h1>;
}
```

- [ ] **Step 9: Write `fixtures/good-next-neon/app/admin/page.tsx`**

```tsx
export default function AdminPage() {
  return <h1>Admin</h1>;
}
```

- [ ] **Step 10: Write `fixtures/good-next-neon/app/api/users/route.ts`**

```ts
import { neon } from '@neondatabase/serverless';
import { auth } from '../../../lib/auth';

export async function GET() {
  await auth();
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`select 1`;
  return Response.json(rows);
}
```

- [ ] **Step 11: Commit**

```bash
git add fixtures/good-next-neon
git commit -m "test: add good-next-neon fixture (clean reference)"
```

---

## Task 5: `detectStack`

**Files:**
- Create: `src/detect/stack.ts`
- Create: `tests/detect/stack.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/detect/stack.test.ts`:
```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test tests/detect/stack.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/detect/stack.ts`**

```ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test tests/detect/stack.test.ts`
Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/detect/stack.ts tests/detect/stack.test.ts
git commit -m "feat(detect): detectStack reads framework, pm, scripts, deps"
```

---

## Task 6: `healthCheck`

**Files:**
- Create: `src/checks/health.ts`
- Create: `tests/checks/health.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/checks/health.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { healthCheck } from '../../src/checks/health.js';
import { detectStack } from '../../src/detect/stack.js';
import type { CheckContext } from '../../src/types.js';

const GOOD = path.resolve(__dirname, '../../fixtures/good-next-neon');

async function ctx(repoPath: string): Promise<CheckContext> {
  return { repoPath, stack: await detectStack(repoPath) };
}

describe('healthCheck', () => {
  it('passes for the good-next-neon fixture (lockfile + env.example + README + package.json + tsconfig)', async () => {
    const findings = await healthCheck(await ctx(GOOD));
    const titles = findings.map((f) => f.title);
    expect(titles).toContain('package.json present');
    expect(titles).toContain('tsconfig.json present');
    expect(findings.filter((f) => f.severity === 'warning')).toHaveLength(0);
  });

  it('every finding has the checkId "health"', async () => {
    const findings = await healthCheck(await ctx(GOOD));
    for (const f of findings) expect(f.checkId).toBe('health');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test tests/checks/health.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/checks/health.ts`**

```ts
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { Check, Finding } from '../types.js';

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export const healthCheck: Check = async (ctx) => {
  const findings: Finding[] = [];

  if (!ctx.stack.hasLockfile) {
    findings.push({
      checkId: 'health',
      severity: 'warning',
      title: 'Missing lockfile',
      detail: 'No pnpm-lock.yaml / package-lock.json / yarn.lock / bun.lockb found. Run your package manager install to create one.',
    });
  }

  if (!ctx.stack.hasEnvExample) {
    findings.push({
      checkId: 'health',
      severity: 'warning',
      title: 'Missing .env.example',
      detail: 'Add a .env.example documenting required environment variables.',
    });
  }

  if (!(await exists(path.join(ctx.repoPath, 'README.md')))) {
    findings.push({
      checkId: 'health',
      severity: 'warning',
      title: 'Missing README',
      detail: 'Add a README.md describing the project.',
    });
  }

  if (await exists(path.join(ctx.repoPath, 'package.json'))) {
    findings.push({ checkId: 'health', severity: 'pass', title: 'package.json present', detail: '' });
  }

  if (await exists(path.join(ctx.repoPath, 'tsconfig.json'))) {
    findings.push({ checkId: 'health', severity: 'pass', title: 'tsconfig.json present', detail: '' });
  }

  return findings;
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test tests/checks/health.test.ts`
Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/checks/health.ts tests/checks/health.test.ts
git commit -m "feat(checks): healthCheck for lockfile, README, env.example, tsconfig"
```

---

## Task 7: Build the `broken-build` fixture

**Files:**
- Create: `fixtures/broken-build/package.json`
- Create: `fixtures/broken-build/README.md`
- Create: `fixtures/broken-build/.env.example`
- Create: `fixtures/broken-build/pnpm-lock.yaml`

- [ ] **Step 1: Create directory**

Run: `mkdir -p fixtures/broken-build`

- [ ] **Step 2: Write `fixtures/broken-build/package.json`**

The `build` script intentionally exits 1, the `lint` script intentionally exits 1, and `test` intentionally exits 1 — this fixture is for asserting failure paths.

```json
{
  "name": "broken-build",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "build": "node -e \"console.error('build broke'); process.exit(1)\"",
    "lint": "node -e \"console.error('lint broke'); process.exit(1)\"",
    "test": "node -e \"console.error('tests failed'); process.exit(1)\""
  },
  "dependencies": {
    "next": "15.0.0"
  }
}
```

- [ ] **Step 3: Write `fixtures/broken-build/README.md`**

```md
# broken-build fixture
```

- [ ] **Step 4: Write `fixtures/broken-build/.env.example`**

```
NEXT_PUBLIC_APP_NAME=
```

- [ ] **Step 5: Create empty lockfile**

Run: `touch fixtures/broken-build/pnpm-lock.yaml`

- [ ] **Step 6: Commit**

```bash
git add fixtures/broken-build
git commit -m "test: add broken-build fixture (build/lint/test exit non-zero)"
```

---

## Task 8: `buildCheck`, `lintCheck`, `testCheck`

These three are structurally identical (only timeout, script name, severity-on-fail differ). We implement and test them together, with `runCommand` injected so we don't actually exec inside unit tests.

**Files:**
- Create: `src/checks/build.ts`
- Create: `src/checks/lint.ts`
- Create: `src/checks/test.ts`
- Create: `tests/checks/build.test.ts`
- Create: `tests/checks/lint.test.ts`
- Create: `tests/checks/test.test.ts`

- [ ] **Step 1: Write the failing build test**

`tests/checks/build.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { buildCheck } from '../../src/checks/build.js';
import type { CheckContext } from '../../src/types.js';

function ctx(scripts: Record<string, string>): CheckContext {
  return {
    repoPath: '/tmp',
    stack: {
      framework: 'next',
      packageManager: 'pnpm',
      scripts,
      dependencies: [],
      hasLockfile: true,
      hasEnvExample: false,
      usesNeon: false,
    },
  };
}

describe('buildCheck', () => {
  it('returns warning when build script missing', async () => {
    const run = vi.fn();
    const findings = await buildCheck(ctx({}), { runCommand: run });
    expect(run).not.toHaveBeenCalled();
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('warning');
    expect(findings[0].title).toBe('No build script defined');
  });

  it('returns pass when build exits 0', async () => {
    const run = vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '', timedOut: false });
    const findings = await buildCheck(ctx({ build: 'next build' }), { runCommand: run });
    expect(findings[0].severity).toBe('pass');
    expect(findings[0].title).toBe('Build succeeded');
  });

  it('returns blocker when build exits non-zero, with last 40 lines of stderr', async () => {
    const stderr = Array.from({ length: 60 }, (_, i) => `line ${i}`).join('\n');
    const run = vi.fn().mockResolvedValue({ exitCode: 1, stdout: '', stderr, timedOut: false });
    const findings = await buildCheck(ctx({ build: 'next build' }), { runCommand: run });
    expect(findings[0].severity).toBe('blocker');
    expect(findings[0].title).toBe('Build failed');
    const lines = (findings[0].evidence ?? '').split('\n');
    expect(lines).toHaveLength(40);
    expect(lines[39]).toBe('line 59');
  });

  it('returns blocker when build times out', async () => {
    const run = vi.fn().mockResolvedValue({ exitCode: 1, stdout: '', stderr: '', timedOut: true });
    const findings = await buildCheck(ctx({ build: 'next build' }), { runCommand: run });
    expect(findings[0].severity).toBe('blocker');
    expect(findings[0].title).toBe('Build exceeded 120s');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test tests/checks/build.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/checks/build.ts`**

```ts
import type { Check, Finding } from '../types.js';
import { runCommand as defaultRunCommand, type CommandResult } from '../runner/command.js';

type Deps = {
  runCommand?: (cmd: string, opts: { cwd: string; timeoutMs: number }) => Promise<CommandResult>;
};

function lastNLines(s: string, n: number): string {
  return s.split('\n').slice(-n).join('\n');
}

export const buildCheck = (async (ctx, deps: Deps = {}) => {
  const run = deps.runCommand ?? defaultRunCommand;
  const findings: Finding[] = [];

  if (!ctx.stack.scripts.build) {
    findings.push({
      checkId: 'build',
      severity: 'warning',
      title: 'No build script defined',
      detail: 'Add a "build" script to package.json so the project can be deployed.',
    });
    return findings;
  }

  const result = await run(`${ctx.stack.packageManager} run build`, {
    cwd: ctx.repoPath,
    timeoutMs: 120_000,
  });

  if (result.timedOut) {
    findings.push({
      checkId: 'build',
      severity: 'blocker',
      title: 'Build exceeded 120s',
      detail: 'The build command did not complete within 120 seconds.',
    });
    return findings;
  }

  if (result.exitCode !== 0) {
    findings.push({
      checkId: 'build',
      severity: 'blocker',
      title: 'Build failed',
      detail: 'Production build exited with a non-zero status.',
      evidence: lastNLines(result.stderr || result.stdout, 40),
    });
    return findings;
  }

  findings.push({ checkId: 'build', severity: 'pass', title: 'Build succeeded', detail: '' });
  return findings;
}) as Check & ((ctx: import('../types.js').CheckContext, deps?: Deps) => Promise<Finding[]>);
```

- [ ] **Step 4: Run to verify build tests pass**

Run: `pnpm test tests/checks/build.test.ts`
Expected: 4 tests pass.

- [ ] **Step 5: Write the failing lint test**

`tests/checks/lint.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { lintCheck } from '../../src/checks/lint.js';
import type { CheckContext } from '../../src/types.js';

function ctx(scripts: Record<string, string>): CheckContext {
  return {
    repoPath: '/tmp',
    stack: {
      framework: 'next',
      packageManager: 'pnpm',
      scripts,
      dependencies: [],
      hasLockfile: true,
      hasEnvExample: false,
      usesNeon: false,
    },
  };
}

describe('lintCheck', () => {
  it('warning when lint script missing', async () => {
    const findings = await lintCheck(ctx({}), { runCommand: vi.fn() });
    expect(findings[0].severity).toBe('warning');
    expect(findings[0].title).toBe('No lint script defined');
  });

  it('pass on exit 0', async () => {
    const run = vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '', timedOut: false });
    const findings = await lintCheck(ctx({ lint: 'next lint' }), { runCommand: run });
    expect(findings[0].severity).toBe('pass');
  });

  it('warning on non-zero (NOT blocker)', async () => {
    const run = vi.fn().mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'oops', timedOut: false });
    const findings = await lintCheck(ctx({ lint: 'next lint' }), { runCommand: run });
    expect(findings[0].severity).toBe('warning');
    expect(findings[0].title).toBe('Lint failed');
  });

  it('warning on timeout', async () => {
    const run = vi.fn().mockResolvedValue({ exitCode: 1, stdout: '', stderr: '', timedOut: true });
    const findings = await lintCheck(ctx({ lint: 'next lint' }), { runCommand: run });
    expect(findings[0].severity).toBe('warning');
    expect(findings[0].title).toBe('Lint exceeded 60s');
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `pnpm test tests/checks/lint.test.ts`
Expected: FAIL.

- [ ] **Step 7: Implement `src/checks/lint.ts`**

```ts
import type { Check, Finding } from '../types.js';
import { runCommand as defaultRunCommand, type CommandResult } from '../runner/command.js';

type Deps = {
  runCommand?: (cmd: string, opts: { cwd: string; timeoutMs: number }) => Promise<CommandResult>;
};

function lastNLines(s: string, n: number): string {
  return s.split('\n').slice(-n).join('\n');
}

export const lintCheck = (async (ctx, deps: Deps = {}) => {
  const run = deps.runCommand ?? defaultRunCommand;
  const findings: Finding[] = [];

  if (!ctx.stack.scripts.lint) {
    findings.push({
      checkId: 'lint',
      severity: 'warning',
      title: 'No lint script defined',
      detail: 'Add a "lint" script so lint issues are caught before deploy.',
    });
    return findings;
  }

  const result = await run(`${ctx.stack.packageManager} run lint`, {
    cwd: ctx.repoPath,
    timeoutMs: 60_000,
  });

  if (result.timedOut) {
    findings.push({ checkId: 'lint', severity: 'warning', title: 'Lint exceeded 60s', detail: '' });
    return findings;
  }

  if (result.exitCode !== 0) {
    findings.push({
      checkId: 'lint',
      severity: 'warning',
      title: 'Lint failed',
      detail: 'Lint reported issues.',
      evidence: lastNLines(result.stderr || result.stdout, 40),
    });
    return findings;
  }

  findings.push({ checkId: 'lint', severity: 'pass', title: 'Lint passed', detail: '' });
  return findings;
}) as Check & ((ctx: import('../types.js').CheckContext, deps?: Deps) => Promise<Finding[]>);
```

- [ ] **Step 8: Run to verify lint tests pass**

Run: `pnpm test tests/checks/lint.test.ts`
Expected: 4 tests pass.

- [ ] **Step 9: Write the failing test test**

`tests/checks/test.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { testCheck } from '../../src/checks/test.js';
import type { CheckContext } from '../../src/types.js';

function ctx(scripts: Record<string, string>): CheckContext {
  return {
    repoPath: '/tmp',
    stack: {
      framework: 'next',
      packageManager: 'pnpm',
      scripts,
      dependencies: [],
      hasLockfile: true,
      hasEnvExample: false,
      usesNeon: false,
    },
  };
}

describe('testCheck', () => {
  it('warning when test script missing', async () => {
    const findings = await testCheck(ctx({}), { runCommand: vi.fn() });
    expect(findings[0].severity).toBe('warning');
    expect(findings[0].title).toBe('No tests defined');
  });

  it('pass on exit 0', async () => {
    const run = vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '', timedOut: false });
    const findings = await testCheck(ctx({ test: 'vitest run' }), { runCommand: run });
    expect(findings[0].severity).toBe('pass');
  });

  it('blocker on non-zero', async () => {
    const run = vi.fn().mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'fail', timedOut: false });
    const findings = await testCheck(ctx({ test: 'vitest run' }), { runCommand: run });
    expect(findings[0].severity).toBe('blocker');
    expect(findings[0].title).toBe('Tests failed');
  });

  it('blocker on timeout', async () => {
    const run = vi.fn().mockResolvedValue({ exitCode: 1, stdout: '', stderr: '', timedOut: true });
    const findings = await testCheck(ctx({ test: 'vitest run' }), { runCommand: run });
    expect(findings[0].severity).toBe('blocker');
    expect(findings[0].title).toBe('Tests exceeded 180s');
  });
});
```

- [ ] **Step 10: Run to verify it fails**

Run: `pnpm test tests/checks/test.test.ts`
Expected: FAIL.

- [ ] **Step 11: Implement `src/checks/test.ts`**

```ts
import type { Check, Finding } from '../types.js';
import { runCommand as defaultRunCommand, type CommandResult } from '../runner/command.js';

type Deps = {
  runCommand?: (cmd: string, opts: { cwd: string; timeoutMs: number }) => Promise<CommandResult>;
};

function lastNLines(s: string, n: number): string {
  return s.split('\n').slice(-n).join('\n');
}

export const testCheck = (async (ctx, deps: Deps = {}) => {
  const run = deps.runCommand ?? defaultRunCommand;
  const findings: Finding[] = [];

  if (!ctx.stack.scripts.test) {
    findings.push({
      checkId: 'test',
      severity: 'warning',
      title: 'No tests defined',
      detail: 'Add a "test" script so regressions are caught before deploy.',
    });
    return findings;
  }

  const result = await run(`${ctx.stack.packageManager} run test`, {
    cwd: ctx.repoPath,
    timeoutMs: 180_000,
  });

  if (result.timedOut) {
    findings.push({ checkId: 'test', severity: 'blocker', title: 'Tests exceeded 180s', detail: '' });
    return findings;
  }

  if (result.exitCode !== 0) {
    findings.push({
      checkId: 'test',
      severity: 'blocker',
      title: 'Tests failed',
      detail: 'The test suite exited non-zero.',
      evidence: lastNLines(result.stderr || result.stdout, 40),
    });
    return findings;
  }

  findings.push({ checkId: 'test', severity: 'pass', title: 'Tests passed', detail: '' });
  return findings;
}) as Check & ((ctx: import('../types.js').CheckContext, deps?: Deps) => Promise<Finding[]>);
```

- [ ] **Step 12: Run all check tests**

Run: `pnpm test`
Expected: all tests pass (health + build + lint + test + runner + types + sanity).

- [ ] **Step 13: Commit**

```bash
git add src/checks/build.ts src/checks/lint.ts src/checks/test.ts tests/checks/build.test.ts tests/checks/lint.test.ts tests/checks/test.test.ts
git commit -m "feat(checks): buildCheck, lintCheck, testCheck with timeouts + severity rules"
```

---

## Task 9: Build the `leaked-secret` fixture and `secretCheck`

**Files:**
- Create: `fixtures/leaked-secret/package.json`
- Create: `fixtures/leaked-secret/README.md`
- Create: `fixtures/leaked-secret/.env.example`
- Create: `fixtures/leaked-secret/pnpm-lock.yaml`
- Create: `fixtures/leaked-secret/src/openai.ts`
- Create: `src/checks/secret.ts`
- Create: `tests/checks/secret.test.ts`

- [ ] **Step 1: Create directories and fixture files**

Run: `mkdir -p fixtures/leaked-secret/src && touch fixtures/leaked-secret/pnpm-lock.yaml`

- [ ] **Step 2: Write `fixtures/leaked-secret/package.json`**

```json
{
  "name": "leaked-secret",
  "version": "0.0.0",
  "private": true,
  "dependencies": { "next": "15.0.0" }
}
```

- [ ] **Step 3: Write `fixtures/leaked-secret/README.md`**

```md
# leaked-secret fixture
```

- [ ] **Step 4: Write `fixtures/leaked-secret/.env.example`**

```
OPENAI_API_KEY=
```

- [ ] **Step 5: Write `fixtures/leaked-secret/src/openai.ts`** (intentional fake key)

```ts
export const KEY = 'sk-FAKEFAKEFAKEFAKEFAKE1234567890';
```

- [ ] **Step 6: Write the failing test**

`tests/checks/secret.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
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
    expect(all).not.toContain('FAKEFAKEFAKEFAKEFAKE1234567890');
  });

  it('reports a pass for the good-next-neon fixture', async () => {
    const findings = await secretCheck(await ctx(GOOD));
    const blockers = findings.filter((f) => f.severity === 'blocker');
    expect(blockers).toHaveLength(0);
    expect(findings.some((f) => f.severity === 'pass')).toBe(true);
  });
});
```

- [ ] **Step 7: Run to verify it fails**

Run: `pnpm test tests/checks/secret.test.ts`
Expected: FAIL.

- [ ] **Step 8: Implement `src/checks/secret.ts`**

```ts
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
```

- [ ] **Step 9: Run to verify it passes**

Run: `pnpm test tests/checks/secret.test.ts`
Expected: 3 tests pass.

- [ ] **Step 10: Commit**

```bash
git add fixtures/leaked-secret src/checks/secret.ts tests/checks/secret.test.ts
git commit -m "feat(checks): secretCheck scans for OpenAI/AWS/Neon/Stripe keys"
```

---

## Task 10: Build the `missing-env` fixture and `envCheck`

**Files:**
- Create: `fixtures/missing-env/package.json`
- Create: `fixtures/missing-env/README.md`
- Create: `fixtures/missing-env/.env.example` (empty)
- Create: `fixtures/missing-env/pnpm-lock.yaml`
- Create: `fixtures/missing-env/app/page.tsx`
- Create: `fixtures/missing-env/app/leaked/page.tsx`
- Create: `src/checks/env.ts`
- Create: `tests/checks/env.test.ts`

- [ ] **Step 1: Create directories and fixture files**

Run: `mkdir -p fixtures/missing-env/app/leaked && touch fixtures/missing-env/pnpm-lock.yaml fixtures/missing-env/.env.example`

- [ ] **Step 2: Write `fixtures/missing-env/package.json`**

```json
{
  "name": "missing-env",
  "version": "0.0.0",
  "private": true,
  "dependencies": { "next": "15.0.0" }
}
```

- [ ] **Step 3: Write `fixtures/missing-env/README.md`**

```md
# missing-env fixture
```

- [ ] **Step 4: Write `fixtures/missing-env/app/page.tsx`**

```tsx
export default function Home() {
  const url = process.env.DATABASE_URL;
  const name = process.env.UNDOCUMENTED_VAR;
  return <pre>{url}{name}</pre>;
}
```

- [ ] **Step 5: Write `fixtures/missing-env/app/leaked/page.tsx`** (intentional NEXT_PUBLIC_*_SECRET name)

```tsx
export default function Leaked() {
  return <p>{process.env.NEXT_PUBLIC_STRIPE_SECRET}</p>;
}
```

- [ ] **Step 6: Write the failing test**

`tests/checks/env.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { envCheck } from '../../src/checks/env.js';
import { detectStack } from '../../src/detect/stack.js';
import type { CheckContext } from '../../src/types.js';

const MISSING = path.resolve(__dirname, '../../fixtures/missing-env');
const GOOD = path.resolve(__dirname, '../../fixtures/good-next-neon');

async function ctx(repoPath: string): Promise<CheckContext> {
  return { repoPath, stack: await detectStack(repoPath) };
}

describe('envCheck', () => {
  it('warns for each var used in source but missing from .env.example', async () => {
    const findings = await envCheck(await ctx(MISSING));
    const titles = findings.map((f) => f.title);
    expect(titles).toContain('Document `DATABASE_URL` in .env.example');
    expect(titles).toContain('Document `UNDOCUMENTED_VAR` in .env.example');
  });

  it('blocks risky NEXT_PUBLIC_*_SECRET-like vars', async () => {
    const findings = await envCheck(await ctx(MISSING));
    const blocker = findings.find(
      (f) => f.severity === 'blocker' && f.title.includes('NEXT_PUBLIC_STRIPE_SECRET'),
    );
    expect(blocker).toBeDefined();
  });

  it('passes for good-next-neon (all used vars are in .env.example)', async () => {
    const findings = await envCheck(await ctx(GOOD));
    const warnings = findings.filter((f) => f.severity === 'warning');
    expect(warnings).toHaveLength(0);
  });
});
```

- [ ] **Step 7: Run to verify it fails**

Run: `pnpm test tests/checks/env.test.ts`
Expected: FAIL.

- [ ] **Step 8: Implement `src/checks/env.ts`**

```ts
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { Check, Finding } from '../types.js';

const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', '.ai-app-auditor']);
const TEXT_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const RISKY_SUFFIXES = ['KEY', 'SECRET', 'TOKEN', 'PASSWORD'];

const PROCESS_ENV_RE = /process\.env\.([A-Z][A-Z0-9_]+)/g;

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
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile() && TEXT_EXTS.has(path.extname(entry.name))) yield full;
  }
}

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
  for await (const file of walk(ctx.repoPath)) {
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
    if (v.startsWith('NEXT_PUBLIC_') && RISKY_SUFFIXES.some((s) => v.endsWith(s) || v.includes(`_${s}_`) || v.endsWith(`_${s}`))) {
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
```

- [ ] **Step 9: Run to verify it passes**

Run: `pnpm test tests/checks/env.test.ts`
Expected: 3 tests pass.

- [ ] **Step 10: Commit**

```bash
git add fixtures/missing-env src/checks/env.ts tests/checks/env.test.ts
git commit -m "feat(checks): envCheck for undocumented + risky NEXT_PUBLIC_* vars"
```

---

## Task 11: `neonCheck` + `neon-noauth` fixture

**Files:**
- Create: `fixtures/neon-noauth/package.json`
- Create: `fixtures/neon-noauth/README.md`
- Create: `fixtures/neon-noauth/.env.example` (empty)
- Create: `fixtures/neon-noauth/pnpm-lock.yaml`
- Create: `fixtures/neon-noauth/app/api/users/route.ts`
- Create: `src/checks/neon.ts`
- Create: `tests/checks/neon.test.ts`

- [ ] **Step 1: Create directories**

Run: `mkdir -p fixtures/neon-noauth/app/api/users && touch fixtures/neon-noauth/pnpm-lock.yaml fixtures/neon-noauth/.env.example`

- [ ] **Step 2: Write `fixtures/neon-noauth/package.json`**

```json
{
  "name": "neon-noauth",
  "version": "0.0.0",
  "private": true,
  "dependencies": {
    "next": "15.0.0",
    "@neondatabase/serverless": "0.10.0"
  }
}
```

- [ ] **Step 3: Write `fixtures/neon-noauth/README.md`**

```md
# neon-noauth fixture
```

- [ ] **Step 4: Write `fixtures/neon-noauth/app/api/users/route.ts`**

```ts
import { neon } from '@neondatabase/serverless';

export async function GET() {
  const sql = neon(process.env.DATABASE_URL!);
  return Response.json(await sql`select 1`);
}
```

- [ ] **Step 5: Write the failing test**

`tests/checks/neon.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { neonCheck } from '../../src/checks/neon.js';
import { detectStack } from '../../src/detect/stack.js';
import type { CheckContext } from '../../src/types.js';

const NOAUTH = path.resolve(__dirname, '../../fixtures/neon-noauth');
const GOOD = path.resolve(__dirname, '../../fixtures/good-next-neon');

async function ctx(repoPath: string): Promise<CheckContext> {
  return { repoPath, stack: await detectStack(repoPath) };
}

describe('neonCheck', () => {
  it('blocks when DATABASE_URL not in .env.example', async () => {
    const findings = await neonCheck(await ctx(NOAUTH));
    const blocker = findings.find(
      (f) => f.severity === 'blocker' && f.title.includes('DATABASE_URL'),
    );
    expect(blocker).toBeDefined();
  });

  it('warns when API route imports neon but has no auth check', async () => {
    const findings = await neonCheck(await ctx(NOAUTH));
    const warn = findings.find(
      (f) => f.severity === 'warning' && f.title.includes('no auth check detected'),
    );
    expect(warn).toBeDefined();
    expect(warn?.detail).toContain('app/api/users/route.ts');
  });

  it('passes for good-next-neon (DATABASE_URL documented + route has auth())', async () => {
    const findings = await neonCheck(await ctx(GOOD));
    expect(findings.filter((f) => f.severity === 'blocker')).toHaveLength(0);
    expect(findings.filter((f) => f.severity === 'warning' && f.title.includes('no auth check detected'))).toHaveLength(0);
  });

  it('returns empty (no findings) when stack.usesNeon is false', async () => {
    const findings = await neonCheck({
      repoPath: '/tmp',
      stack: {
        framework: 'next',
        packageManager: 'pnpm',
        scripts: {},
        dependencies: [],
        hasLockfile: false,
        hasEnvExample: false,
        usesNeon: false,
      },
    });
    expect(findings).toHaveLength(0);
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `pnpm test tests/checks/neon.test.ts`
Expected: FAIL.

- [ ] **Step 7: Implement `src/checks/neon.ts`**

```ts
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { Check, Finding } from '../types.js';

const AUTH_PATTERNS = [/\bauth\s*\(/, /\bgetServerSession\s*\(/, /\bcurrentUser\s*\(/];

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readEnvExampleKeys(repoPath: string): Promise<Set<string>> {
  try {
    const raw = await fs.readFile(path.join(repoPath, '.env.example'), 'utf8');
    return new Set(
      raw
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#') && l.includes('='))
        .map((l) => l.split('=')[0].trim()),
    );
  } catch {
    return new Set();
  }
}

async function* walkRoutes(repoPath: string): AsyncGenerator<string> {
  const appDir = path.join(repoPath, 'app');
  if (!(await exists(appDir))) return;
  async function* recur(dir: string): AsyncGenerator<string> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) yield* recur(full);
      else if (e.isFile() && (e.name === 'route.ts' || e.name === 'route.tsx')) yield full;
    }
  }
  yield* recur(appDir);
}

export const neonCheck: Check = async (ctx) => {
  if (!ctx.stack.usesNeon) return [];

  const findings: Finding[] = [];

  const documented = await readEnvExampleKeys(ctx.repoPath);
  if (!documented.has('DATABASE_URL')) {
    findings.push({
      checkId: 'neon',
      severity: 'blocker',
      title: 'DATABASE_URL not in .env.example',
      detail: 'Neon requires DATABASE_URL. Document it in .env.example so collaborators and deploys can set it.',
    });
  }

  const hasDrizzle = ctx.stack.dependencies.includes('drizzle-orm');
  const hasPrisma = ctx.stack.dependencies.includes('prisma') || ctx.stack.dependencies.includes('@prisma/client');
  if (hasDrizzle && !(await exists(path.join(ctx.repoPath, 'drizzle')))) {
    findings.push({
      checkId: 'neon',
      severity: 'warning',
      title: 'Drizzle detected but no drizzle/ folder',
      detail: 'Add a migrations folder so schema changes are versioned.',
    });
  }
  if (hasPrisma && !(await exists(path.join(ctx.repoPath, 'prisma', 'migrations')))) {
    findings.push({
      checkId: 'neon',
      severity: 'warning',
      title: 'Prisma detected but no migrations folder',
      detail: 'Add prisma/migrations/ so schema changes are versioned.',
    });
  }

  for await (const route of walkRoutes(ctx.repoPath)) {
    const content = await fs.readFile(route, 'utf8');
    const usesNeonHere = content.includes('@neondatabase/serverless');
    if (!usesNeonHere) continue;
    const hasAuth = AUTH_PATTERNS.some((re) => re.test(content));
    if (!hasAuth) {
      findings.push({
        checkId: 'neon',
        severity: 'warning',
        title: 'API route queries Neon but no auth check detected',
        detail: `${path.relative(ctx.repoPath, route)} imports @neondatabase/serverless but has no auth()/getServerSession()/currentUser() call.`,
      });
    }
  }

  return findings;
};
```

- [ ] **Step 8: Run to verify it passes**

Run: `pnpm test tests/checks/neon.test.ts`
Expected: 4 tests pass.

- [ ] **Step 9: Commit**

```bash
git add fixtures/neon-noauth src/checks/neon.ts tests/checks/neon.test.ts
git commit -m "feat(checks): neonCheck for DATABASE_URL, migrations, route auth"
```

---

## Task 12: `routeCheck` + `public-admin` fixture

**Files:**
- Create: `fixtures/public-admin/package.json`
- Create: `fixtures/public-admin/README.md`
- Create: `fixtures/public-admin/.env.example`
- Create: `fixtures/public-admin/pnpm-lock.yaml`
- Create: `fixtures/public-admin/app/admin/page.tsx`
- Create: `fixtures/public-admin/app/page.tsx`
- Create: `src/checks/route.ts`
- Create: `tests/checks/route.test.ts`

- [ ] **Step 1: Create directories**

Run: `mkdir -p fixtures/public-admin/app/admin && touch fixtures/public-admin/pnpm-lock.yaml`

- [ ] **Step 2: Write `fixtures/public-admin/package.json`**

```json
{
  "name": "public-admin",
  "version": "0.0.0",
  "private": true,
  "dependencies": { "next": "15.0.0" }
}
```

- [ ] **Step 3: Write `fixtures/public-admin/README.md` and `.env.example`**

```md
# public-admin fixture
```

`.env.example`:
```
NEXT_PUBLIC_APP_NAME=
```

- [ ] **Step 4: Write `fixtures/public-admin/app/page.tsx`**

```tsx
export default function Home() { return <h1>home</h1>; }
```

- [ ] **Step 5: Write `fixtures/public-admin/app/admin/page.tsx`**

```tsx
export default function Admin() { return <h1>admin</h1>; }
```

- [ ] **Step 6: Write the failing test**

`tests/checks/route.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { routeCheck } from '../../src/checks/route.js';
import { detectStack } from '../../src/detect/stack.js';
import type { CheckContext } from '../../src/types.js';

const PUBLIC = path.resolve(__dirname, '../../fixtures/public-admin');
const GOOD = path.resolve(__dirname, '../../fixtures/good-next-neon');

async function ctx(repoPath: string): Promise<CheckContext> {
  return { repoPath, stack: await detectStack(repoPath) };
}

describe('routeCheck', () => {
  it('blocks unprotected /admin', async () => {
    const findings = await routeCheck(await ctx(PUBLIC));
    const blocker = findings.find(
      (f) => f.severity === 'blocker' && f.title.includes('/admin'),
    );
    expect(blocker).toBeDefined();
  });

  it('passes for good-next-neon (middleware covers /admin)', async () => {
    const findings = await routeCheck(await ctx(GOOD));
    expect(findings.filter((f) => f.severity === 'blocker')).toHaveLength(0);
  });

  it('always emits a pass finding with route count', async () => {
    const findings = await routeCheck(await ctx(GOOD));
    const countFinding = findings.find(
      (f) => f.severity === 'pass' && f.title.startsWith('Detected'),
    );
    expect(countFinding).toBeDefined();
    expect(countFinding!.title).toMatch(/Detected \d+ routes?/);
  });
});
```

- [ ] **Step 7: Run to verify it fails**

Run: `pnpm test tests/checks/route.test.ts`
Expected: FAIL.

- [ ] **Step 8: Implement `src/checks/route.ts`**

```ts
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { Check, Finding } from '../types.js';

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function* walkPages(repoPath: string): AsyncGenerator<string> {
  const appDir = path.join(repoPath, 'app');
  if (!(await exists(appDir))) return;
  async function* recur(dir: string): AsyncGenerator<string> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) yield* recur(full);
      else if (e.isFile() && (e.name === 'page.ts' || e.name === 'page.tsx')) yield full;
    }
  }
  yield* recur(appDir);
}

async function readMiddleware(repoPath: string): Promise<string | null> {
  for (const name of ['middleware.ts', 'middleware.js']) {
    const p = path.join(repoPath, name);
    if (await exists(p)) return fs.readFile(p, 'utf8');
  }
  return null;
}

export const routeCheck: Check = async (ctx) => {
  const findings: Finding[] = [];

  const pages: string[] = [];
  for await (const f of walkPages(ctx.repoPath)) pages.push(f);

  const hasAdmin = pages.some((p) => p.includes(`${path.sep}admin${path.sep}`));
  const hasDashboard = pages.some((p) => p.includes(`${path.sep}dashboard${path.sep}`));
  const mw = await readMiddleware(ctx.repoPath);

  if (hasAdmin) {
    if (!mw || !mw.includes('/admin')) {
      findings.push({
        checkId: 'route',
        severity: 'blocker',
        title: '/admin route exists with no middleware protection',
        detail: 'Add middleware.ts that matches /admin/:path* and enforces auth.',
      });
    }
  }
  if (hasDashboard) {
    if (!mw || !mw.includes('/dashboard')) {
      findings.push({
        checkId: 'route',
        severity: 'warning',
        title: '/dashboard route exists with no middleware protection',
        detail: 'Add middleware.ts that matches /dashboard/:path* and enforces auth.',
      });
    }
  }

  findings.push({
    checkId: 'route',
    severity: 'pass',
    title: `Detected ${pages.length} route${pages.length === 1 ? '' : 's'}`,
    detail: '',
  });

  return findings;
};
```

- [ ] **Step 9: Run to verify it passes**

Run: `pnpm test tests/checks/route.test.ts`
Expected: 3 tests pass.

- [ ] **Step 10: Run full test suite**

Run: `pnpm test`
Expected: all tests so far pass.

- [ ] **Step 11: Commit**

```bash
git add fixtures/public-admin src/checks/route.ts tests/checks/route.test.ts
git commit -m "feat(checks): routeCheck for unprotected /admin and /dashboard"
```

---

## Task 13: `score.ts` — deterministic verdict & score

**Files:**
- Create: `src/score.ts`
- Create: `tests/score.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/score.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { scoreFindings } from '../src/score.js';
import type { Finding } from '../src/types.js';

function f(severity: Finding['severity'], title = 't'): Finding {
  return { checkId: 'demo', severity, title, detail: '' };
}

describe('scoreFindings', () => {
  it('starts at 100 with no findings → ship', () => {
    const r = scoreFindings([]);
    expect(r.score).toBe(100);
    expect(r.verdict).toBe('ship');
  });

  it('-20 per blocker, -5 per warning, floored at 0', () => {
    const r = scoreFindings([f('blocker'), f('blocker'), f('warning'), f('warning')]);
    expect(r.score).toBe(50);
  });

  it('floors at 0', () => {
    const r = scoreFindings(Array.from({ length: 10 }, () => f('blocker')));
    expect(r.score).toBe(0);
  });

  it('any blocker → do-not-ship even if score >= 50', () => {
    const r = scoreFindings([f('blocker'), f('pass'), f('pass')]);
    expect(r.verdict).toBe('do-not-ship');
    expect(r.score).toBe(80);
  });

  it('score < 50 → do-not-ship even with no blockers', () => {
    const r = scoreFindings(Array.from({ length: 11 }, () => f('warning')));
    expect(r.score).toBe(45);
    expect(r.verdict).toBe('do-not-ship');
  });

  it('partitions findings into blockers/warnings/passed', () => {
    const r = scoreFindings([f('blocker', 'B'), f('warning', 'W'), f('pass', 'P')]);
    expect(r.blockers).toHaveLength(1);
    expect(r.warnings).toHaveLength(1);
    expect(r.passed).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test tests/score.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/score.ts`**

```ts
import type { Finding } from './types.js';

export type ScoreResult = {
  verdict: 'ship' | 'do-not-ship';
  score: number;
  blockers: Finding[];
  warnings: Finding[];
  passed: Finding[];
};

export function scoreFindings(findings: Finding[]): ScoreResult {
  const blockers = findings.filter((f) => f.severity === 'blocker');
  const warnings = findings.filter((f) => f.severity === 'warning');
  const passed = findings.filter((f) => f.severity === 'pass');

  const raw = 100 - blockers.length * 20 - warnings.length * 5;
  const score = Math.max(0, raw);
  const verdict: 'ship' | 'do-not-ship' = blockers.length > 0 || score < 50 ? 'do-not-ship' : 'ship';

  return { verdict, score, blockers, warnings, passed };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test tests/score.test.ts`
Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/score.ts tests/score.test.ts
git commit -m "feat(score): deterministic verdict + 100/-20/-5 scoring"
```

---

## Task 14: `aiReportWriter` — single OpenAI call

**Files:**
- Create: `src/ai/reportWriter.ts`
- Create: `tests/ai/reportWriter.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/ai/reportWriter.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { aiReportWriter } from '../../src/ai/reportWriter.js';
import type { Finding, StackInfo } from '../../src/types.js';

const stack: StackInfo = {
  framework: 'next',
  packageManager: 'pnpm',
  scripts: {},
  dependencies: [],
  hasLockfile: true,
  hasEnvExample: true,
  usesNeon: true,
};

const findings: Finding[] = [
  { checkId: 'build', severity: 'blocker', title: 'Build failed', detail: 'exit 1' },
  { checkId: 'health', severity: 'warning', title: 'Missing README', detail: '' },
  { checkId: 'route', severity: 'pass', title: 'Detected 3 routes', detail: '' },
];

describe('aiReportWriter', () => {
  it('throws when OPENAI_API_KEY is not set', async () => {
    const prev = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    await expect(aiReportWriter(findings, stack, { createCompletion: vi.fn() })).rejects.toThrow(
      /OPENAI_API_KEY required/,
    );
    if (prev !== undefined) process.env.OPENAI_API_KEY = prev;
  });

  it('merges deterministic score/verdict with AI-written summary/fixOrder', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    const createCompletion = vi.fn().mockResolvedValue({
      summary: 'Build is broken; fix it first.',
      fixOrder: ['Build failed', 'Missing README'],
      explanations: { build: 'Build failures block deploys.', health: 'README helps onboarding.' },
    });
    const report = await aiReportWriter(findings, stack, { createCompletion });
    expect(report.verdict).toBe('do-not-ship');
    expect(report.score).toBe(75);
    expect(report.summary).toBe('Build is broken; fix it first.');
    expect(report.fixOrder).toEqual(['Build failed', 'Missing README']);
    expect(report.generatedAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it('retries once on API failure, then succeeds', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    const createCompletion = vi
      .fn()
      .mockRejectedValueOnce(new Error('rate_limit'))
      .mockResolvedValueOnce({ summary: 's', fixOrder: [], explanations: {} });
    const report = await aiReportWriter(findings, stack, { createCompletion });
    expect(createCompletion).toHaveBeenCalledTimes(2);
    expect(report.summary).toBe('s');
  });

  it('throws if both attempts fail', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    const createCompletion = vi.fn().mockRejectedValue(new Error('still bad'));
    await expect(aiReportWriter(findings, stack, { createCompletion })).rejects.toThrow(/still bad/);
    expect(createCompletion).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test tests/ai/reportWriter.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/ai/reportWriter.ts`**

```ts
import OpenAI from 'openai';
import type { Finding, Report, StackInfo } from '../types.js';
import { scoreFindings } from '../score.js';

export type AIPayload = {
  summary: string;
  fixOrder: string[];
  explanations: Record<string, string>;
};

export type AIDeps = {
  createCompletion?: (input: {
    findings: Finding[];
    stack: StackInfo;
    verdict: 'ship' | 'do-not-ship';
    score: number;
  }) => Promise<AIPayload>;
};

const SYSTEM_PROMPT = `You are a senior engineer reviewing a pre-deploy scan of a Next.js + Neon app.
You receive (a) deterministic findings produced by static checks and (b) the deterministic verdict and score.

RULES:
1. You MUST NOT invent findings that are not in the input.
2. You MUST NOT change the verdict or score.
3. "fixOrder" must reuse the existing finding titles verbatim, blockers first then warnings, ordered by impact.
4. "explanations" is keyed by checkId and contains a 1-2 sentence plain-English "why this matters".
5. "summary" is 2-4 sentences for a non-expert audience.

Respond with JSON matching the schema {summary: string, fixOrder: string[], explanations: object}.`;

async function defaultCreateCompletion(input: {
  findings: Finding[];
  stack: StackInfo;
  verdict: 'ship' | 'do-not-ship';
  score: number;
}): Promise<AIPayload> {
  const client = new OpenAI();
  const resp = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: JSON.stringify({
          verdict: input.verdict,
          score: input.score,
          stack: input.stack,
          findings: input.findings,
        }),
      },
    ],
  });
  const raw = resp.choices[0]?.message?.content ?? '{}';
  return JSON.parse(raw) as AIPayload;
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    await new Promise((r) => setTimeout(r, 1000));
    return await fn();
  }
}

export async function aiReportWriter(
  findings: Finding[],
  stack: StackInfo,
  deps: AIDeps = {},
): Promise<Report> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY required. Set it in your shell or .env. See README.');
  }
  const create = deps.createCompletion ?? defaultCreateCompletion;
  const { verdict, score, blockers, warnings, passed } = scoreFindings(findings);
  const ai = await withRetry(() => create({ findings, stack, verdict, score }));

  return {
    verdict,
    score,
    blockers,
    warnings,
    passed,
    summary: ai.summary,
    fixOrder: ai.fixOrder,
    generatedAt: new Date().toISOString(),
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test tests/ai/reportWriter.test.ts`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/ai/reportWriter.ts tests/ai/reportWriter.test.ts
git commit -m "feat(ai): reportWriter with required OPENAI_API_KEY + 1 retry"
```

---

## Task 15: Output writers (Markdown + JSON)

**Files:**
- Create: `src/output/markdown.ts`
- Create: `src/output/json.ts`
- Create: `src/output/write.ts`
- Create: `tests/output/markdown.test.ts`
- Create: `tests/output/json.test.ts`
- Create: `tests/output/write.test.ts`

- [ ] **Step 1: Write the failing Markdown test**

`tests/output/markdown.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../../src/output/markdown.js';
import type { Report } from '../../src/types.js';

const report: Report = {
  verdict: 'do-not-ship',
  score: 60,
  blockers: [{ checkId: 'build', severity: 'blocker', title: 'Build failed', detail: 'exit 1' }],
  warnings: [{ checkId: 'health', severity: 'warning', title: 'Missing README', detail: '' }],
  passed: [{ checkId: 'route', severity: 'pass', title: 'Detected 2 routes', detail: '' }],
  summary: 'Fix the build first.',
  fixOrder: ['Build failed', 'Missing README'],
  generatedAt: '2026-05-16T00:00:00.000Z',
};

describe('renderMarkdown', () => {
  it('includes verdict and score', () => {
    const md = renderMarkdown(report);
    expect(md).toContain('Verdict: do-not-ship');
    expect(md).toContain('Score: 60/100');
  });

  it('lists blockers, warnings, passed sections', () => {
    const md = renderMarkdown(report);
    expect(md).toMatch(/## Critical Blockers[\s\S]*Build failed/);
    expect(md).toMatch(/## Warnings[\s\S]*Missing README/);
    expect(md).toMatch(/## Passed Checks[\s\S]*Detected 2 routes/);
  });

  it('includes the AI summary and fix order', () => {
    const md = renderMarkdown(report);
    expect(md).toContain('Fix the build first.');
    expect(md).toMatch(/## Fix First[\s\S]*1\. Build failed[\s\S]*2\. Missing README/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test tests/output/markdown.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/output/markdown.ts`**

```ts
import type { Finding, Report } from '../types.js';

function bullets(items: Finding[]): string {
  if (items.length === 0) return '_(none)_';
  return items
    .map((f) => {
      const detail = f.detail ? ` — ${f.detail}` : '';
      const evidence = f.evidence ? `\n  \`\`\`\n  ${f.evidence.split('\n').join('\n  ')}\n  \`\`\`` : '';
      return `- **${f.title}**${detail}${evidence}`;
    })
    .join('\n');
}

export function renderMarkdown(report: Report): string {
  return [
    `# ai-app-auditor Report`,
    ``,
    `Verdict: ${report.verdict}`,
    `Score: ${report.score}/100`,
    `Generated: ${report.generatedAt}`,
    ``,
    `## Summary`,
    ``,
    report.summary || '_(no summary)_',
    ``,
    `## Critical Blockers`,
    ``,
    bullets(report.blockers),
    ``,
    `## Warnings`,
    ``,
    bullets(report.warnings),
    ``,
    `## Passed Checks`,
    ``,
    bullets(report.passed),
    ``,
    `## Fix First`,
    ``,
    report.fixOrder.length === 0
      ? '_(nothing to fix)_'
      : report.fixOrder.map((title, i) => `${i + 1}. ${title}`).join('\n'),
    ``,
  ].join('\n');
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test tests/output/markdown.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Write the failing JSON test**

`tests/output/json.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { renderJson } from '../../src/output/json.js';
import type { Report } from '../../src/types.js';

const report: Report = {
  verdict: 'ship',
  score: 100,
  blockers: [],
  warnings: [],
  passed: [],
  summary: 'ok',
  fixOrder: [],
  generatedAt: '2026-05-16T00:00:00.000Z',
};

describe('renderJson', () => {
  it('returns a parseable JSON string that round-trips to the report', () => {
    const json = renderJson(report);
    const parsed = JSON.parse(json);
    expect(parsed).toEqual(report);
  });

  it('is pretty-printed with 2-space indent', () => {
    const json = renderJson(report);
    expect(json).toContain('\n  "verdict"');
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `pnpm test tests/output/json.test.ts`
Expected: FAIL.

- [ ] **Step 7: Implement `src/output/json.ts`**

```ts
import type { Report } from '../types.js';

export function renderJson(report: Report): string {
  return JSON.stringify(report, null, 2);
}
```

- [ ] **Step 8: Run to verify it passes**

Run: `pnpm test tests/output/json.test.ts`
Expected: 2 tests pass.

- [ ] **Step 9: Write the failing write test**

`tests/output/write.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { writeOutputs } from '../../src/output/write.js';
import type { Report } from '../../src/types.js';

const report: Report = {
  verdict: 'ship',
  score: 100,
  blockers: [],
  warnings: [],
  passed: [],
  summary: 'all good',
  fixOrder: [],
  generatedAt: '2026-05-16T00:00:00.000Z',
};

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'aaa-test-'));
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('writeOutputs', () => {
  it('creates .ai-app-auditor/ with report.md and report.json', async () => {
    await writeOutputs(report, tmp);
    const outDir = path.join(tmp, '.ai-app-auditor');
    const files = await fs.readdir(outDir);
    expect(files.sort()).toEqual(['report.json', 'report.md']);
  });

  it('report.json round-trips to the input report', async () => {
    await writeOutputs(report, tmp);
    const raw = await fs.readFile(path.join(tmp, '.ai-app-auditor', 'report.json'), 'utf8');
    expect(JSON.parse(raw)).toEqual(report);
  });
});
```

- [ ] **Step 10: Run to verify it fails**

Run: `pnpm test tests/output/write.test.ts`
Expected: FAIL.

- [ ] **Step 11: Implement `src/output/write.ts`**

```ts
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
```

- [ ] **Step 12: Run to verify all output tests pass**

Run: `pnpm test tests/output`
Expected: all output tests pass.

- [ ] **Step 13: Commit**

```bash
git add src/output tests/output
git commit -m "feat(output): renderMarkdown, renderJson, writeOutputs to .ai-app-auditor/"
```

---

## Task 16: `orchestrator.ts` — compose the pipeline

**Files:**
- Create: `src/orchestrator.ts`
- Create: `tests/orchestrator.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/orchestrator.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import * as path from 'node:path';
import { runAudit } from '../src/orchestrator.js';

const GOOD = path.resolve(__dirname, '../fixtures/good-next-neon');
const BROKEN = path.resolve(__dirname, '../fixtures/broken-build');

const aiOk = vi.fn().mockResolvedValue({
  summary: 'looks ok',
  fixOrder: [],
  explanations: {},
});

describe('runAudit', () => {
  it('returns ship for good-next-neon (AI mocked, runCommand mocked to pass everything)', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    const runCommand = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, stdout: '', stderr: '', timedOut: false });
    const report = await runAudit({
      repoPath: GOOD,
      smoke: false,
      runCommand,
      createCompletion: aiOk,
    });
    expect(report.verdict).toBe('ship');
    expect(report.score).toBe(100);
  });

  it('returns do-not-ship when build fails', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    const runCommand = vi.fn().mockImplementation(async (cmd: string) => {
      if (cmd.includes('build')) return { exitCode: 1, stdout: '', stderr: 'boom', timedOut: false };
      return { exitCode: 0, stdout: '', stderr: '', timedOut: false };
    });
    const report = await runAudit({
      repoPath: BROKEN,
      smoke: false,
      runCommand,
      createCompletion: aiOk,
    });
    expect(report.verdict).toBe('do-not-ship');
    expect(report.blockers.some((b) => b.checkId === 'build')).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test tests/orchestrator.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/orchestrator.ts`**

```ts
import { detectStack } from './detect/stack.js';
import { healthCheck } from './checks/health.js';
import { buildCheck } from './checks/build.js';
import { lintCheck } from './checks/lint.js';
import { testCheck } from './checks/test.js';
import { secretCheck } from './checks/secret.js';
import { envCheck } from './checks/env.js';
import { neonCheck } from './checks/neon.js';
import { routeCheck } from './checks/route.js';
import { aiReportWriter, type AIDeps } from './ai/reportWriter.js';
import type { CheckContext, Finding, Report } from './types.js';
import type { CommandResult } from './runner/command.js';

export type RunAuditOptions = {
  repoPath: string;
  smoke: boolean;
  runCommand?: (cmd: string, opts: { cwd: string; timeoutMs: number }) => Promise<CommandResult>;
  createCompletion?: AIDeps['createCompletion'];
};

export async function runAudit(opts: RunAuditOptions): Promise<Report> {
  const stack = await detectStack(opts.repoPath);
  const ctx: CheckContext = { repoPath: opts.repoPath, stack };
  const deps = { runCommand: opts.runCommand };

  const all: Finding[] = [];
  all.push(...(await healthCheck(ctx)));
  all.push(...(await (buildCheck as unknown as (c: CheckContext, d: typeof deps) => Promise<Finding[]>)(ctx, deps)));
  all.push(...(await (lintCheck as unknown as (c: CheckContext, d: typeof deps) => Promise<Finding[]>)(ctx, deps)));
  all.push(...(await (testCheck as unknown as (c: CheckContext, d: typeof deps) => Promise<Finding[]>)(ctx, deps)));
  all.push(...(await secretCheck(ctx)));
  all.push(...(await envCheck(ctx)));
  all.push(...(await neonCheck(ctx)));
  all.push(...(await routeCheck(ctx)));

  if (opts.smoke) {
    const { runSmokeTest } = await import('./smoke/playwright.js');
    all.push(...(await runSmokeTest(ctx)));
  }

  return aiReportWriter(all, stack, { createCompletion: opts.createCompletion });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test tests/orchestrator.test.ts`
Expected: 2 tests pass.

- [ ] **Step 5: Run the full suite**

Run: `pnpm test`
Expected: everything green so far.

- [ ] **Step 6: Commit**

```bash
git add src/orchestrator.ts tests/orchestrator.test.ts
git commit -m "feat(orchestrator): compose detect → checks → AI report pipeline"
```

---

## Task 17: `cli.ts` — arg parsing, exit codes, top-level errors

**Files:**
- Create: `src/cli.ts`
- Create: `tests/cli.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/cli.test.ts`:
```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { execa } from 'execa';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';

const ROOT = path.resolve(__dirname, '..');
const CLI = path.join(ROOT, 'dist', 'cli.js');
const GOOD = path.join(ROOT, 'fixtures', 'good-next-neon');

beforeAll(async () => {
  await execa('pnpm', ['build'], { cwd: ROOT });
}, 60_000);

describe('cli', () => {
  it('exits 1 when OPENAI_API_KEY is missing', async () => {
    const env = { ...process.env };
    delete env.OPENAI_API_KEY;
    const { exitCode, stderr } = await execa('node', [CLI, '--path', GOOD], {
      env,
      reject: false,
    });
    expect(exitCode).toBe(1);
    expect(stderr).toContain('OPENAI_API_KEY required');
  });

  it('exits 1 when path does not exist', async () => {
    const { exitCode, stderr } = await execa('node', [CLI, '--path', '/nonexistent/path/xyz'], {
      env: { ...process.env, OPENAI_API_KEY: 'sk-test' },
      reject: false,
    });
    expect(exitCode).toBe(1);
    expect(stderr.toLowerCase()).toMatch(/path|not.*exist|not.*directory/);
  });

  it('exits 1 when path has no package.json', async () => {
    const tmp = await fs.mkdtemp(path.join(ROOT, 'tmp-cli-'));
    try {
      const { exitCode, stderr } = await execa('node', [CLI, '--path', tmp], {
        env: { ...process.env, OPENAI_API_KEY: 'sk-test' },
        reject: false,
      });
      expect(exitCode).toBe(1);
      expect(stderr).toContain('package.json');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test tests/cli.test.ts`
Expected: FAIL (build script may also surface missing `cli.ts`).

- [ ] **Step 3: Implement `src/cli.ts`**

```ts
#!/usr/bin/env node
import { Command } from 'commander';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { runAudit } from './orchestrator.js';
import { writeOutputs } from './output/write.js';

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

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
```

- [ ] **Step 4: Build**

Run: `pnpm build`
Expected: `dist/cli.js` exists, no TS errors.

- [ ] **Step 5: Make CLI executable**

Run: `chmod +x dist/cli.js`
Expected: file is executable.

- [ ] **Step 6: Run the cli test**

Run: `pnpm test tests/cli.test.ts`
Expected: 3 tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/cli.ts tests/cli.test.ts
git commit -m "feat(cli): arg parsing, exit codes (0/1/2), preflight validations"
```

---

## Task 18: `runSmokeTest` (Playwright, opt-in)

**Files:**
- Create: `src/smoke/playwright.ts`
- Create: `tests/smoke/playwright.test.ts`

Note: the actual smoke meta-test is heavy (boots a Next dev server + Chromium). We split tests:
- Unit tests for the `playwright.ts` module that mock the Playwright API and the dev-server runner.
- The "real" meta-test stays in `tests/smoke/` (excluded from default `pnpm test`), invoked by `pnpm test:smoke`.

For V1, ship only the unit-mocked tests under `tests/smoke/playwright.test.ts` and run them with `pnpm test:smoke`. A real-browser meta-test is a V2 follow-up.

- [ ] **Step 1: Write the failing test**

`tests/smoke/playwright.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { runSmokeTest } from '../../src/smoke/playwright.js';
import type { CheckContext } from '../../src/types.js';

const ctx: CheckContext = {
  repoPath: '/tmp',
  stack: {
    framework: 'next',
    packageManager: 'pnpm',
    scripts: { dev: 'next dev' },
    dependencies: [],
    hasLockfile: true,
    hasEnvExample: true,
    usesNeon: false,
  },
};

describe('runSmokeTest', () => {
  it('returns blocker when dev server fails to boot', async () => {
    const startServer = vi.fn().mockResolvedValue({ ready: false });
    const drive = vi.fn();
    const findings = await runSmokeTest(ctx, { startServer, drive });
    expect(drive).not.toHaveBeenCalled();
    expect(findings[0].severity).toBe('blocker');
    expect(findings[0].title).toBe('Dev server failed to start within 30s');
  });

  it('returns pass when homepage loads clean', async () => {
    const startServer = vi.fn().mockResolvedValue({ ready: true, stop: vi.fn() });
    const drive = vi.fn().mockResolvedValue({
      consoleErrors: [],
      failedRequests: [],
      routeStatuses: { '/login': 200, '/admin': 404 },
    });
    const findings = await runSmokeTest(ctx, { startServer, drive });
    expect(findings.some((f) => f.severity === 'pass' && f.title.includes('homepage'))).toBe(true);
  });

  it('returns blocker on console error', async () => {
    const startServer = vi.fn().mockResolvedValue({ ready: true, stop: vi.fn() });
    const drive = vi.fn().mockResolvedValue({
      consoleErrors: ['ReferenceError: foo is not defined'],
      failedRequests: [],
      routeStatuses: {},
    });
    const findings = await runSmokeTest(ctx, { startServer, drive });
    expect(findings.some((f) => f.severity === 'blocker' && f.title.includes('Console error'))).toBe(true);
  });

  it('warns on non-404 4xx on common route', async () => {
    const startServer = vi.fn().mockResolvedValue({ ready: true, stop: vi.fn() });
    const drive = vi.fn().mockResolvedValue({
      consoleErrors: [],
      failedRequests: [],
      routeStatuses: { '/login': 403, '/admin': 404 },
    });
    const findings = await runSmokeTest(ctx, { startServer, drive });
    expect(findings.some((f) => f.severity === 'warning' && f.title.includes('/login'))).toBe(true);
  });

  it('blocks on 5xx on common route', async () => {
    const startServer = vi.fn().mockResolvedValue({ ready: true, stop: vi.fn() });
    const drive = vi.fn().mockResolvedValue({
      consoleErrors: [],
      failedRequests: [],
      routeStatuses: { '/dashboard': 500 },
    });
    const findings = await runSmokeTest(ctx, { startServer, drive });
    expect(findings.some((f) => f.severity === 'blocker' && f.title.includes('/dashboard'))).toBe(true);
  });
});
```

- [ ] **Step 2: Update `vitest.config.ts` to allow running smoke tests explicitly**

The `pnpm test:smoke` script already targets `tests/smoke`. Confirm it picks up `tests/smoke/playwright.test.ts`:

Run: `pnpm test:smoke`
Expected: FAIL — module not found (we haven't implemented it yet, but the runner finds the test file).

- [ ] **Step 3: Implement `src/smoke/playwright.ts`**

```ts
import type { Check, CheckContext, Finding } from '../types.js';

export type SmokeDriveResult = {
  consoleErrors: string[];
  failedRequests: string[];
  routeStatuses: Record<string, number>;
};

export type SmokeDeps = {
  startServer?: (ctx: CheckContext) => Promise<{ ready: boolean; stop?: () => Promise<void> }>;
  drive?: (ctx: CheckContext) => Promise<SmokeDriveResult>;
};

const COMMON_ROUTES = ['/login', '/signup', '/dashboard', '/admin'];

async function defaultStartServer(_ctx: CheckContext): Promise<{ ready: boolean; stop?: () => Promise<void> }> {
  // The real implementation is intentionally deferred — V1 ships with mocked unit tests
  // and a real-browser meta-test as a V2 follow-up. CLI users using --smoke will hit this path.
  throw new Error('Smoke test runtime not yet implemented. Run without --smoke for V1.');
}

async function defaultDrive(_ctx: CheckContext): Promise<SmokeDriveResult> {
  throw new Error('Smoke test runtime not yet implemented. Run without --smoke for V1.');
}

export const runSmokeTest: Check & ((ctx: CheckContext, deps?: SmokeDeps) => Promise<Finding[]>) =
  (async (ctx, deps: SmokeDeps = {}) => {
    const startServer = deps.startServer ?? defaultStartServer;
    const drive = deps.drive ?? defaultDrive;

    const server = await startServer(ctx);
    if (!server.ready) {
      return [{
        checkId: 'smoke',
        severity: 'blocker',
        title: 'Dev server failed to start within 30s',
        detail: 'The app could not boot locally. Check `pnpm dev` manually.',
      }];
    }

    try {
      const result = await drive(ctx);
      const findings: Finding[] = [];

      if (result.consoleErrors.length > 0) {
        findings.push({
          checkId: 'smoke',
          severity: 'blocker',
          title: 'Console error on homepage',
          detail: result.consoleErrors.join('\n'),
        });
      } else {
        findings.push({ checkId: 'smoke', severity: 'pass', title: 'homepage loaded clean', detail: '' });
      }

      for (const route of COMMON_ROUTES) {
        const status = result.routeStatuses[route];
        if (status === undefined) continue;
        if (status >= 500) {
          findings.push({
            checkId: 'smoke',
            severity: 'blocker',
            title: `${route} returned ${status}`,
            detail: 'Server error on a common route.',
          });
        } else if (status >= 400 && status !== 404) {
          findings.push({
            checkId: 'smoke',
            severity: 'warning',
            title: `${route} returned ${status}`,
            detail: 'Unexpected client error on a common route.',
          });
        }
      }

      return findings;
    } finally {
      if (server.stop) await server.stop();
    }
  }) as Check & ((ctx: CheckContext, deps?: SmokeDeps) => Promise<Finding[]>);
```

- [ ] **Step 4: Run smoke unit tests**

Run: `pnpm test:smoke`
Expected: 5 tests pass.

- [ ] **Step 5: Confirm default `pnpm test` still excludes smoke**

Run: `pnpm test`
Expected: all non-smoke tests pass; the smoke file is not executed.

- [ ] **Step 6: Commit**

```bash
git add src/smoke tests/smoke
git commit -m "feat(smoke): runSmokeTest module with mocked-deps unit tests (real runtime is V2 follow-up)"
```

---

## Task 19: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`**

```md
# ai-app-auditor

Pre-deploy quality and safety scanner for AI-generated **Next.js + Neon** apps.

It tells you whether your app is ready to ship, what will break, and which issues must be fixed first.

## Requirements

- Node 20+
- pnpm
- `OPENAI_API_KEY` set in your shell or `.env` (required — the AI summary, severity ranking, and fix order all use OpenAI `gpt-4o-mini`)

## Usage

```bash
# from the project to be audited
export OPENAI_API_KEY=sk-...
npx ai-app-auditor
# or with the optional Playwright smoke test
npx ai-app-auditor --smoke
# or against a different path
npx ai-app-auditor --path ../my-other-app
```

The report is printed to stdout and saved to `.ai-app-auditor/report.md` and `.ai-app-auditor/report.json` inside the scanned project.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | verdict is `ship` |
| 1 | operational error (missing key, bad path, API failure) |
| 2 | scan completed, verdict is `do-not-ship` |

CI pattern:

```bash
if npx ai-app-auditor; then echo "shipping"; else echo "blocked"; fi
```

## Development

```bash
pnpm install
pnpm test          # all non-smoke tests
pnpm test:smoke    # smoke unit tests
pnpm build
```

Strict TDD throughout: every behavior has a failing test before it has code.

## What it checks (V1)

- Project health: lockfile, README, `.env.example`, `tsconfig.json`
- Build / lint / test scripts (timed)
- Secret scan (OpenAI / AWS / Neon / Stripe keys)
- Env var hygiene (undocumented vars, risky `NEXT_PUBLIC_*_SECRET`-like names)
- Neon: `DATABASE_URL` documentation, migrations folder, route auth
- Next.js App Router: `/admin` and `/dashboard` middleware protection
- Optional: Playwright smoke test (`--smoke`)

## Privacy

- No code or `.env` files are uploaded anywhere.
- Only structured findings + stack metadata are sent to OpenAI — never source files.
- Matched secret strings are **redacted** before display or transmission.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with usage, exit codes, privacy notes"
```

---

## Task 20: End-to-end smoke against `good-next-neon`

**Files:**
- (no new files)

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: every test passes.

- [ ] **Step 2: Run the build**

Run: `pnpm build`
Expected: `dist/` is created cleanly.

- [ ] **Step 3: Run the CLI against `good-next-neon` manually (with a fake key, AI will error and exit 1 — that is expected without a real key)**

Run: `OPENAI_API_KEY=sk-test node dist/cli.js --path fixtures/good-next-neon`
Expected: exits 1 with an OpenAI API error message (because the test key is invalid). This confirms the pipeline runs all checks before the AI step.

- [ ] **Step 4: If a real `OPENAI_API_KEY` is available, run the real end-to-end**

Run: `OPENAI_API_KEY=$OPENAI_API_KEY node dist/cli.js --path fixtures/good-next-neon`
Expected: exit 0, Markdown printed to stdout, `.ai-app-auditor/report.md` and `report.json` created inside the fixture. Verdict: `ship`.

- [ ] **Step 5: Run against `broken-build`**

Run: `OPENAI_API_KEY=$OPENAI_API_KEY node dist/cli.js --path fixtures/broken-build`
Expected: exit 2 (verdict `do-not-ship`), build-failure blocker visible in the report.

- [ ] **Step 6: Commit (any tweaks discovered during dogfood)**

```bash
git status
# if anything changed:
git add .
git commit -m "chore: end-to-end dogfood adjustments"
```

---

## Self-Review

**Spec coverage:**
- §5 CLI contract (`--path`, `--smoke`, exit codes 0/1/2): Task 17 ✅
- §6 End-to-end flow: Tasks 5–18 ✅
- §7 Repo layout: Task 1 (skeleton), each module in its own task ✅
- §8 Core types: Task 2 ✅
- §9 Module signatures: each signature implemented in its named task ✅
- §10.1 healthCheck: Task 6 ✅
- §10.2 buildCheck, §10.3 lintCheck, §10.4 testCheck: Task 8 ✅
- §10.5 secretCheck: Task 9 ✅
- §10.6 envCheck (with shared SKIP_DIRS allowlist): Task 10 ✅
- §10.7 neonCheck: Task 11 ✅
- §10.8 routeCheck: Task 12 ✅
- §10.9 smokeTest: Task 18 (mocked-deps unit tests; real-browser meta-test deferred to V2 — called out in spec §17 open questions) ⚠️ partial
- §11 Score/verdict: Task 13 ✅
- §12 AI report writer: Task 14 ✅
- §13 Error handling: covered across Tasks 14 (OPENAI_API_KEY + retry) and 17 (CLI preflight + exit codes) ✅
- §14 Privacy: §10.5 redaction enforced by test "does NOT include the raw secret"; AI prompt sends only findings + stack metadata ✅
- §15 Testing strategy: Vitest, mirrored test layout, fixtures, mocked OpenAI, smoke gated behind `pnpm test:smoke` ✅
- §16 Milestones: aligned 1:1 with Tasks 1–20 ✅

**Partial coverage flag:** §10.9 spec describes a real Playwright runtime (boot dev server, drive Chromium, screenshot on failure). Task 18 ships the module shape, severity logic, and mocked-deps unit tests but defers the real `startServer` + `drive` implementations to V2 (the `defaultStartServer`/`defaultDrive` throw a clear "not yet implemented" error). The CLI still accepts `--smoke` so adding the runtime in V2 is purely an internal change. This is the only deliberate gap in the plan; it is called out in spec §17.

**Placeholder scan:** no TBD/TODO/"fill in"/"appropriate" markers in steps. Smoke-runtime deferral is explicit and tested via injected deps, not a hidden TODO.

**Type consistency:**
- `Finding` shape (`checkId`, `severity`, `title`, `detail`, optional `evidence`) used identically across all checks and `score.ts`.
- `Check` signature consistent — checks that need DI (`buildCheck`, `lintCheck`, `testCheck`, `runSmokeTest`) accept `(ctx, deps?)` and are exported with the dual type assertion so they still satisfy `Check`.
- `Report` fields (`verdict`, `score`, `blockers`, `warnings`, `passed`, `summary`, `fixOrder`, `generatedAt`) consistent across `aiReportWriter`, `renderMarkdown`, `renderJson`, `writeOutputs`, and `cli.ts`.
- `runCommand` signature `(cmd, { cwd, timeoutMs }) → Promise<CommandResult>` consistent in all four call sites (build/lint/test checks + orchestrator).
- `CheckContext` (`{ repoPath, stack }`) consistent across all checks and orchestrator.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-16-ai-app-auditor.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
