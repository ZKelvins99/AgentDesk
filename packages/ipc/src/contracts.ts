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

/** Provider / Model / 密钥（README 4.4 / 8.6） */
export type ProviderApi = z.infer<typeof providerApiSchema>;
export type ProviderAuthMethod = z.infer<typeof providerAuthMethodSchema>;
export type ProviderCompat = z.infer<typeof providerCompatSchema>;
export type ProviderView = z.infer<typeof providerViewSchema>;
export type SecretEntry = z.infer<typeof secretEntrySchema>;
export type AuthProviderStatus = z.infer<typeof authProviderStatusSchema>;
export type ProviderPreset = z.infer<typeof providerPresetSchema>;
export type PiModelView = z.infer<typeof piModelViewSchema>;
export type SecretsStatusResponse = z.infer<typeof secretsStatusResponseSchema>;
export type ProviderTestResult = z.infer<typeof providerTestResponseSchema>;
export type DiscoveredModel = z.infer<
  typeof providerDiscoverModelsResponseSchema
>['models'][number];

export const providerApiSchema = z.enum([
  'openai-completions',
  'openai-responses',
  'anthropic-messages',
  'google-generative-ai',
  'azure-openai-responses',
  'openai-codex-responses',
  'bedrock-converse-stream',
  'google-vertex',
  'mistral-conversations',
  'pi-messages',
]);
export const providerAuthMethodSchema = z.enum(['api-key', 'env', 'shell', 'none', 'oauth']);

export const providerCompatSchema = z.object({
  supportsDeveloperRole: z.boolean().optional(),
  supportsReasoningEffort: z.boolean().optional(),
});

export const modelCostSchema = z.object({
  input: z.number().optional(),
  output: z.number().optional(),
  cacheRead: z.number().optional(),
  cacheWrite: z.number().optional(),
});

export const modelConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  api: providerApiSchema.optional(),
  reasoning: z.boolean().optional(),
  input: z.array(z.enum(['text', 'image'])).optional(),
  contextWindow: z.number().int().positive().optional(),
  maxTokens: z.number().int().positive().optional(),
  cost: modelCostSchema.optional(),
  thinkingLevelMap: z.record(z.string(), z.string().nullable()).optional(),
  compat: providerCompatSchema.optional(),
});
export type ModelConfig = z.infer<typeof modelConfigSchema>;

export const providerConfigInputSchema = z.object({
  name: z.string().min(1).max(100),
  baseUrl: z.string().optional(),
  api: providerApiSchema.optional(),
  authMethod: providerAuthMethodSchema,
  /** env / shell 形式的值：如 "$MY_KEY" 或 "!op read ..."（写入 models.json 原样保留） */
  apiKeyRef: z.string().optional(),
  authHeader: z.boolean().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  compat: providerCompatSchema.optional(),
  models: z.array(modelConfigSchema).optional(),
});
export type ProviderConfigInput = z.infer<typeof providerConfigInputSchema>;

export const providerViewSchema = z.object({
  name: z.string(),
  builtin: z.boolean(),
  configured: z.boolean(),
  baseUrl: z.string().nullable(),
  api: providerApiSchema.nullable(),
  authMethod: providerAuthMethodSchema,
  apiKeyRef: z.string().nullable(),
  hasSecret: z.boolean(),
  authHeader: z.boolean(),
  headers: z.record(z.string(), z.string()),
  compat: providerCompatSchema,
  models: z.array(modelConfigSchema),
});
export const providerListResponseSchema = z.object({
  providers: z.array(providerViewSchema),
});

export const providerSaveRequestSchema = z.object({
  config: providerConfigInputSchema,
  /** api-key 方式：保存即 safeStorage 加密，绝不明文落盘（README 8.6.2） */
  apiKey: z.string().optional(),
});
export const providerSaveResponseSchema = z.object({ name: z.string() });

export const providerDeleteRequestSchema = z.object({ name: z.string().min(1) });

export const providerPresetSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().optional(),
  config: providerConfigInputSchema,
});
export const providerPresetsResponseSchema = z.object({
  presets: z.array(providerPresetSchema),
});

export const providerDiscoverModelsRequestSchema = z.object({
  baseUrl: z.string().min(1),
  api: providerApiSchema.optional(),
  apiKey: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
});
export const providerDiscoverModelsResponseSchema = z.object({
  models: z.array(z.object({ id: z.string(), name: z.string().nullable() })),
});

export const providerTestRequestSchema = z.object({
  name: z.string().min(1),
  model: z.string().optional(),
});
export const providerTestResponseSchema = z.object({
  ok: z.boolean(),
  status: z.number().nullable(),
  latencyMs: z.number().nullable(),
  snippet: z.string().nullable(),
  error: z.string().nullable(),
});

export const secretEntrySchema = z.object({
  provider: z.string(),
  createdAt: z.number(),
  lastUsedAt: z.number().nullable(),
});
export const secretsStatusResponseSchema = z.object({
  available: z.boolean(),
  storagePath: z.string().nullable(),
  entries: z.array(secretEntrySchema),
});

export const authProviderStatusSchema = z.object({
  name: z.string(),
  type: z.enum(['api_key', 'oauth', 'none']),
  configured: z.boolean(),
  via: z.enum(['agentdesk', 'pi-auth']),
});
export const authStatusResponseSchema = z.object({
  providers: z.array(authProviderStatusSchema),
});
export const authLaunchLoginRequestSchema = z.object({
  provider: z.string().optional(),
});
export const authLaunchLoginResponseSchema = z.object({
  launched: z.boolean(),
  terminal: z.string(),
});

/** 会话级模型操作（README 8.6.4 对接 RPC） */
export const piModelViewSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  provider: z.string().nullable(),
  api: z.string().nullable(),
  reasoning: z.boolean(),
  input: z.array(z.string()),
  contextWindow: z.number().nullable(),
  maxTokens: z.number().nullable(),
  cost: modelCostSchema.nullable(),
});
export const sessionGetModelsRequestSchema = z.object({
  sessionId: z.string().min(1),
});
export const sessionGetModelsResponseSchema = z.object({
  models: z.array(piModelViewSchema),
});
export const sessionSetThinkingLevelRequestSchema = z.object({
  sessionId: z.string().min(1),
  level: thinkingLevelSchema,
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
  'provider:list': {
    request: undefined;
    response: z.infer<typeof providerListResponseSchema>;
  };
  'provider:save': {
    request: z.infer<typeof providerSaveRequestSchema>;
    response: z.infer<typeof providerSaveResponseSchema>;
  };
  'provider:delete': {
    request: z.infer<typeof providerDeleteRequestSchema>;
    response: undefined;
  };
  'provider:presets': {
    request: undefined;
    response: z.infer<typeof providerPresetsResponseSchema>;
  };
  'provider:discover-models': {
    request: z.infer<typeof providerDiscoverModelsRequestSchema>;
    response: z.infer<typeof providerDiscoverModelsResponseSchema>;
  };
  'provider:test': {
    request: z.infer<typeof providerTestRequestSchema>;
    response: z.infer<typeof providerTestResponseSchema>;
  };
  'secrets:status': {
    request: undefined;
    response: z.infer<typeof secretsStatusResponseSchema>;
  };
  'auth:status': {
    request: undefined;
    response: z.infer<typeof authStatusResponseSchema>;
  };
  'auth:launch-login': {
    request: z.infer<typeof authLaunchLoginRequestSchema>;
    response: z.infer<typeof authLaunchLoginResponseSchema>;
  };
  'session:get-models': {
    request: z.infer<typeof sessionGetModelsRequestSchema>;
    response: z.infer<typeof sessionGetModelsResponseSchema>;
  };
  'session:set-thinking-level': {
    request: z.infer<typeof sessionSetThinkingLevelRequestSchema>;
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
  'provider:list': z.undefined(),
  'provider:save': providerSaveRequestSchema,
  'provider:delete': providerDeleteRequestSchema,
  'provider:presets': z.undefined(),
  'provider:discover-models': providerDiscoverModelsRequestSchema,
  'provider:test': providerTestRequestSchema,
  'secrets:status': z.undefined(),
  'auth:status': z.undefined(),
  'auth:launch-login': authLaunchLoginRequestSchema,
  'session:get-models': sessionGetModelsRequestSchema,
  'session:set-thinking-level': sessionSetThinkingLevelRequestSchema,
} as const satisfies Record<InvokeChannel, z.ZodType>;

export type InvokeRequest<C extends keyof InvokeMap> = InvokeMap[C]['request'];
export type InvokeResponse<C extends keyof InvokeMap> = InvokeMap[C]['response'];
