import { describe, it, expect } from 'vitest';
import {
  MessageSchema,
  UserMessageSchema,
  AssistantMessageSchema,
  ToolMessageSchema,
  SystemMessageSchema,
} from '../types/message.js';

describe('MessageSchema', () => {
  it('validates a system message', () => {
    const sys = { role: 'system', content: 'You are fam.' };
    expect(SystemMessageSchema.parse(sys)).toEqual(sys);
    expect(MessageSchema.parse(sys)).toEqual(sys);
  });

  it('validates a user message with parts', () => {
    const user = {
      role: 'user',
      content: 'Hello',
      parts: [{ type: 'text', text: 'Hello' }],
    };
    expect(UserMessageSchema.parse(user)).toEqual(user);
    expect(MessageSchema.parse(user)).toEqual(user);
  });

  it('validates an assistant message with tool calls', () => {
    const assistant = {
      role: 'assistant',
      content: 'Let me check that.',
      toolCalls: [
        { id: 'call_1', name: 'fs_read_file', args: { path: 'src/main.ts' } },
      ],
    };
    expect(AssistantMessageSchema.parse(assistant)).toEqual(assistant);
    expect(MessageSchema.parse(assistant)).toEqual(assistant);
  });

  it('validates a tool result message', () => {
    const toolMsg = {
      role: 'tool',
      callId: 'call_1',
      name: 'fs_read_file',
      content: 'file contents here',
      isError: false,
    };
    expect(ToolMessageSchema.parse(toolMsg)).toEqual(toolMsg);
    expect(MessageSchema.parse(toolMsg)).toEqual(toolMsg);
  });

  it('rejects an invalid role', () => {
    const invalid = { role: 'unknown', content: 'hello' };
    expect(() => MessageSchema.parse(invalid)).toThrow();
  });
});
