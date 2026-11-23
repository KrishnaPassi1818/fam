import { describe, it, expect, beforeAll } from 'vitest';
import { ToolRetriever } from '../tools/retriever.js';
import { REGISTRY_45_TOOLS, EVAL_40_PROMPTS } from '../router/fixtures.js';

describe('Phase 5: 40-Prompt Tool-Selection Evaluation (T5.7)', () => {
  let retriever: ToolRetriever;

  beforeAll(async () => {
    retriever = new ToolRetriever({ defaultTopK: 6 });
    for (const tool of REGISTRY_45_TOOLS) {
      retriever.registerTool(tool);
    }
  });

  it('verifies that registry contains >= 40 registered tools', () => {
    expect(REGISTRY_45_TOOLS.length).toBeGreaterThanOrEqual(40);
    expect(retriever.getAllTools().length).toBeGreaterThanOrEqual(40);
  });

  it('achieves >= 85% correct-tool selection accuracy across 40 evaluation prompts (T5.7 AC)', async () => {
    let correctCount = 0;
    const failures: Array<{ prompt: string; expected: string; retrieved: string[] }> = [];

    for (const testCase of EVAL_40_PROMPTS) {
      const retrieved = await retriever.retrieve(testCase.prompt, {
        categories: [testCase.category],
      });

      const retrievedNames = retrieved.map((t) => t.name);
      if (retrievedNames.includes(testCase.target)) {
        correctCount++;
      } else {
        failures.push({
          prompt: testCase.prompt,
          expected: testCase.target,
          retrieved: retrievedNames,
        });
      }
    }

    const accuracy = (correctCount / EVAL_40_PROMPTS.length) * 100;
    // Task T5.7 acceptance criterion: >= 85% correct-tool selection
    expect(accuracy).toBeGreaterThanOrEqual(85);
  }, 30000);
});
