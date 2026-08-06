import { z } from 'zod';

export const approvalModeSchema = z.enum(['plan', 'read-only', 'auto-edit', 'full-access']);
export type ApprovalMode = z.infer<typeof approvalModeSchema>;

export const thinkingLevelSchema = z.enum([
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
]);
export type ThinkingLevel = z.infer<typeof thinkingLevelSchema>;

export const workspaceSchema = z.object({
  id: z.string().uuid(),
  path: z.string(),
  name: z.string(),
  trust: z.enum(['untrusted', 'trusted', 'always', 'never']),
  lastOpenedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type Workspace = z.infer<typeof workspaceSchema>;

export const sessionSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  title: z.string(),
  status: z.enum(['idle', 'streaming', 'degraded', 'error']),
  model: z.string().nullable(),
  thinkingLevel: thinkingLevelSchema.nullable(),
  approvalMode: approvalModeSchema,
  messageCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Session = z.infer<typeof sessionSchema>;
