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
