import fs from 'fs';
import path from 'path';
import { estimateTokens } from '@hx/shared';

export interface PromptCheckResult {
  file: string;
  budget: number;
  tokens: number;
  passed: boolean;
  bannedStrings: string[];
}

export const BANNED_PATTERNS = [
  /\bclaude\b/i,
  /\banthropic\b/i,
  /\bopenai\b/i,
  /\bchatgpt\b/i,
  /\bgpt-4\b/i,
  /\bmythos\b/i,
  /\bproject glasswing\b/i,
];

function findPromptFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findPromptFiles(fullPath));
    } else if (entry.name.endsWith('.md')) {
      results.push(fullPath);
    }
  }
  return results;
}

export function checkPrompts(promptsDir: string): { allPassed: boolean; results: PromptCheckResult[] } {
  const files = findPromptFiles(promptsDir);
  const results: PromptCheckResult[] = [];
  let allPassed = true;

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');

    // Parse frontmatter
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match || !match[1]) {
      results.push({
        file: path.relative(process.cwd(), file),
        budget: 0,
        tokens: 0,
        passed: false,
        bannedStrings: ['Missing frontmatter'],
      });
      allPassed = false;
      continue;
    }

    const frontmatter = match[1];
    const budgetMatch = frontmatter.match(/budget:\s*(\d+)/);
    if (!budgetMatch || !budgetMatch[1]) {
      results.push({
        file: path.relative(process.cwd(), file),
        budget: 0,
        tokens: 0,
        passed: false,
        bannedStrings: ["Missing 'budget: N' in frontmatter"],
      });
      allPassed = false;
      continue;
    }

    const budget = parseInt(budgetMatch[1], 10);
    // Strip frontmatter for token counting
    const body = content.slice(match[0].length).trim();
    const tokens = estimateTokens(body);

    const bannedFound: string[] = [];
    for (const pattern of BANNED_PATTERNS) {
      if (pattern.test(body)) {
        bannedFound.push(pattern.source);
      }
    }

    const passed = tokens <= budget && bannedFound.length === 0;
    if (!passed) allPassed = false;

    results.push({
      file: path.relative(process.cwd(), file),
      budget,
      tokens,
      passed,
      bannedStrings: bannedFound,
    });
  }

  return { allPassed, results };
}
