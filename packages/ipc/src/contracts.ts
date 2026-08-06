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

export const sessionAttachRequestSchema = z.object({
  sessionId: z.string().min(1),
  /** 断点重传：只返回 seq 之后的事件（README 8.8.1 / M3） */
  sinceSeq: z.number().int().nonnegative().optional(),
});
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

export const sessionSummarySchema = z.object({
  id: z.string(),
  workspaceId: z.string().nullable(),
  workspacePath: z.string().nullable(),
  title: z.string(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  status: z.enum(['idle', 'streaming', 'degraded', 'error']),
  messageCount: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  cacheWriteTokens: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative(),
  seq: z.number().int().nonnegative(),
  createdAt: z.number(),
  updatedAt: z.number(),
  archivedAt: z.number().nullable(),
});
export const sessionListRequestSchema = z.object({
  search: z.string().optional(),
  archived: z.boolean().optional(),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().nonnegative().optional(),
});
export const sessionListResponseSchema = z.object({
  sessions: z.array(sessionSummarySchema),
});

export const sessionRenameRequestSchema = z.object({
  sessionId: z.string().min(1),
  title: z.string().min(1).max(200),
});

export const sessionArchiveRequestSchema = z.object({ sessionId: z.string().min(1) });

export const sessionDeleteRequestSchema = z.object({ sessionId: z.string().min(1) });

export const sessionExportRequestSchema = z.object({
  sessionId: z.string().min(1),
  format: z.enum(['md', 'json']),
});
export const sessionExportResponseSchema = z.object({
  path: z.string(),
  format: z.enum(['md', 'json']),
});

/** Workspace（README 8.9 / 10.2） */
export const trustDecisionSchema = z.enum(['once', 'always', 'alwaysParent', 'never']);

export const workspaceTrustSchema = z.enum(['unknown', 'once', 'always', 'alwaysParent', 'never']);

export const workspaceRecordSchema = z.object({
  id: z.string(),
  path: z.string(),
  name: z.string(),
  icon: z.string().nullable(),
  trust: workspaceTrustSchema,
  lastOpenedAt: z.number().nullable(),
  createdAt: z.number(),
});

export const workspaceAddRequestSchema = z.object({ path: z.string().min(1) });
export const workspaceAddResponseSchema = z.object({
  workspace: workspaceRecordSchema,
  needsTrust: z.boolean(),
});
export const workspaceRemoveRequestSchema = z.object({ workspaceId: z.string().min(1) });
export const workspaceListResponseSchema = z.object({
  workspaces: z.array(workspaceRecordSchema),
});
export const workspaceOpenRequestSchema = z.object({ workspaceId: z.string().min(1) });
export const workspaceOpenResponseSchema = z.object({
  workspace: workspaceRecordSchema,
});
export const workspaceTrustRequestSchema = z.object({
  workspaceId: z.string().min(1),
  decision: trustDecisionSchema,
});
export const workspacePickDirectoryResponseSchema = z.object({
  path: z.string().nullable(),
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
  'session:list': {
    request: z.infer<typeof sessionListRequestSchema>;
    response: z.infer<typeof sessionListResponseSchema>;
  };
  'session:rename': {
    request: z.infer<typeof sessionRenameRequestSchema>;
    response: undefined;
  };
  'session:archive': {
    request: z.infer<typeof sessionArchiveRequestSchema>;
    response: undefined;
  };
  'session:delete': {
    request: z.infer<typeof sessionDeleteRequestSchema>;
    response: undefined;
  };
  'session:export': {
    request: z.infer<typeof sessionExportRequestSchema>;
    response: z.infer<typeof sessionExportResponseSchema>;
  };
  'workspace:add': {
    request: z.infer<typeof workspaceAddRequestSchema>;
    response: z.infer<typeof workspaceAddResponseSchema>;
  };
  'workspace:remove': {
    request: z.infer<typeof workspaceRemoveRequestSchema>;
    response: undefined;
  };
  'workspace:list': { request: undefined; response: z.infer<typeof workspaceListResponseSchema> };
  'workspace:open': {
    request: z.infer<typeof workspaceOpenRequestSchema>;
    response: z.infer<typeof workspaceOpenResponseSchema>;
  };
  'workspace:trust': {
    request: z.infer<typeof workspaceTrustRequestSchema>;
    response: undefined;
  };
  'workspace:pick-directory': {
    request: undefined;
    response: z.infer<typeof workspacePickDirectoryResponseSchema>;
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
  'session:list': sessionListRequestSchema,
  'session:rename': sessionRenameRequestSchema,
  'session:archive': sessionArchiveRequestSchema,
  'session:delete': sessionDeleteRequestSchema,
  'session:export': sessionExportRequestSchema,
  'workspace:add': workspaceAddRequestSchema,
  'workspace:remove': workspaceRemoveRequestSchema,
  'workspace:list': z.undefined(),
  'workspace:open': workspaceOpenRequestSchema,
  'workspace:trust': workspaceTrustRequestSchema,
  'workspace:pick-directory': z.undefined(),
} as const satisfies Record<InvokeChannel, z.ZodType>;

export type InvokeRequest<C extends keyof InvokeMap> = InvokeMap[C]['request'];
export type InvokeResponse<C extends keyof InvokeMap> = InvokeMap[C]['response'];
