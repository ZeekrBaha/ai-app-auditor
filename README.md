# ai-app-auditor

Pre-deploy quality and safety scanner for AI-generated **Next.js + Neon** apps.

It tells you whether your app is ready to ship, what will break, and which issues must be fixed first — combining deterministic static checks with an AI-written summary.

```
$ npx ai-app-auditor --path ./my-app
ai-app-auditor → scanning /Users/me/code/my-app

[1/9] Project health... ✓ (1ms)
[2/9] Build...          ✓ (5.9s)
[3/9] Lint...           ✓ (1.7s)
[4/9] Tests...          ✓ (484ms)
[5/9] Secret scan...    ✗ 1 blocker (8ms)
[6/9] Env hygiene...    ⚠ 1 warning (4ms)
[7/9] Neon DB checks... ✓ (0ms)
[8/9] App Router auth...✓ (0ms)
[9/9] AI report...      ✓ (2.0s)

Verdict: do-not-ship    Score: 75/100
```

## Why this exists

AI coding tools produce surprisingly working code, but they also produce surprisingly insecure code: hardcoded API keys, missing auth on admin routes, undocumented env vars, builds that pass locally but break in production. Reviewing every AI-generated change by hand doesn't scale.

`ai-app-auditor` is a single command you run before deploying. It gives you a verdict (`ship` / `do-not-ship`), a numeric score, the list of issues sorted by impact, and a plain-English summary written by `gpt-4o-mini`.

## Design philosophy

- **Deterministic core, AI cosmetic.** Verdict and score are computed by pure functions from a list of `Finding` objects. The AI is allowed to write the summary and reorder fixes — it cannot change the gate.
- **Hard-fail on missing AI key.** No silent degradation. If `OPENAI_API_KEY` isn't set, the tool exits with an operational error.
- **Privacy by construction.** Source files are never sent to OpenAI. Only structured findings (titles, severities, paths) and stack metadata. The `evidence` field — which may contain stderr snippets with absolute paths — is stripped before the OpenAI call, at a layer above the dependency boundary so the guarantee holds regardless of which AI implementation is injected.
- **Strict TDD.** Every behavior has a failing test before it has code. 69 tests, all real (no mock-only tests).

## Requirements

- Node 20+
- pnpm (for development; not needed by end users)
- `OPENAI_API_KEY` available in `process.env`

## Usage

```bash
# from the project to be audited
export OPENAI_API_KEY=sk-...
npx ai-app-auditor

# or against a different path
npx ai-app-auditor --path ../my-other-app

# load the key from a .env file (Node 20+ built-in)
node --env-file=.env.local $(which ai-app-auditor) --path .
```

The markdown report is streamed to stdout and also saved to `.ai-app-auditor/report.md` and `.ai-app-auditor/report.json` inside the scanned project. Progress lines are printed to stderr, so piping (`> report.md`) gives you a clean file.

> Note: `--smoke` (Playwright smoke test) is planned for V2 and not yet implemented in V1.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | verdict is `ship` |
| 1 | operational error (missing key, bad path, API failure) |
| 2 | scan completed, verdict is `do-not-ship` |

CI pattern:

```bash
if npx ai-app-auditor; then
  echo "shipping"
  ./deploy.sh
else
  echo "blocked — see .ai-app-auditor/report.md"
  exit 1
fi
```

## Architecture

The tool is a pipeline of pure-ish functions. Each check is a `Check` that receives a `CheckContext` (repo path + detected stack) and returns a list of `Finding` objects. The orchestrator runs them sequentially, scores the result deterministically, then calls OpenAI for the summary.

```
                ┌──────────────────────────────┐
                │  CLI (src/cli.ts)            │
                │  - parse args                │
                │  - preflight (key, path)     │
                │  - create stderr reporter    │
                └──────────────┬───────────────┘
                               │
                ┌──────────────▼───────────────┐
                │  Orchestrator                │
                │  (src/orchestrator.ts)       │
                └──────────────┬───────────────┘
                               │
                               │  runStep(name, fn)
                               │  emits start/done to reporter
                               ▼
       ┌───────────────────────────────────────────────┐
       │  Stack detection (src/detect/stack.ts)        │
       │  reads package.json, lockfile, deps           │
       └────────────────────┬──────────────────────────┘
                            │  StackInfo
                            ▼
       ┌───────────────────────────────────────────────┐
       │  8 deterministic checks (src/checks/*.ts)     │
       │  each → Finding[]                             │
       │                                               │
       │  health → build → lint → tests → secret →     │
       │  env → neon → route                           │
       └────────────────────┬──────────────────────────┘
                            │  Finding[]
                            ▼
       ┌───────────────────────────────────────────────┐
       │  Scoring (src/score.ts) — PURE                │
       │  100 − (20 × blockers) − (5 × warnings)       │
       │  blocker OR score < 50 ⇒ do-not-ship          │
       └────────────────────┬──────────────────────────┘
                            │  ScoreResult
                            ▼
       ┌───────────────────────────────────────────────┐
       │  AI report writer (src/ai/reportWriter.ts)    │
       │  - strip `evidence` (privacy)                 │
       │  - call gpt-4o-mini (1 retry)                 │
       │  - summary + fixOrder ONLY                    │
       │  - verdict/score NOT taken from AI            │
       └────────────────────┬──────────────────────────┘
                            │  Report
                            ▼
       ┌───────────────────────────────────────────────┐
       │  Output (src/output/*.ts)                     │
       │  - renderMarkdown → stdout                    │
       │  - writeOutputs   → .ai-app-auditor/          │
       └───────────────────────────────────────────────┘
```

### File structure

```
src/
├── cli.ts                # entrypoint, arg parsing, preflight, exit codes
├── orchestrator.ts       # composes the pipeline
├── score.ts              # pure scoring + verdict
├── types.ts              # shared types: Finding, Check, Report, Reporter
├── detect/
│   └── stack.ts          # detect Next/Neon, package manager, scripts
├── checks/               # 8 deterministic checks (one per file)
│   ├── health.ts
│   ├── build.ts
│   ├── lint.ts
│   ├── test.ts
│   ├── secret.ts
│   ├── env.ts
│   ├── neon.ts
│   └── route.ts
├── ai/
│   └── reportWriter.ts   # OpenAI call + privacy redaction
├── runner/
│   └── command.ts        # execa wrapper with timeout
├── output/
│   ├── markdown.ts       # render Report → markdown
│   ├── json.ts           # render Report → JSON
│   ├── reporter.ts       # stderr progress reporter
│   └── write.ts          # write report files to disk
├── smoke/
│   └── playwright.ts     # V2 stub (lazy-loaded)
└── util/
    ├── fs.ts             # exists, walkFiles, SKIP_DIRS
    └── text.ts           # lastNLines helper
```

## What it checks (V1)

| # | Check | What it looks for | Severity if found |
|---|---|---|---|
| 1 | **Project health** | `package.json`, lockfile, `tsconfig.json`, `README.md`, `.env.example` exist | warning |
| 2 | **Build** | `pnpm/npm/yarn build` exits 0 within timeout | blocker on failure |
| 3 | **Lint** | `lint` script exists and exits 0 | warning |
| 4 | **Tests** | `test` script exists and exits 0 | blocker on failure |
| 5 | **Secret scan** | Hardcoded OpenAI / AWS / Neon / Stripe keys in source or `.env*` files | blocker |
| 6 | **Env hygiene** | Vars referenced in source but missing from `.env.example`; risky `NEXT_PUBLIC_*_SECRET`-style names | warning / blocker |
| 7 | **Neon DB** | `DATABASE_URL` documented; migrations folder present; route handlers that touch the DB are auth-guarded | warning / blocker |
| 8 | **App Router auth** | `/admin` and `/dashboard` routes have middleware protection | blocker |

Each check is one file under `src/checks/` implementing the `Check` interface — easy to read, easy to add to.

### Scoring rules

```
score = max(0, 100 − (20 × blockers) − (5 × warnings))
verdict = "do-not-ship" if any blocker OR score < 50, else "ship"
```

These are pure functions in `src/score.ts` — covered by unit tests, never touched by the AI.

## Tools and dependencies

| Tool | Why |
|---|---|
| **TypeScript** (strict, ESM) | Type safety, modern syntax, single-language stack |
| **commander** | CLI argument parsing |
| **execa** | Reliable child-process spawning with timeouts |
| **openai** | Official SDK for `gpt-4o-mini` |
| **vitest** | Test runner — fast, ESM-native, good DX |
| **playwright** *(devDep)* | V2 smoke test, lazy-loaded so V1 install stays light |

Zero runtime dependencies beyond those three. No build-time codegen, no bundler — `tsc` emits `dist/` directly.

## Privacy

- **No code or `.env` files are uploaded anywhere.** Ever.
- Only structured findings (title, severity, paths) and stack metadata are sent to OpenAI.
- The `evidence` field (which contains stderr snippets from build/lint/test runs, potentially with absolute paths) is **stripped before the AI call** — see `redactForAI` in `src/ai/reportWriter.ts`. The stripping happens above the dependency boundary, so the guarantee holds regardless of which `createCompletion` implementation is injected.
- Matched secret strings are **redacted** before display or transmission.
- The AI cannot change the verdict or score. It can only write the `summary` and reorder `fixOrder`. The deterministic gate is computed before the AI call and is not read from its response.

## Development

```bash
pnpm install
pnpm test          # 69 unit tests (excludes smoke)
pnpm test:smoke    # smoke unit tests
pnpm typecheck     # tsc on src + tests
pnpm build         # tsc emit to dist/
```

### TDD discipline

This project follows strict test-driven development:
1. Write a failing test (red).
2. Run it to confirm it fails for the right reason.
3. Write the minimum code to make it pass (green).
4. Refactor if needed; tests stay green.
5. Commit.

Every commit on this repo follows that cycle. If you contribute, please do the same.

### Adding a new check

1. Create `src/checks/myCheck.ts` exporting a function matching `Check<D = unknown>` from `src/types.ts`.
2. Write the failing test at `tests/checks/myCheck.test.ts` first.
3. Wire it into the orchestrator in `src/orchestrator.ts` between `runStep(...)` calls.
4. Bump `totalSteps` in `src/cli.ts` so the progress numbers stay accurate.

Each check returns `Finding[]`. A finding with `severity: 'pass'` is shown under "Passed Checks" in the report — those are the green ticks. `blocker` and `warning` drive the score and verdict.

## Roadmap (V2)

- Playwright smoke test (`--smoke` flag, currently a stub): boot dev server, drive Chromium against common routes, surface runtime errors.
- `.env` / `.env.local` auto-loading in the CLI (currently requires `node --env-file=` or `export`).
- More checks: rate limiting, CSRF on POST routes, Prisma migration drift.
- HTML report output as an alternative to markdown.

## License

MIT
