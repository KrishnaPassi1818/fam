import { describe, it, expect } from 'vitest';
import { checkPrompts } from '../prompts/validator.js';
import { resolvePromptsDir } from '../prompts/builder.js';

describe('Prompt Budget & Identity Validation', () => {
  it('validates all prompts adhere to token budgets and neutral identity', () => {
    const promptsDir = resolvePromptsDir();
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
