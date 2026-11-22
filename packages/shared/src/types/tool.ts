import { z } from 'zod';

export const ToolAnnotationsSchema = z.object({
  readOnlyHint: z.boolean().optional(),
  destructiveHint: z.boolean().optional(),
  idempotentHint: z.boolean().optional(),
  openWorldHint: z.boolean().optional(),
});
export type ToolAnnotations = z.infer<typeof ToolAnnotationsSchema>;

export const ToolTierSchema = z.union([
  z.literal(0), // 0: read-only
  z.literal(1), // 1: workspace write (auto-backup, undo-able)
  z.literal(2), // 2: outside-workspace write, overwrite existing docs, trash (prompt)
  z.literal(3), // 3: shell, install, process control (prompt command preview)
  z.literal(4), // 4: destructive/irreversible (typed confirmation)
]);
export type ToolTier = z.infer<typeof ToolTierSchema>;

export const ToolDescriptorSchema = z.object({
  name: z.string(), // namespaced, e.g. "fs.read_file"
  alias: z.string().regex(/^[a-zA-Z0-9_]{1,64}$/), // model-safe alias
  description: z.string(),
  shortDescription: z.string().optional(),
  inputSchema: z.record(z.unknown()), // JSON schema
  annotations: ToolAnnotationsSchema.default({}),
  category: z.string().default('general'),
  tier: ToolTierSchema.default(0),
  timeoutMs: z.number().default(30000),
  embedding: z.array(z.number()).optional(),
});
export type ToolDescriptor = z.infer<typeof ToolDescriptorSchema>;
