import type { Message } from '@fam/shared';
import type { ExtractedCandidate } from './types.js';
import { detectPrivacyFastPath } from '../router/rules.js';

export interface MemoryExtractorOptions {
  baseUrl?: string;
  model?: string;
}

const EXTRACTOR_SYSTEM_PROMPT = `You are a memory extractor. Analyze the conversation transcript and extract at most 5 permanent user preferences, project facts, or key architectural decisions that should be remembered in future sessions.
Do not extract temporary or trivial statements.
Output ONLY a JSON array of memory objects matching this schema:
[
  {
    "text": "User prefers tabs over spaces",
    "kind": "semantic",
    "tags": ["formatting", "preference"],
    "importance": 0.8,
    "privacy": "normal"
  }
]
No explanations. Only JSON array.`;

export class MemoryExtractor {
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(options: MemoryExtractorOptions = {}) {
    this.baseUrl = options.baseUrl || process.env['OLLAMA_BASE_URL'] || 'http://127.0.0.1:11434';
    const rawModel = options.model || 'qwen2.5:1.5b';
    this.model = rawModel.replace(/^ollama:/, '');
  }

  public async extract(messages: Message[]): Promise<ExtractedCandidate[]> {
    if (messages.length < 2) return [];

    // Filter relevant user and assistant messages
    const transcript = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => `${m.role.toUpperCase()}: ${typeof m.content === 'string' ? m.content : ''}`)
      .join('\n\n');

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: EXTRACTOR_SYSTEM_PROMPT },
            { role: 'user', content: `Extract memories from this transcript:\n\n${transcript}` },
          ],
          format: 'json',
          stream: false,
          options: {
            temperature: 0.1,
            num_gpu: 0, // CPU placement for 1.5b extraction
          },
        }),
      });

      if (!response.ok) {
        return this.fallbackExtract(messages);
      }

      const data = (await response.json()) as { message?: { content?: string } };
      const raw = data.message?.content?.trim() || '';

      const candidates = this.parseCandidateArray(raw);
      if (candidates.length > 0) {
        return candidates.slice(0, 5);
      }
      return this.fallbackExtract(messages);
    } catch {
      return this.fallbackExtract(messages);
    }
  }

  private parseCandidateArray(rawJson: string): ExtractedCandidate[] {
    try {
      const clean = rawJson.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();
      const parsed = JSON.parse(clean);
      const list = Array.isArray(parsed) ? parsed : parsed.memories || [];
      const results: ExtractedCandidate[] = [];

      for (const item of list) {
        if (typeof item.text === 'string' && item.text.trim()) {
          const privacy =
            detectPrivacyFastPath(item.text) === 'local_only' || item.privacy === 'local_only'
              ? 'local_only'
              : 'normal';

          results.push({
            text: item.text.trim(),
            kind: item.kind === 'episodic' ? 'episodic' : 'semantic',
            tags: Array.isArray(item.tags) ? item.tags : [],
            importance: typeof item.importance === 'number' ? Math.max(0.1, Math.min(1.0, item.importance)) : 0.5,
            privacy,
          });
        }
      }
      return results;
    } catch {
      return [];
    }
  }

  private fallbackExtract(messages: Message[]): ExtractedCandidate[] {
    const results: ExtractedCandidate[] = [];
    const userMessages = messages.filter((m) => m.role === 'user');

    for (const msg of userMessages) {
      if (typeof msg.content !== 'string') continue;
      const text = msg.content;
      const lower = text.toLowerCase();

      // Check preference patterns
      if (lower.includes('i prefer ') || lower.includes('my preference is ') || lower.includes('always use ')) {
        results.push({
          text: text.slice(0, 120),
          kind: 'semantic',
          tags: ['preference'],
          importance: 0.8,
          privacy: detectPrivacyFastPath(text),
        });
      } else if (lower.includes('this project uses ') || lower.includes('the project is built with ')) {
        results.push({
          text: text.slice(0, 120),
          kind: 'semantic',
          tags: ['project'],
          importance: 0.7,
          privacy: detectPrivacyFastPath(text),
        });
      }

      if (results.length >= 5) break;
    }

    return results;
  }
}
