# ai-app-auditor — V1 Design Spec

**Date**: 2026-05-16
**Status**: Approved through brainstorming, ready for implementation planning
**Owner**: Baha

## 1. One-line concept

`ai-app-auditor` is a CLI that scans an AI-generated Next.js + Neon app and produces an AI-written ship / do-not-ship verdict with prioritized fixes, before the user commits to GitHub or deploys.

## 2. Goals (V1)

- Answer one question: *"Is this AI-built app safe enough to deploy right now?"*
- Cover the narrow but hot stack: **Next.js (App Router) + Neon Postgres**.
- Run locally via `npx ai-app-auditor` against any repo path.
- Produce a Markdown + JSON report in `.ai-app-auditor/` and print Markdown to stdout.
- AI (`gpt-4o-mini`) is **required** — used to summarize, rank, and explain findings in plain English. No silent degradation.
- Built strictly TDD: every behavior has a failing test before it has code.

## 3. Non-goals (V1)

- Other frameworks (Vite, plain Node, Remix, Svelte, etc.).
- Other databases (Supabase, Prisma+SQLite, MongoDB, etc.).
- Hosted SaaS / dashboard / GitHub App.
- Automatic fix PRs.
- Billing.
- Plugin system / community-contributed checks.
- Static analysis depth beyond what the listed checks need.

## 4. Stack & conventions

| | |
|---|---|
| Language | TypeScript, Node 20+ |
| Package manager | pnpm |
| Test runner | Vitest |
| Browser automation (smoke) | Playwright (chromium) |
| LLM | OpenAI `gpt-4o-mini` via official SDK |
| Distribution | `npx ai-app-auditor` (published to npm later) |
| Repo location | `~/Desktop/llm-ai-projects/ai-app-auditor/` |
| Coding rules | Karpathy principles in `~/.claude/CLAUDE.md` |
| Discipline | Strict TDD (red → verify red → green → verify green → refactor) |

## 5. CLI contract

```bash
npx ai-app-auditor [--path <dir>] [--smoke]
```

- `--path <dir>` (default: `.`) — repo to scan
- `--smoke` — also run Playwright smoke test (adds ~2 min)

**Exit codes**:
- `0` — verdict is `ship`
- `1` — operational error (missing key, bad path, API failure, smoke setup)
- `2` — scan completed, verdict is `do-not-ship`

This gives a clean CI pattern: `if npx ai-app-auditor; then deploy; fi`.

## 6. End-to-end flow

```
User runs:  npx ai-app-auditor [--smoke] [--path .]
                │
                ▼
   1. detectStack(repoPath)        → StackInfo
                │
                ▼
   2. runChecks(checks, ctx)       → Finding[]
        - healthCheck
        - buildCheck    (timeout 120s)
        - lintCheck     (timeout 60s)
        - testCheck     (timeout 180s)
        - secretCheck
        - envCheck
        - neonCheck
        - routeCheck
                │
                ▼
   3. runSmokeTest(ctx)            → Finding[]   (only with --smoke)
                │
                ▼
   4. score+verdict (deterministic)
                │
                ▼
   5. aiReportWriter(findings)     → summary, fixOrder, explanations
                │
                ▼
   6. writeOutputs(report)         → .ai-app-auditor/report.md + report.json
                                    + Markdown printed to stdout
```

## 7. Repo layout

```
ai-app-auditor/
├── src/
│   ├── cli.ts                    # arg parsing, exit codes
│   ├── orchestrator.ts           # the pipeline
│   ├── detect/
│   │   └── stack.ts              # detectStack()
│   ├── checks/
│   │   ├── health.ts
│   │   ├── build.ts
│   │   ├── lint.ts
│   │   ├── test.ts
│   │   ├── secret.ts
│   │   ├── env.ts
│   │   ├── neon.ts
│   │   └── route.ts
│   ├── smoke/
│   │   └── playwright.ts         # only loaded if --smoke
│   ├── ai/
│   │   └── reportWriter.ts       # OpenAI call
│   ├── output/
│   │   ├── markdown.ts
│   │   └── json.ts
│   ├── runner/
│   │   └── command.ts            # timeout-wrapped exec
│   └── types.ts                  # all shared types
├── tests/                        # mirrors src/, one .test.ts per file
├── fixtures/                     # tiny synthetic repos for tests
│   ├── good-next-neon/
│   ├── broken-build/
│   ├── leaked-secret/
│   ├── missing-env/
│   ├── public-admin/
│   └── neon-noauth/
├── docs/superpowers/specs/
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

## 8. Core types

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
  score: number;                  // 0–100, deterministic
  blockers: Finding[];
  warnings: Finding[];
  passed: Finding[];
  summary: string;                // AI-written
  fixOrder: string[];             // AI-written
  generatedAt: string;            // ISO timestamp
};
```

## 9. Module signatures

```ts
detectStack(repoPath: string): Promise<StackInfo>

runChecks(checks: Check[], ctx: CheckContext): Promise<Finding[]>

runSmokeTest(ctx: CheckContext): Promise<Finding[]>

aiReportWriter(findings: Finding[], stack: StackInfo): Promise<Report>

writeOutputs(report: Report, repoPath: string): Promise<void>

runCommand(
  cmd: string,
  opts: { cwd: string; timeoutMs: number }
): Promise<{ exitCode: number; stdout: string; stderr: string; timedOut: boolean }>
```

## 10. The 8 V1 checks

### 10.1 `healthCheck` — project-level signals (no commands run)
- Missing lockfile → **warning**
- Missing `.env.example` → **warning**
- Missing README → **warning**
- Has `package.json` → **pass**
- Has `tsconfig.json` → **pass**

### 10.2 `buildCheck` — runs `pnpm build` if `scripts.build` exists, 120s timeout
- Exit 0 → **pass** ("Build succeeded")
- Non-zero → **blocker** with last 40 lines of stderr in `evidence`
- Timeout → **blocker** ("Build exceeded 120s")
- Script missing → **warning**

### 10.3 `lintCheck` — runs lint if available, 60s timeout
- Exit 0 → **pass**
- Non-zero → **warning** (AI may escalate to blocker contextually but baseline stays warning)
- Script missing → **warning**

### 10.4 `testCheck` — runs test if available, 180s timeout
- Exit 0 → **pass**
- Non-zero → **blocker**
- Script missing → **warning** ("No tests defined")

### 10.5 `secretCheck` — pattern scan of tracked source files
Skip `node_modules`, `.next`, `.git`, `dist`, `.ai-app-auditor`.

Patterns:
- OpenAI keys: `sk-[a-zA-Z0-9]{20,}`
- AWS access keys: `AKIA[0-9A-Z]{16}`
- Neon connection strings: `postgresql://[^@]+@ep-[a-z0-9-]+\.[a-z0-9-]+\.neon\.tech/`
- Stripe live keys: `sk_live_[a-zA-Z0-9]{20,}`, `pk_live_[a-zA-Z0-9]{20,}`

- Any match → **blocker** with file path and line number. The matched string itself is **redacted** in the report.
- No matches → **pass**

### 10.6 `envCheck` — env var hygiene
- Scan source files (same allowlist as `secretCheck`: skip `node_modules`, `.next`, `.git`, `dist`, `.ai-app-auditor`) for `process.env.X` references → collect required var names.
- Diff against `.env.example` keys.
- Each missing var → **warning** ("Document `X` in .env.example")
- Any `NEXT_PUBLIC_*` var whose name contains `KEY`, `SECRET`, `TOKEN`, or `PASSWORD` → **blocker** (likely accidental client-side exposure)

### 10.7 `neonCheck` — only runs if `stack.usesNeon === true`
- `DATABASE_URL` not in `.env.example` → **blocker**
- Drizzle or Prisma detected (via dependencies) but no `drizzle/` or `prisma/migrations/` folder → **warning**
- Any `app/**/route.{ts,tsx}` that imports `@neondatabase/serverless` AND has no auth import (`auth`, `getServerSession`, `currentUser`) in the same file → **warning** ("API route queries Neon but no auth check detected")

### 10.8 `routeCheck` — Next.js App Router protection
- Enumerate `app/**/page.{ts,tsx}`.
- If `app/admin/` exists and no `middleware.ts` references `/admin` → **blocker**
- If `app/dashboard/` exists and no `middleware.ts` references `/dashboard` → **warning**
- Count routes → **pass** ("Detected N routes")

### 10.9 `smokeTest` (opt-in, `--smoke`)
- Boot dev server (`pnpm dev` with 30s readiness timeout, polling `http://localhost:3000`).
- Load homepage; capture console errors and failed network requests.
- Try common routes (`/login`, `/signup`, `/dashboard`, `/admin`) — 200 and 404 are both fine (route exists or not). Any 4xx other than 404, or any 5xx, is a failure.
- Console error on homepage or any 5xx on a tried route → **blocker** with screenshot path under `.ai-app-auditor/screenshots/`.
- Any non-404 4xx on a tried route → **warning**.
- All clean → **pass**.
- Server fails to boot in 30s → **blocker** ("Dev server failed to start within 30s").

## 11. Score & verdict (deterministic, pre-AI)

- Start at 100. Each **blocker** = −20. Each **warning** = −5. Floor at 0.
- Verdict: `do-not-ship` if any blocker OR `score < 50`. Otherwise `ship`.
- AI **cannot** mutate `verdict` or `score`. AI only writes `summary`, `fixOrder`, and per-finding `explanations`.

## 12. AI report writer

- Single OpenAI call at the end of the pipeline.
- Model: `gpt-4o-mini`.
- Mode: structured outputs (`response_format: { type: "json_schema" }`).
- Input: `Finding[]` + `StackInfo` + deterministic `verdict`/`score`.
- Output schema: `{ summary: string, fixOrder: string[], explanations: Record<checkId, string> }`.
- System prompt rules:
  - MUST NOT invent findings not in the input.
  - MUST NOT change the verdict or score.
  - `fixOrder` items reuse existing finding titles, ordered blockers-first then warnings, by descending impact.
- `reportWriter` composes the final `Report` by merging deterministic fields with AI-generated fields. AI never gets a chance to mutate numeric fields.

## 13. Error handling

| Failure | Behavior |
|---|---|
| `OPENAI_API_KEY` missing at start of run | Exit 1: `OPENAI_API_KEY required. Set it in your shell or .env. See README.` |
| OpenAI API errors (rate limit, network, 5xx) | Retry once with 1s backoff. Second failure → exit 1 with API error message. **No silent degradation.** |
| OpenAI returns malformed JSON | Exit 1; raw response logged to `.ai-app-auditor/error.log` |
| `--smoke` requested but Playwright not installed | Exit 1: `Playwright not installed. Run: pnpm add -D playwright && pnpm exec playwright install chromium` |
| `--smoke` dev server fails to boot in 30s | Single **blocker** finding; rest of pipeline completes; AI report still generated |
| Any `runCommand` timeout | Becomes a finding (blocker for build/test, warning for lint); pipeline continues |
| Unreadable file during scan | Logged to stderr, skipped, scan continues |
| `repoPath` doesn't exist or isn't a directory | Exit 1 before any checks run |
| No `package.json` at `repoPath` | Exit 1: `Not a Node.js project (no package.json found)` |

## 14. Data privacy rules

- Do not upload code or `.env` files anywhere.
- Send only structured findings + stack metadata to OpenAI — never full source files.
- Redact matched secret strings in the report and never include them in the OpenAI payload.
- All outputs are local files inside the scanned repo's `.ai-app-auditor/`.

## 15. Testing strategy (TDD)

- **Framework**: Vitest.
- **Unit tests** mirror `src/` layout in `tests/`. One `.test.ts` per source file.
- **Fixture repos** under `fixtures/`:
  - `good-next-neon/` — clean app; should produce verdict `ship`, score 100.
  - `broken-build/` — build script exits non-zero.
  - `leaked-secret/` — has `sk-...` in source.
  - `missing-env/` — uses `process.env.FOO` without documenting it.
  - `public-admin/` — `app/admin/` with no middleware.
  - `neon-noauth/` — Neon query in route with no auth import.
- **Integration test** runs full orchestrator against `good-next-neon` and `broken-build` with OpenAI mocked.
- **AI prompt test** mocks OpenAI SDK; asserts prompt forbids inventing findings and that deterministic fields are preserved post-merge.
- **CLI test** spawns CLI as subprocess against fixtures; asserts exit codes and stdout.
- **Smoke meta-test** spawns the dev server of `good-next-neon` and drives a real Chromium. Gated behind `pnpm test:smoke` — not part of default `pnpm test`.

**TDD cadence per check**:
```
RED:   write check.test.ts asserting expected Finding[] for fixture
       run `pnpm test check` → must FAIL ("function not implemented")
GREEN: write src/checks/<check>.ts with minimal logic
       run `pnpm test check` → must PASS
       run `pnpm test` → all other tests still pass
REFAC: rename, extract helpers; tests stay green
```

**Coverage rule for V1**: every `Check` function and the orchestrator must have ≥1 fixture-based test before merge.

**Mock policy**:
- Mock OpenAI SDK always.
- Mock `child_process` only inside `runCommand` tests. Checks that use `runCommand` mock `runCommand` itself.
- Mock filesystem only when testing error paths.
- Do NOT mock fixture reads or Playwright in the smoke meta-test.

## 16. Milestones (rough order — `writing-plans` skill will produce the detailed step-by-step plan)

1. Project skeleton + CLI arg parsing + `runCommand` helper.
2. `detectStack` + `healthCheck`.
3. `buildCheck`, `lintCheck`, `testCheck` (share `runCommand`).
4. `secretCheck`, `envCheck`.
5. `neonCheck`, `routeCheck`.
6. Orchestrator + deterministic score/verdict.
7. AI report writer + Markdown/JSON output.
8. CLI end-to-end + exit-code contract.
9. `--smoke` Playwright module.
10. README + first dogfood against a real AI-generated Next.js + Neon app.

## 17. Open questions (for future versions, not blocking V1)

- Should reports be diff-able across runs? (Maybe `.ai-app-auditor/history/`.)
- Should there be a `--fix` flag that opens a PR or writes patches? (V2 candidate.)
- Should we expand to Supabase / Vite / Vercel-detection in V2?
- Hosted dashboard with scan history?

## 18. Related notes

- Original wiki ideation: `~/Desktop/llm-ai-projects/wiki/ai-vibe-coding-ideas/vibe-qa-ship-checker-plan.md`
- Karpathy coding principles: `~/.claude/CLAUDE.md`
- TDD memory: `~/.claude/projects/-Users-baha/memory/feedback_tdd_default.md`
