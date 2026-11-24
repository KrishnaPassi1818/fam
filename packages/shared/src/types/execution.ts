import { z } from 'zod';

export const ToolExecutionStatusSchema = z.enum([
  'pending',
  'running',
  'succeeded',
  'failed',
  'approval_required',
  'cancelled',
  'timed_out',
]);
export type ToolExecutionStatus = z.infer<typeof ToolExecutionStatusSchema>;

export const NormalizedToolResultSchema = z.object({
  execution_id: z.string(),
  task_id: z.string(),
  tool: z.string(),
  status: ToolExecutionStatusSchema,
  arguments: z.record(z.unknown()).default({}),
  result: z.unknown().default(null),
  error: z.string().nullable().default(null),
  duration_ms: z.number().default(0),
  verified: z.boolean().default(false),
});
export type NormalizedToolResult = z.infer<typeof NormalizedToolResultSchema>;

export const PlanStepSchema = z.object({
  id: z.number(),
  description: z.string(),
  tool: z.string().optional(),
  status: z.enum(['pending', 'in_progress', 'succeeded', 'failed', 'skipped']).default('pending'),
  execution_id: z.string().optional(),
  evidence: z.string().optional(),
});
export type PlanStep = z.infer<typeof PlanStepSchema>;

export const ExecutionPlanSchema = z.object({
  task_id: z.string(),
  user_request: z.string(),
  steps: z.array(PlanStepSchema),
  created_at: z.number().default(() => Date.now()),
  updated_at: z.number().default(() => Date.now()),
  is_complex: z.boolean().default(false),
});
export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>;
