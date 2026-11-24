import type { Message, ToolCall } from './message.js';
import type { ToolDescriptor } from './tool.js';

export interface ModelCaps {
  tools: boolean;
  parallelTools: boolean;
  vision: boolean;
  jsonSchemaFormat: boolean;
  maxCtx: number;
}

export interface ChatRequest {
  messages: Message[];
  tools?: ToolDescriptor[];
  temperature?: number;
  maxTokens?: number;
  jsonSchema?: Record<string, unknown>;
  systemPrompt?: string;
  numCtx?: number;
}

export interface ChatUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface ChatChunk {
  delta: string;
  toolCalls?: ToolCall[];
  usage?: ChatUsage;
  finishReason?: 'stop' | 'tool_calls' | 'length' | 'error';
}

export interface ModelAdapter {
  id: string; // "ollama:qwen3.5:4b" | "gemini:gemini-2.5-flash"
  caps: ModelCaps;
  chat(req: ChatRequest, signal?: AbortSignal): AsyncIterable<ChatChunk>;
  countTokens(msgs: Message[]): Promise<number> | number;
  warm?(): Promise<void>;
  unload?(): Promise<void>;
}
