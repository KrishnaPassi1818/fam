import { estimateTokens, type Message } from '@fam/shared';

export class EmergencyTruncator {
  public truncate(messages: Message[], targetTokens: number): { messages: Message[]; droppedCount: number } {
    if (messages.length <= 2) {
      return { messages, droppedCount: 0 };
    }

    const systemMsgs = messages.filter((m) => m.role === 'system');
    const nonSystem = messages.filter((m) => m.role !== 'system');

    if (nonSystem.length <= 2) {
      return { messages, droppedCount: 0 };
    }

    // Always preserve the initial user request (root goal)
    const rootUserMsg = nonSystem[0]!;
    // Always preserve the latest message (latest tool result or model turn)
    const latestMsg = nonSystem[nonSystem.length - 1]!;
    // Candidate pool to drop: intermediate messages between root goal and latest turn
    const poolToDrop = nonSystem.slice(1, nonSystem.length - 1);

    const calculateTotal = (pool: Message[]) => {
      let t = 0;
      for (const m of [...systemMsgs, rootUserMsg, ...pool, latestMsg]) {
        t += estimateTokens(m.content);
        if (m.role === 'assistant' && m.toolCalls) {
          t += estimateTokens(JSON.stringify(m.toolCalls));
        }
      }
      return t;
    };

    let droppedCount = 0;
    while (poolToDrop.length > 0 && calculateTotal(poolToDrop) > targetTokens) {
      poolToDrop.shift(); // Drop oldest intermediate turn
      droppedCount++;
    }

    return {
      messages: [...systemMsgs, rootUserMsg, ...poolToDrop, latestMsg],
      droppedCount,
    };
  }
}
