import { approvalModeSchema, thinkingLevelSchema } from '@agentdesk/shared';
import { z } from 'zod';
import type { InvokeChannel } from './channels';
import { agentDeskEventSchema, sessionStateSchema } from './events';

export const pingRequestSchema = z.object({
  nonce: z.string().optional(),
});
export const pingResponseSchema = z.object({
  pong: z.string(),
});

export const getVersionResponseSchema = z.object({
  version: z.string(),
});

/** 会话（README 10.2） */
export const sessionCreateRequestSchema = z.object({
  workspacePath: z.string().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  thinkingLevel: thinkingLevelSchema.optional(),
  approvalMode: approvalModeSchema.optional(),
});
export const sessionCreateResponseSchema = z.object({
  sessionId: z.string(),
  workspacePath: z.string(),
});

export const sessionAttachRequestSchema = z.object({ sessionId: z.string().min(1) });
export const sessionAttachResponseSchema = z.object({
  sessionId: z.string(),
  workspacePath: z.string(),
  history: z.array(agentDeskEventSchema),
  state: sessionStateSchema,
  seq: z.number().int().nonnegative(),
});

export const sessionSendRequestSchema = z.object({
  sessionId: z.string().min(1),
  text: z.string().min(1),
});
export const sessionSendResponseSchema = z.object({
  accepted: z.boolean(),
  mode: z.enum(['normal', 'steer', 'followUp']),
});

export const sessionAbortRequestSchema = z.object({ sessionId: z.string().min(1) });

export const sessionSetModelRequestSchema = z.object({
  sessionId: z.string().min(1),
  model: z.string().min(1),
});

/** 事件推送负载：{ sessionId, seq, ev }（README 10.2 event:session） */
export const sessionEventSchema = z.object({
  sessionId: z.string(),
  seq: z.number().int().nonnegative(),
  ev: agentDeskEventSchema,
});

export interface InvokeMap {
  'app:ping': {
    request: z.infer<typeof pingRequestSchema>;
    response: z.infer<typeof pingResponseSchema>;
  };
  'app:get-version': {
    request: undefined;
    response: z.infer<typeof getVersionResponseSchema>;
  };
  'window:minimize': { request: undefined; response: undefined };
  'window:maximize': { request: undefined; response: undefined };
  'window:close': { request: undefined; response: undefined };
  'session:create': {
    request: z.infer<typeof sessionCreateRequestSchema>;
    response: z.infer<typeof sessionCreateResponseSchema>;
  };
  'session:attach': {
    request: z.infer<typeof sessionAttachRequestSchema>;
    response: z.infer<typeof sessionAttachResponseSchema>;
  };
  'session:send': {
    request: z.infer<typeof sessionSendRequestSchema>;
    response: z.infer<typeof sessionSendResponseSchema>;
  };
  'session:abort': { request: z.infer<typeof sessionAbortRequestSchema>; response: undefined };
  'session:set-model': {
    request: z.infer<typeof sessionSetModelRequestSchema>;
    response: undefined;
  };
}

/** 事件推送映射（主 → 渲染，单向 send）。 */
export interface EventMap {
  'event:session': z.infer<typeof sessionEventSchema>;
}

/** 运行时请求校验表：main 侧 handler 执行前必须过 zod（README 16.1）。 */
export const invokeRequestSchemas = {
  'app:ping': pingRequestSchema,
  'app:get-version': z.undefined(),
  'window:minimize': z.undefined(),
  'window:maximize': z.undefined(),
  'window:close': z.undefined(),
  'session:create': sessionCreateRequestSchema,
  'session:attach': sessionAttachRequestSchema,
  'session:send': sessionSendRequestSchema,
  'session:abort': sessionAbortRequestSchema,
  'session:set-model': sessionSetModelRequestSchema,
} as const satisfies Record<InvokeChannel, z.ZodType>;

export type InvokeRequest<C extends keyof InvokeMap> = InvokeMap[C]['request'];
export type InvokeResponse<C extends keyof InvokeMap> = InvokeMap[C]['response'];
