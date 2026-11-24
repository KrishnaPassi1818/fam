import { z } from 'zod';

export const TextPartSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});
export type TextPart = z.infer<typeof TextPartSchema>;

export const ImagePartSchema = z.object({
  type: z.literal('image'),
  mimeType: z.string(),
  data: z.string(), // base64 encoded
});
export type ImagePart = z.infer<typeof ImagePartSchema>;

export const PartSchema = z.discriminatedUnion('type', [TextPartSchema, ImagePartSchema]);
export type Part = z.infer<typeof PartSchema>;

export const ToolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  args: z.record(z.unknown()),
});
export type ToolCall = z.infer<typeof ToolCallSchema>;

export const ToolResultSchema = z.object({
  callId: z.string(),
  name: z.string(),
  content: z.string(),
  isError: z.boolean().optional(),
  taint: z.enum(['normal', 'local_only']).optional(),
  normalized: z.record(z.unknown()).optional(),
});
export type ToolResult = z.infer<typeof ToolResultSchema>;

export const SystemMessageSchema = z.object({
  role: z.literal('system'),
  content: z.string(),
});
export type SystemMessage = z.infer<typeof SystemMessageSchema>;

export const UserMessageSchema = z.object({
  role: z.literal('user'),
  content: z.string(),
  parts: z.array(PartSchema).optional(),
});
export type UserMessage = z.infer<typeof UserMessageSchema>;

export const AssistantMessageSchema = z.object({
  role: z.literal('assistant'),
  content: z.string(),
  toolCalls: z.array(ToolCallSchema).optional(),
});
export type AssistantMessage = z.infer<typeof AssistantMessageSchema>;

export const ToolMessageSchema = z.object({
  role: z.literal('tool'),
  callId: z.string(),
  name: z.string(),
  content: z.string(),
  isError: z.boolean().optional(),
});
export type ToolMessage = z.infer<typeof ToolMessageSchema>;

export const MessageSchema = z.discriminatedUnion('role', [
  SystemMessageSchema,
  UserMessageSchema,
  AssistantMessageSchema,
  ToolMessageSchema,
]);
export type Message = z.infer<typeof MessageSchema>;
