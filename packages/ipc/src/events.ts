import { z } from 'zod';

/**
 * AgentDesk 事件归一化契约（README 8.1.4 / 10.2 event:session）。
 * 单一源：主进程校验后推送，渲染层消费；不再直接接触 pi 原始事件。
 */

export const uiRequestKindSchema = z.enum([
  'select',
  'confirm',
  'input',
  'editor',
  'notify',
  'setStatus',
  'setWidget',
  'setTitle',
  'set_editor_text',
]);
export type UiRequestKind = z.infer<typeof uiRequestKindSchema>;

export const agentDeskUsageSchema = z.object({
  input: z.number().optional(),
  output: z.number().optional(),
  cacheRead: z.number().optional(),
  cacheWrite: z.number().optional(),
  costUsd: z.number().optional(),
});
export type AgentDeskUsage = z.infer<typeof agentDeskUsageSchema>;

export const sessionStateSchema = z.object({
  model: z.string().nullable(),
  thinkingLevel: z.string().nullable(),
  isStreaming: z.boolean(),
  isCompacting: z.boolean(),
  steeringMode: z.string(),
  followUpMode: z.string(),
  sessionFile: z.string().optional(),
  sessionId: z.string().optional(),
  sessionName: z.string().optional(),
  autoCompactionEnabled: z.boolean(),
  messageCount: z.number(),
  pendingMessageCount: z.number(),
});
export type SessionState = z.infer<typeof sessionStateSchema>;

export const agentDeskEventSchema = z.discriminatedUnion('k', [
  z.object({ k: z.literal('session.state'), state: sessionStateSchema }),
  z.object({ k: z.literal('turn.start'), turnId: z.string() }),
  z.object({ k: z.literal('turn.end'), turnId: z.string() }),
  z.object({ k: z.literal('msg.start'), msgId: z.string(), role: z.literal('assistant') }),
  z.object({
    k: z.literal('msg.delta'),
    msgId: z.string(),
    part: z.discriminatedUnion('t', [
      z.object({ t: z.literal('text'), v: z.string() }),
      z.object({ t: z.literal('thinking'), v: z.string() }),
    ]),
  }),
  z.object({ k: z.literal('msg.end'), msgId: z.string(), usage: agentDeskUsageSchema.optional() }),
  z.object({
    k: z.literal('tool.start'),
    callId: z.string(),
    name: z.string(),
    args: z.unknown(),
  }),
  z.object({ k: z.literal('tool.progress'), callId: z.string(), patch: z.unknown() }),
  z.object({
    k: z.literal('tool.end'),
    callId: z.string(),
    ok: z.boolean(),
    result: z.unknown(),
    ms: z.number(),
  }),
  z.object({ k: z.literal('bash.output'), cmdId: z.string(), chunk: z.string() }),
  z.object({ k: z.literal('queue'), pending: z.number(), mode: z.enum(['steer', 'followUp']) }),
  z.object({
    k: z.literal('compact.start'),
    before: z.number().optional(),
    after: z.number().optional(),
  }),
  z.object({
    k: z.literal('compact.end'),
    before: z.number().optional(),
    after: z.number().optional(),
  }),
  z.object({
    k: z.literal('retry'),
    phase: z.enum(['start', 'end']),
    attempt: z.number(),
    delayMs: z.number().optional(),
  }),
  z.object({ k: z.literal('agent.settled') }),
  z.object({
    k: z.literal('ui.request'),
    reqId: z.string(),
    kind: uiRequestKindSchema,
    payload: z.unknown(),
  }),
  z.object({
    k: z.literal('error'),
    scope: z.enum(['extension', 'sidecar', 'provider']),
    message: z.string(),
    detail: z.unknown().optional(),
  }),
]);
export type AgentDeskEvent = z.infer<typeof agentDeskEventSchema>;
