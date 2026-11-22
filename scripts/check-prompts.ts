import path from 'path';
import { checkPrompts } from '../packages/core/src/prompts/validator.js';

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
} else {
  console.log('All prompts passed budget and neutral identity checks.');
}
