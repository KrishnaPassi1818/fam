import fs from 'fs';
import path from 'path';
import { estimateTokens } from '../packages/shared/src/tokens/index.js';
const BANNED_PATTERNS = [
    /\bclaude\b/i,
    /\banthropic\b/i,
    /\bopenai\b/i,
    /\bchatgpt\b/i,
    /\bgpt-4\b/i,
    /\bmythos\b/i,
    /\bproject glasswing\b/i,
];
function findPromptFiles(dir) {
    const results = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...findPromptFiles(fullPath));
        }
        else if (entry.name.endsWith('.md')) {
            results.push(fullPath);
        }
    }
    return results;
}
export function checkPrompts(promptsDir) {
    const files = findPromptFiles(promptsDir);
    const results = [];
    let allPassed = true;
    for (const file of files) {
        const content = fs.readFileSync(file, 'utf-8');
        // Parse frontmatter
        const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        if (!match || !match[1]) {
            console.error(`[FAIL] ${file}: Missing frontmatter with budget`);
            allPassed = false;
            continue;
        }
        const frontmatter = match[1];
        const budgetMatch = frontmatter.match(/budget:\s*(\d+)/);
        if (!budgetMatch || !budgetMatch[1]) {
            console.error(`[FAIL] ${file}: Missing 'budget: N' in frontmatter`);
            allPassed = false;
            continue;
        }
        const budget = parseInt(budgetMatch[1], 10);
        // Strip frontmatter for token counting
        const body = content.slice(match[0].length).trim();
        const tokens = estimateTokens(body);
        const bannedFound = [];
        for (const pattern of BANNED_PATTERNS) {
            if (pattern.test(body)) {
                bannedFound.push(pattern.source);
            }
        }
        const passed = tokens <= budget && bannedFound.length === 0;
        if (!passed)
            allPassed = false;
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
// Run CLI check if executed directly
const isMain = process.argv[1]?.endsWith('check-prompts.ts') || process.argv[1]?.endsWith('check-prompts.js');
if (isMain) {
    const promptsDir = path.resolve(process.cwd(), 'prompts');
    const { allPassed, results } = checkPrompts(promptsDir);
    console.log('=== Prompt Budget and Identity Check ===');
    console.log(`${'STATUS'.padEnd(8)} | ${'TOKENS / BUDGET'.padEnd(16)} | PROMPT FILE`);
    console.log('-'.repeat(70));
    for (const r of results) {
        const status = r.passed ? ' PASS ' : ' FAIL ';
        const tokStr = `${r.tokens} / ${r.budget} tok`.padEnd(16);
        console.log(`[${status}] | ${tokStr} | ${r.file}`);
        if (r.bannedStrings.length > 0) {
            console.log(`         -> Found banned vendor strings: ${r.bannedStrings.join(', ')}`);
        }
        if (r.tokens > r.budget) {
            console.log(`         -> Exceeded token budget by ${r.tokens - r.budget} tokens!`);
        }
    }
    console.log('-'.repeat(70));
    if (!allPassed) {
        console.error('Prompt checks failed!');
        process.exit(1);
    }
    else {
        console.log('All prompts passed budget and neutral identity checks.');
    }
}
//# sourceMappingURL=check-prompts.js.map