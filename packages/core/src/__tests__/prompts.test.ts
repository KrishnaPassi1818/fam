import { describe, it, expect } from 'vitest';
import path from 'path';
import { checkPrompts } from '../prompts/validator.js';

describe('Prompt Budget & Identity Validation', () => {
  it('validates all prompts adhere to token budgets and neutral identity', () => {
    const promptsDir = path.resolve(process.cwd(), 'prompts');
    const { allPassed, results } = checkPrompts(promptsDir);

    expect(results.length).toBeGreaterThanOrEqual(9);
    for (const r of results) {
      expect(r.tokens).toBeLessThanOrEqual(r.budget);
      expect(r.bannedStrings).toHaveLength(0);
      expect(r.passed).toBe(true);
    }
    expect(allPassed).toBe(true);
  });
});
