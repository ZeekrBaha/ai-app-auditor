import OpenAI from 'openai';
import type { Finding, Report, StackInfo } from '../types.js';
import { scoreFindings } from '../score.js';

export type AIPayload = {
  summary: string;
  fixOrder: string[];
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
3. "fixOrder" must reuse the existing finding titles verbatim, blockers first then warnings, ordered by impact. If there are no blockers, fixOrder still lists warnings by impact.
4. "summary" is 2-4 sentences for a non-expert audience.

Respond with JSON matching the schema {summary: string, fixOrder: string[]}.`;

// Strip evidence before sending to OpenAI: stderr/stdout snippets may contain absolute paths
// and source-file content (spec §14 forbids sending source to OpenAI).
function redactForAI(findings: Finding[]): Omit<Finding, 'evidence'>[] {
  return findings.map(({ evidence: _e, ...rest }) => rest);
}

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
  const parsed = JSON.parse(raw) as Partial<AIPayload>;
  if (typeof parsed.summary !== 'string' || !Array.isArray(parsed.fixOrder)) {
    throw new Error('AI returned malformed payload: missing summary or fixOrder');
  }
  return { summary: parsed.summary, fixOrder: parsed.fixOrder };
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
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
    throw new Error('OPENAI_API_KEY required. Set it in your shell (e.g. `export OPENAI_API_KEY=sk-...`). See README.');
  }
  const create = deps.createCompletion ?? defaultCreateCompletion;
  const { verdict, score, blockers, warnings, passed } = scoreFindings(findings);
  // Redact evidence (file paths + stderr snippets) before the dep boundary, so the
  // privacy guarantee holds regardless of which createCompletion implementation runs.
  const aiFindings = redactForAI(findings);
  const ai = await withRetry(() => create({ findings: aiFindings, stack, verdict, score }));

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
