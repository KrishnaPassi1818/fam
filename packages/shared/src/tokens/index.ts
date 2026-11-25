import type { Message } from '../types/message.js';

/**
 * Fast tiktoken/local-calibrated token estimator.
 * Average across English prose and source code is ~3.8-4.0 chars per token,
 * or ~0.75 words per token with punctuation adjustments.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  // Count words and special characters
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;

  // Hybrid heuristic: 1 token ~= 3.7 chars for code/symbols, 4.0 for prose
  const words = trimmed.split(/\s+/).length;
  const chars = trimmed.length;

  // Calibrated estimator
  const tokenEstimate = Math.ceil(Math.max(chars / 3.8, words * 1.3));
  return tokenEstimate;
}

export function estimateMessageTokens(messages: Message[]): number {
  let count = 0;
  for (const msg of messages) {
    // Message framing overhead (role prefix, formatting) ~ 4 tokens per message
    count += 4;
    count += estimateTokens(msg.content);
    if ('toolCalls' in msg && msg.toolCalls) {
      for (const call of msg.toolCalls) {
        count += 6; // tool call framing
        count += estimateTokens(call.name);
        count += estimateTokens(JSON.stringify(call.args));
      }
    }
  }
  return count;
}
