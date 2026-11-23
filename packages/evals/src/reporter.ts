import fs from 'fs';
import path from 'path';
import os from 'os';
import type { EvalSuiteReport } from './types.js';

export function formatMarkdownReport(report: EvalSuiteReport): string {
  const lines: string[] = [];
  lines.push(`# Eval Scoreboard: ${report.suite.toUpperCase()} Suite`);
  lines.push('');
  lines.push(`- **Model:** \`${report.model}\``);
  lines.push(`- **Date:** ${report.timestamp}`);
  lines.push(`- **Run ID:** \`${report.runId}\``);
  lines.push(`- **Total Duration:** ${(report.durationMs / 1000).toFixed(2)}s`);
  lines.push(`- **Total Tokens:** ${report.tokensUsed}`);
  lines.push(`- **Pass Rate:** **${report.tasksPassed} / ${report.tasksTotal} (${report.scorePercent}%)**`);
  lines.push('');
  lines.push('| Task ID | Description | Status | Duration | Score | Checks |');
  lines.push('|---|---|:---:|:---:|:---:|:---:|');

  for (const t of report.taskResults) {
    const statusBadge = t.passed ? '✅ PASS' : '❌ FAIL';
    const checksRatio = `${t.checkResults.filter((c) => c.passed).length}/${t.checkResults.length}`;
    const scorePct = `${Math.round(t.score * 100)}%`;
    lines.push(
      `| \`${t.taskId}\` | ${t.description} | ${statusBadge} | ${t.durationMs}ms | ${scorePct} | ${checksRatio} |`,
    );
  }

  lines.push('');
  lines.push('### Task Details');
  for (const t of report.taskResults) {
    lines.push(`#### ${t.taskId}`);
    lines.push(`- **Description:** ${t.description}`);
    lines.push(`- **Tools Invoked:** ${t.toolsInvoked.length > 0 ? t.toolsInvoked.join(', ') : 'none'}`);
    if (t.error) {
      lines.push(`- **Error:** \`${t.error}\``);
    }
    lines.push('- **Checks:**');
    for (const c of t.checkResults) {
      const mark = c.passed ? '✓' : '✖';
      lines.push(`  - [${mark}] \`${c.name}\` (${c.type})`);
      if (!c.passed && c.error) {
        lines.push(`    - Error: ${c.error}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function saveEvalReport(report: EvalSuiteReport, targetDir?: string): { jsonPath: string; mdPath: string } {
  const dir = targetDir || path.join(os.homedir(), '.fam', 'evals');
  fs.mkdirSync(dir, { recursive: true });

  const jsonPath = path.join(dir, `${report.runId}.json`);
  const mdPath = path.join(dir, `${report.runId}.md`);

  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8');
  fs.writeFileSync(mdPath, formatMarkdownReport(report), 'utf-8');

  return { jsonPath, mdPath };
}
