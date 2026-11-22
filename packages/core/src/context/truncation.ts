import { estimateTokens, type Message } from '@hx/shared';

export class EmergencyTruncator {
  public truncate(messages: Message[], targetTokens: number): { messages: Message[]; droppedCount: number } {
    if (messages.length <= 2) {
      return { messages, droppedCount: 0 };
    }

    const systemMsgs = messages.filter((m) => m.role === 'system');
    const nonSystem = messages.filter((m) => m.role !== 'system');

    if (nonSystem.length <= 1) {
      return { messages, droppedCount: 0 };
    }

    // Always keep the very latest message (user query)
    const latestMsg = nonSystem[nonSystem.length - 1]!;
    const poolToDrop = nonSystem.slice(0, nonSystem.length - 1);

    const calculateTotal = (pool: Message[]) => {
      let t = 0;
      for (const m of [...systemMsgs, ...pool, latestMsg]) {
        t += estimateTokens(m.content);
      }
      return t;
    };

    let droppedCount = 0;
    while (poolToDrop.length > 0 && calculateTotal(poolToDrop) > targetTokens) {
      poolToDrop.shift(); // Drop oldest message
      droppedCount++;
    }

    return {
      messages: [...systemMsgs, ...poolToDrop, latestMsg],
      droppedCount,
    };
  }
}
