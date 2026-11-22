import { estimateTokens, type Message, type ModelAdapter } from '@hx/shared';

export interface CompactorOptions {
  adapter?: ModelAdapter;
  turnsToPreserve?: number; // Recent user/assistant turns to keep verbatim
  targetSummaryTokens?: number;
}

export class TurnCompactor {
  private readonly adapter?: ModelAdapter;
  private readonly turnsToPreserve: number;
  private readonly targetSummaryTokens: number;

  constructor(options: CompactorOptions = {}) {
    this.adapter = options.adapter;
    this.turnsToPreserve = options.turnsToPreserve ?? 2;
    this.targetSummaryTokens = options.targetSummaryTokens ?? 400;
  }

  public async compact(messages: Message[]): Promise<{ messages: Message[]; compacted: boolean }> {
    // Only compact if we have more turns than turnsToPreserve
    // A turn is roughly a user message + assistant response (+ tools)
    const nonSystem = messages.filter((m) => m.role !== 'system');
    if (nonSystem.length <= this.turnsToPreserve * 2) {
      return { messages, compacted: false };
    }

    // Split into older slice to compact vs recent slice to preserve
    // Count backward to find the split point preserving last `turnsToPreserve` user messages
    let userCount = 0;
    let splitIndex = 0;

    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === 'user') {
        userCount++;
        if (userCount >= this.turnsToPreserve) {
          splitIndex = i;
          break;
        }
      }
    }

    if (splitIndex <= 1) {
      return { messages, compacted: false };
    }

    const systemMessages = messages.filter((m) => m.role === 'system');
    const olderSlice = messages.slice(0, splitIndex).filter((m) => m.role !== 'system');
    const recentSlice = messages.slice(splitIndex);

    let summary = '';
    if (this.adapter) {
      summary = await this.summarizeWithModel(olderSlice);
    } else {
      summary = this.heuristicSummarize(olderSlice);
    }

    const summaryMessage: Message = {
      role: 'user',
      content: `[Summary of earlier conversation turns]:\n${summary}`,
    };

    return {
      messages: [...systemMessages, summaryMessage, ...recentSlice],
      compacted: true,
    };
  }

  private async summarizeWithModel(messages: Message[]): Promise<string> {
    if (!this.adapter) return this.heuristicSummarize(messages);

    const transcript = messages
      .map((m) => {
        const role = m.role.toUpperCase();
        if (m.role === 'tool') {
          return `TOOL_RESULT (${m.name}): ${m.content.slice(0, 150)}`;
        }
        return `${role}: ${m.content}`;
      })
      .join('\n');

    const prompt = `Summarize the following earlier conversation turns into a concise executive summary under ${this.targetSummaryTokens} tokens.
Strictly preserve:
1. Key facts, requirements, and constraints.
2. File paths read or modified.
3. User decisions and confirmations.
4. Current state and open TODOs.

Conversation transcript:
${transcript}

Output only the factual summary:`;

    try {
      let output = '';
      for await (const chunk of this.adapter.chat({
        messages: [{ role: 'user', content: prompt }],
      })) {
        if (chunk.delta) output += chunk.delta;
      }
      return output.trim();
    } catch {
      return this.heuristicSummarize(messages);
    }
  }

  public heuristicSummarize(messages: Message[]): string {
    const facts: string[] = [];
    const files: Set<string> = new Set();
    const decisions: string[] = [];

    for (const msg of messages) {
      if (msg.role === 'user') {
        decisions.push(`- User asked: ${msg.content.slice(0, 100)}`);
      } else if (msg.role === 'assistant') {
        if (msg.toolCalls) {
          for (const tc of msg.toolCalls) {
            const pathArg = String(tc.args['path'] || tc.args['file'] || '');
            if (pathArg) files.add(pathArg);
          }
        }
      } else if (msg.role === 'tool') {
        if (msg.isError) {
          facts.push(`- Tool error on ${msg.name}: ${msg.content.slice(0, 80)}`);
        }
      }
    }

    const lines: string[] = [];
    if (decisions.length > 0) {
      lines.push('User Requests & Decisions:\n' + decisions.slice(-5).join('\n'));
    }
    if (files.size > 0) {
      lines.push('Files Accessed / Modified:\n' + Array.from(files).map((f) => `- ${f}`).join('\n'));
    }
    if (facts.length > 0) {
      lines.push('Key Facts / Findings:\n' + facts.slice(-5).join('\n'));
    }

    const result = lines.join('\n\n');
    return estimateTokens(result) > this.targetSummaryTokens
      ? result.slice(0, this.targetSummaryTokens * 4)
      : result;
  }
}
