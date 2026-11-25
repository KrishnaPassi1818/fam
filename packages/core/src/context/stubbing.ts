import type { Message } from '@fam/shared';

export interface StubbingOptions {
  recentToKeep?: number;
  maxStubLength?: number;
}

export class ToolResultStubber {
  private readonly recentToKeep: number;
  private readonly maxStubLength: number;

  constructor(options: StubbingOptions = {}) {
    this.recentToKeep = options.recentToKeep ?? 4;
    this.maxStubLength = options.maxStubLength ?? 120;
  }

  public stub(messages: Message[]): { messages: Message[]; stubbedCount: number } {
    // 1. Locate all tool result message indices
    const toolResultIndices: number[] = [];
    for (let i = 0; i < messages.length; i++) {
      if (messages[i]?.role === 'tool') {
        toolResultIndices.push(i);
      }
    }

    if (toolResultIndices.length <= this.recentToKeep) {
      return { messages, stubbedCount: 0 };
    }

    // Oldest tool results to stub (all except the last `recentToKeep`)
    const indicesToStub = new Set(toolResultIndices.slice(0, toolResultIndices.length - this.recentToKeep));
    let stubbedCount = 0;

    const modified = messages.map((msg, index) => {
      if (indicesToStub.has(index) && msg.role === 'tool') {
        const toolMsg = msg;
        // If already stubbed, skip
        if (toolMsg.content.startsWith('[Tool result for') || toolMsg.content.length <= this.maxStubLength) {
          return msg;
        }

        const firstLine = toolMsg.content.split('\n')[0] || '';
        const preview =
          firstLine.length > this.maxStubLength
            ? firstLine.slice(0, this.maxStubLength - 3) + '...'
            : firstLine;

        const stubText = `[Tool result for '${toolMsg.name}' (${toolMsg.content.length} chars, status=${toolMsg.isError ? 'error' : 'ok'}): ${preview}]`;

        stubbedCount++;
        return {
          ...toolMsg,
          content: stubText,
        };
      }
      return msg;
    });

    return { messages: modified, stubbedCount };
  }
}
