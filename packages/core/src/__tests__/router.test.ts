import { describe, it, expect } from 'vitest';
import { Router } from '../router/index.js';
import { detectPrivacyFastPath, estimateComplexity } from '../router/rules.js';
import { RoutingPolicy } from '../router/policy.js';
import { PrivacyBlocked } from '@fam/shared';
import { LABELED_ROUTING_PROMPTS } from '../router/fixtures.js';

describe('Phase 5: Router & Routing Policy (T5.1 & T5.2)', () => {
  it('detects privacy levels accurately on sensitive queries', () => {
    expect(detectPrivacyFastPath('read file .env')).toBe('local_only');
    expect(detectPrivacyFastPath('my secret_key is exposed')).toBe('local_only');
    expect(detectPrivacyFastPath('here is the password for the database')).toBe('local_only');
    expect(detectPrivacyFastPath('check credentials.json')).toBe('local_only');
    expect(detectPrivacyFastPath('git status')).toBe('normal');
    expect(detectPrivacyFastPath('hello world')).toBe('normal');
  });

  it('estimates complexity correctly based on keywords and scope', () => {
    expect(estimateComplexity('git status')).toBe(1);
    expect(estimateComplexity('read file src/index.ts')).toBe(1);
    expect(estimateComplexity('fix the bug in the auth token validator')).toBe(2);
    expect(estimateComplexity('implement a new caching layer for database queries and add unit tests')).toBe(3);
    expect(estimateComplexity('refactor across multi-file architectures to support asynchronous streaming')).toBe(4);
    expect(estimateComplexity('rewrite the entire build pipeline and migrate the codebase to rust')).toBe(5);
  });

  it('achieves >= 90% accuracy on the 50-prompt labeled dataset and < 800ms latency', async () => {
    const router = new Router();
    let correctIntents = 0;
    let correctPrivacy = 0;
    const latencies: number[] = [];

    for (const testCase of LABELED_ROUTING_PROMPTS) {
      const start = Date.now();
      const decision = await router.route(testCase.prompt);
      const elapsed = Date.now() - start;
      latencies.push(elapsed);

      if (decision.intent === testCase.intent) {
        correctIntents++;
      }
      if (decision.privacy === testCase.privacy) {
        correctPrivacy++;
      }
    }

    const intentAccuracy = (correctIntents / LABELED_ROUTING_PROMPTS.length) * 100;
    const privacyAccuracy = (correctPrivacy / LABELED_ROUTING_PROMPTS.length) * 100;
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;

    // Assert accuracy >= 90% (Task T5.1 AC)
    expect(intentAccuracy).toBeGreaterThanOrEqual(90);
    expect(privacyAccuracy).toBe(100);

    // Fast-path rules should make average latency very low (< 800ms CPU target)
    expect(avgLatency).toBeLessThan(800);
  }, 30000);

  describe('RoutingPolicy (T5.2)', () => {
    const policy = new RoutingPolicy();

    it('resolves low-complexity coding tasks to qwen2.5-coder:7b first', () => {
      const chain = policy.resolve({
        intent: 'coding',
        complexity: 2,
        privacy: 'normal',
        categories: ['fs', 'code'],
        needs_code: true,
        needs_web: false,
        needs_office: false,
        confidence: 0.95,
        source: 'rules',
      });

      expect(chain[0]).toBe('ollama:qwen2.5-coder:7b');
      expect(chain).toContain('gemini:gemini-2.5-flash');
    });

    it('resolves high-complexity coding tasks (complexity >= 4) to gemini planner first', () => {
      const chain = policy.resolve({
        intent: 'coding',
        complexity: 4,
        privacy: 'normal',
        categories: ['fs', 'code'],
        needs_code: true,
        needs_web: false,
        needs_office: false,
        confidence: 0.95,
        source: 'rules',
      });

      expect(chain[0]).toBe('gemini:gemini-2.5-flash');
      expect(chain).toContain('ollama:qwen2.5-coder:7b');
    });

    it('resolves office tasks to qwen3.5:4b', () => {
      const chain = policy.resolve({
        intent: 'office',
        complexity: 2,
        privacy: 'normal',
        categories: ['office'],
        needs_code: false,
        needs_web: false,
        needs_office: true,
        confidence: 0.95,
        source: 'rules',
      });

      expect(chain[0]).toBe('ollama:qwen3.5:4b');
    });

    it('STRICTLY strips cloud/gemini models when privacy is local_only', () => {
      const chain = policy.resolve({
        intent: 'coding',
        complexity: 5,
        privacy: 'local_only',
        categories: ['fs', 'code'],
        needs_code: true,
        needs_web: false,
        needs_office: false,
        confidence: 0.95,
        source: 'rules',
      });

      // Must never contain any Gemini or cloud model
      for (const model of chain) {
        expect(model).not.toContain('gemini');
        expect(model).toMatch(/^ollama:/);
      }
      expect(chain).toEqual(['ollama:qwen3.5:4b', 'ollama:qwen2.5-coder:7b']);
    });

    it('throws PrivacyBlocked when user supplies --model gemini on local_only prompt', () => {
      expect(() => {
        policy.resolve(
          {
            intent: 'coding',
            complexity: 2,
            privacy: 'local_only',
            categories: ['code'],
            needs_code: true,
            needs_web: false,
            needs_office: false,
            confidence: 0.95,
            source: 'rules',
          },
          'gemini:gemini-2.5-pro'
        );
      }).toThrowError(PrivacyBlocked);
    });

    it('allows --model override for local models on local_only prompt', () => {
      const chain = policy.resolve(
        {
          intent: 'coding',
          complexity: 2,
          privacy: 'local_only',
          categories: ['code'],
          needs_code: true,
          needs_web: false,
          needs_office: false,
          confidence: 0.95,
          source: 'rules',
        },
        'ollama:qwen2.5-coder:7b'
      );

      expect(chain[0]).toBe('ollama:qwen2.5-coder:7b');
      expect(chain).not.toContain('gemini:gemini-2.5-flash');
    });

    it('prepends --model override on normal prompt', () => {
      const chain = policy.resolve(
        {
          intent: 'general',
          complexity: 1,
          privacy: 'normal',
          categories: ['general'],
          needs_code: false,
          needs_web: false,
          needs_office: false,
          confidence: 1.0,
          source: 'rules',
        },
        'gemini:gemini-2.5-pro'
      );

      expect(chain[0]).toBe('gemini:gemini-2.5-pro');
    });
  });
});
