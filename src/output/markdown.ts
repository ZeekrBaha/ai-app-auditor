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
