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
# or against a different path
npx ai-app-auditor --path ../my-other-app
```

The report is printed to stdout and saved to `.ai-app-auditor/report.md` and `.ai-app-auditor/report.json` inside the scanned project.

> Note: `--smoke` (Playwright smoke test) is planned for V2 and not yet implemented in V1.

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

V2 will add the live Playwright smoke test (boot dev server, drive Chromium, check common routes).

## Privacy

- No code or `.env` files are uploaded anywhere.
- Only structured findings + stack metadata are sent to OpenAI — never source files.
- The `evidence` field (build/lint/test stderr snippets) is stripped before any AI call.
- Matched secret strings are **redacted** before display or transmission.
