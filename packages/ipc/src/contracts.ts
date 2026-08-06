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

export const workspacePickFileResponseSchema = z.object({
  path: z.string().nullable(),
});

/** 事件推送负载：{ sessionId, seq, ev }（README 10.2 event:session） */
export const sessionEventSchema = z.object({
  sessionId: z.string(),
  seq: z.number().int().nonnegative(),
  ev: agentDeskEventSchema,
});

/** 审批（README 8.7）：四档模式 / 风险分级 / 规则 / 审计 */
export const sessionSetApprovalModeRequestSchema = z.object({
  sessionId: z.string().min(1),
  mode: approvalModeSchema,
});

export const approvalDecisionSchema = z.enum(['allow-once', 'always', 'deny', 'deny-with-reason']);
export type ApprovalDecisionKind = z.infer<typeof approvalDecisionSchema>;

export const approvalRespondRequestSchema = z.object({
  requestId: z.string().min(1),
  decision: approvalDecisionSchema,
  /** deny-with-reason 时必填；always 时可带 rule 范围说明 */
  reason: z.string().max(500).optional(),
});

export const approvalRequestViewSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  tool: z.string(),
  argsSummary: z.string(),
  risk: z.enum(['high', 'medium', 'low']),
  cwd: z.string(),
});
export type ApprovalRequestView = z.infer<typeof approvalRequestViewSchema>;

export const approvalAuditEntrySchema = z.object({
  id: z.number().int(),
  sessionId: z.string().nullable(),
  tool: z.string(),
  argsSummary: z.string().nullable(),
  risk: z.string().nullable(),
  decision: z.string(),
  ruleId: z.string().nullable(),
  at: z.number(),
});
export type ApprovalAuditEntry = z.infer<typeof approvalAuditEntrySchema>;

export const approvalAuditListRequestSchema = z.object({
  sessionId: z.string().optional(),
  limit: z.number().int().min(1).max(500).optional(),
});
export const approvalAuditListResponseSchema = z.object({
  entries: z.array(approvalAuditEntrySchema),
});

export const approvalAuditExportRequestSchema = z.object({
  format: z.enum(['md', 'json']),
});
export const approvalAuditExportResponseSchema = z.object({ content: z.string() });

export const approvalAuditClearRequestSchema = z.object({
  sessionId: z.string().optional(),
});
export const approvalAuditClearResponseSchema = z.object({ cleared: z.number().int() });

export const approvalRuleMatcherSchema = z.object({
  sessionId: z.string().optional(),
  tool: z.string().optional(),
  bashPrefix: z.string().optional(),
  pathPrefix: z.string().optional(),
});
export type ApprovalRuleMatcher = z.infer<typeof approvalRuleMatcherSchema>;

export const approvalRuleSchema = z.object({
  id: z.string(),
  scope: z.enum(['session', 'workspace', 'global']),
  sessionId: z.string().optional(),
  workspaceId: z.string().optional(),
  matcher: approvalRuleMatcherSchema,
  decision: z.enum(['allow', 'deny']),
  createdAt: z.number(),
  expiresAt: z.number().nullable(),
});
export type ApprovalRule = z.infer<typeof approvalRuleSchema>;

export const approvalRuleInputSchema = z.object({
  scope: z.enum(['session', 'workspace', 'global']),
  sessionId: z.string().optional(),
  workspaceId: z.string().optional(),
  matcher: approvalRuleMatcherSchema,
  decision: z.enum(['allow', 'deny']),
  expiresAt: z.number().optional(),
});
export type ApprovalRuleInput = z.infer<typeof approvalRuleInputSchema>;

export const approvalRulesListRequestSchema = z.object({ sessionId: z.string().optional() });
export const approvalRulesListResponseSchema = z.object({ rules: z.array(approvalRuleSchema) });
export const approvalRuleSaveRequestSchema = z.object({ rule: approvalRuleInputSchema });
export const approvalRuleSaveResponseSchema = z.object({ id: z.string() });
export const approvalRuleDeleteRequestSchema = z.object({ id: z.string().min(1) });

/** MCP Host（README 8.3.1）：配置格式与 Server CRUD 契约 */
export const mcpScopeSchema = z.enum(['global', 'workspace']);
export type McpScope = z.infer<typeof mcpScopeSchema>;

export const mcpToolFilterSchema = z.object({
  allow: z.array(z.string()).optional(),
  deny: z.array(z.string()).optional(),
});
export type McpToolFilter = z.infer<typeof mcpToolFilterSchema>;

export const mcpReconnectSchema = z.object({
  maxRetries: z.number().int().min(0).max(20).optional(),
  baseDelayMs: z.number().int().min(100).max(60_000).optional(),
});
export type McpReconnect = z.infer<typeof mcpReconnectSchema>;

export const mcpServerConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    transport: z.enum(['stdio', 'sse', 'http']),
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
    cwd: z.string().optional(),
    url: z.string().optional(),
    headers: z.record(z.string(), z.string()).optional(),
    timeoutMs: z.number().int().min(100).max(600_000).optional(),
    startupTimeoutMs: z.number().int().min(100).max(120_000).optional(),
    toolFilter: mcpToolFilterSchema.optional(),
    autoApprove: z.array(z.string()).optional(),
    reconnect: mcpReconnectSchema.optional(),
  })
  .passthrough()
  .superRefine((cfg, ctx) => {
    if (cfg.transport === 'stdio' && !cfg.command) {
      ctx.addIssue({ code: 'custom', message: 'stdio 输送需要 command' });
    }
    if (cfg.transport !== 'stdio' && !cfg.url) {
      ctx.addIssue({ code: 'custom', message: `${cfg.transport} 输送需要 url` });
    }
  });
export type McpServerConfig = z.infer<typeof mcpServerConfigSchema>;

export const mcpServerViewSchema = z.object({
  name: z.string().min(1).max(64),
  scope: mcpScopeSchema,
  config: mcpServerConfigSchema,
});
export type McpServerView = z.infer<typeof mcpServerViewSchema>;

export const mcpListRequestSchema = z.object({ workspacePath: z.string().optional() });
export const mcpListResponseSchema = z.object({ servers: z.array(mcpServerViewSchema) });

export const mcpSaveRequestSchema = z.object({
  name: z.string().min(1).max(64),
  scope: mcpScopeSchema,
  config: mcpServerConfigSchema,
  workspacePath: z.string().optional(),
});
export const mcpSaveResponseSchema = z.object({ server: mcpServerViewSchema });

export const mcpDeleteRequestSchema = z.object({
  name: z.string().min(1).max(64),
  scope: mcpScopeSchema,
  workspacePath: z.string().optional(),
});
export const mcpDeleteResponseSchema = z.object({ deleted: z.boolean() });

export const mcpImportRequestSchema = z.object({
  json: z.string().min(1),
  scope: mcpScopeSchema,
  workspacePath: z.string().optional(),
});
export const mcpImportResponseSchema = z.object({
  imported: z.array(mcpServerViewSchema),
  skipped: z.array(z.object({ name: z.string(), reason: z.string() })),
});

export const mcpToolViewSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  inputSchema: z.record(z.string(), z.unknown()),
  piName: z.string().min(1),
  enabled: z.boolean(),
  autoApprove: z.boolean(),
  conflict: z.boolean().optional(),
});
export type McpToolView = z.infer<typeof mcpToolViewSchema>;

export const mcpServerInfoSchema = z.object({
  name: z.string(),
  version: z.string().optional(),
});
export type McpServerInfo = z.infer<typeof mcpServerInfoSchema>;

export const mcpSnapshotSchema = z.object({
  name: z.string(),
  status: z.enum(['disconnected', 'connecting', 'ready', 'degraded', 'failed']),
  tools: z.array(mcpToolViewSchema),
  lastError: z.string().nullable(),
  serverInfo: mcpServerInfoSchema.nullable(),
  connectedAt: z.number().nullable(),
  reconnectAttempts: z.number(),
});
export type McpSnapshot = z.infer<typeof mcpSnapshotSchema>;

export const mcpCallLogEntrySchema = z.object({
  id: z.number().int(),
  at: z.number(),
  server: z.string(),
  tool: z.string(),
  args: z.record(z.string(), z.unknown()),
  isError: z.boolean(),
  error: z.string().nullable(),
  durationMs: z.number(),
  result: z.unknown(),
});
export type McpCallLogEntry = z.infer<typeof mcpCallLogEntrySchema>;

export const mcpSnapshotsRequestSchema = z.object({ workspacePath: z.string().optional() });
export const mcpSnapshotsResponseSchema = z.object({ snapshots: z.array(mcpSnapshotSchema) });

export const mcpTestRequestSchema = z.object({
  name: z.string().min(1).max(64),
  workspacePath: z.string().optional(),
});
export const mcpTestResponseSchema = z.object({
  ok: z.boolean(),
  serverInfo: mcpServerInfoSchema.nullable(),
  toolCount: z.number().int().min(0),
  latencyMs: z.number().int().min(0),
  error: z.string().nullable(),
});

export const mcpToolsRequestSchema = z.object({
  name: z.string().min(1).max(64),
  workspacePath: z.string().optional(),
});
export const mcpToolsResponseSchema = z.object({ tools: z.array(mcpToolViewSchema) });

export const mcpLogsRequestSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  workspacePath: z.string().optional(),
});
export const mcpLogsResponseSchema = z.object({ logs: z.array(mcpCallLogEntrySchema) });

export const mcpExportRequestSchema = z.object({ workspacePath: z.string().optional() });
export const mcpExportResponseSchema = z.object({ json: z.string() });

export const skillViewSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  description: z.string().nullable(),
  license: z.string().optional(),
  compatibility: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  allowedTools: z.array(z.string()).optional(),
  disableModelInvocation: z.boolean().optional(),
  source: z.enum(['global', 'project']),
  scope: mcpScopeSchema,
  kind: z.enum(['dir', 'file']),
  path: z.string(),
  dir: z.string(),
  files: z.array(z.string()),
  status: z.enum(['active', 'disabled', 'invalid', 'shadowed']),
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
  infos: z.array(z.string()),
});
export type SkillView = z.infer<typeof skillViewSchema>;

export const skillsListRequestSchema = z.object({ workspacePath: z.string().optional() });
export const skillsListResponseSchema = z.object({ skills: z.array(skillViewSchema) });

export const skillsReadRequestSchema = z.object({
  id: z.string().min(1),
  workspacePath: z.string().optional(),
});
export const skillsReadResponseSchema = z.object({ content: z.string() });

export const skillsSetEnabledRequestSchema = z.object({
  id: z.string().min(1),
  enabled: z.boolean(),
  workspacePath: z.string().optional(),
});
export const skillsSetEnabledResponseSchema = z.object({ skill: skillViewSchema });

export const skillsCreateRequestSchema = z.object({
  name: z.string().min(1).max(64),
  description: z.string().min(1).max(1024),
  template: z.enum(['script', 'docs', 'api']).optional(),
  scope: z.enum(['global', 'project']).optional(),
  workspacePath: z.string().optional(),
});
export const skillsCreateResponseSchema = z.object({ skill: skillViewSchema });

export const skillsUpdateRequestSchema = z.object({
  id: z.string().min(1),
  content: z.string(),
  workspacePath: z.string().optional(),
});
export const skillsUpdateResponseSchema = z.object({ skill: skillViewSchema });

export const skillsValidateRequestSchema = z.object({
  content: z.string(),
  dirName: z.string().optional(),
});
export const skillsValidateResponseSchema = z.object({
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
  infos: z.array(z.string()),
});

export const skillInstallSourceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('dir'), path: z.string().min(1) }),
  z.object({ type: z.literal('zip'), path: z.string().min(1) }),
  z.object({ type: z.literal('git'), url: z.string().min(1), ref: z.string().optional() }),
]);
export type SkillInstallSource = z.infer<typeof skillInstallSourceSchema>;

export const skillsInstallRequestSchema = z.object({
  source: skillInstallSourceSchema,
  scope: z.enum(['global', 'project']).optional(),
  workspacePath: z.string().optional(),
});
export const skillsInstallResponseSchema = z.object({
  installed: z.array(skillViewSchema),
  skipped: z.array(z.object({ name: z.string(), reason: z.string() })),
});

export const skillsRecommendedResponseSchema = z.object({
  sources: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      url: z.string(),
      description: z.string(),
    }),
  ),
});

export const skillsHarnessStatusResponseSchema = z.object({
  harnesses: z.array(
    z.object({
      id: z.enum(['claude', 'codex']),
      name: z.string(),
      path: z.string(),
      exists: z.boolean(),
      imported: z.boolean(),
    }),
  ),
});

export const skillsImportHarnessRequestSchema = z.object({
  harness: z.enum(['claude', 'codex']),
});
export const skillsImportHarnessResponseSchema = z.object({
  added: z.array(z.string()),
  skipped: z.array(z.string()),
});

/** Pi Package 管理（README 8.5.1 / 4.13，M7 第五步）。 */
export const packageScopeSchema = z.enum(['global', 'project']);
export type PackageScope = z.infer<typeof packageScopeSchema>;

export const packageResourceFilterSchema = z.object({
  extensions: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
  prompts: z.array(z.string()).optional(),
  themes: z.array(z.string()).optional(),
  autoload: z.boolean().optional(),
});
export type PackageResourceFilter = z.infer<typeof packageResourceFilterSchema>;

export const packageViewSchema = z.object({
  id: z.string(),
  source: z.string(),
  sourceType: z.enum(['npm', 'git', 'local']),
  name: z.string(),
  scope: packageScopeSchema,
  version: z.string().optional(),
  ref: z.string().optional(),
  installed: z.boolean(),
  installPath: z.string().optional(),
  resources: z.object({
    extensions: z.number().int().nonnegative(),
    skills: z.number().int().nonnegative(),
    prompts: z.number().int().nonnegative(),
    themes: z.number().int().nonnegative(),
  }),
  filter: packageResourceFilterSchema.optional(),
  autoload: z.boolean(),
  conflict: z.enum(['project-overrides', 'delta-overlay', 'overridden-by-project']).nullable(),
});
export type PackageView = z.infer<typeof packageViewSchema>;

export const packagesListRequestSchema = z.object({ workspacePath: z.string().optional() });
export const packagesListResponseSchema = z.object({ packages: z.array(packageViewSchema) });

export const packageInstallSourceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('npm'), name: z.string().min(1), version: z.string().optional() }),
  z.object({ type: z.literal('git'), url: z.string().min(1), ref: z.string().optional() }),
  z.object({ type: z.literal('local'), path: z.string().min(1) }),
]);
export type PackageInstallSource = z.infer<typeof packageInstallSourceSchema>;

export const packagesInstallRequestSchema = z.object({
  source: packageInstallSourceSchema,
  scope: packageScopeSchema,
  workspacePath: z.string().optional(),
});
export const packagesInstallResponseSchema = z.object({
  ok: z.boolean(),
  log: z.string(),
  command: z.string(),
  package: packageViewSchema.optional(),
});

export const packagesUninstallRequestSchema = z.object({
  source: z.string().min(1),
  scope: packageScopeSchema,
  workspacePath: z.string().optional(),
});
export const packagesUninstallResponseSchema = z.object({
  ok: z.boolean(),
  log: z.string(),
  command: z.string(),
});

export const packagesUpdateRequestSchema = z.object({
  source: z.string().optional(),
  extensions: z.boolean().optional(),
  scope: packageScopeSchema,
  workspacePath: z.string().optional(),
});
export const packagesUpdateResponseSchema = z.object({
  ok: z.boolean(),
  log: z.string(),
  command: z.string(),
  note: z.string().optional(),
});

export const packagesSetFilterRequestSchema = z.object({
  source: z.string().min(1),
  scope: packageScopeSchema,
  filter: packageResourceFilterSchema,
  workspacePath: z.string().optional(),
});
export const packagesSetFilterResponseSchema = z.object({ package: packageViewSchema });

export const packageSecurityInspectionSchema = z.object({
  source: z.string(),
  sourceType: z.enum(['npm', 'git', 'local']),
  name: z.string(),
  version: z.string().optional(),
  fileCount: z.number().int().nonnegative(),
  files: z.array(z.string()),
  hasPostinstall: z.boolean(),
  installScripts: z.object({
    preinstall: z.string().optional(),
    install: z.string().optional(),
    postinstall: z.string().optional(),
  }),
  dependencies: z.record(z.string(), z.string()),
  license: z.string().optional(),
  description: z.string().optional(),
  warnings: z.array(z.string()),
});
export type PackageSecurityInspection = z.infer<typeof packageSecurityInspectionSchema>;

export const packagesInspectRequestSchema = z.object({ source: packageInstallSourceSchema });
export const packagesInspectResponseSchema = z.object({
  inspection: packageSecurityInspectionSchema,
});

/** 设置页（README 9.7 / 16.2）：ConfigStore 读写 + schema 校验。 */
export const configFileKindSchema = z.enum(['settings', 'models']);
export const configScopeSchema = z.enum(['global', 'project']);
export const configValidationIssueSchema = z.object({
  path: z.string(),
  line: z.number().int().nullable(),
  message: z.string(),
});
export type ConfigValidationIssue = z.infer<typeof configValidationIssueSchema>;

export const settingsReadRequestSchema = z.object({
  file: configFileKindSchema,
  scope: configScopeSchema,
  workspacePath: z.string().optional(),
});
export const settingsReadResponseSchema = z.object({
  path: z.string(),
  raw: z.string(),
  parsed: z.record(z.string(), z.unknown()),
  validation: z.array(configValidationIssueSchema),
});
export type SettingsReadResult = z.infer<typeof settingsReadResponseSchema>;

export const settingsSaveRequestSchema = z
  .object({
    file: configFileKindSchema,
    scope: configScopeSchema,
    raw: z.string().optional(),
    parsed: z.record(z.string(), z.unknown()).optional(),
    workspacePath: z.string().optional(),
  })
  .refine((d) => d.raw !== undefined || d.parsed !== undefined, {
    message: 'raw 或 parsed 必须提供一个',
  });
export const settingsSaveResponseSchema = settingsReadResponseSchema.extend({
  saved: z.boolean(),
});
export type SettingsSaveResult = z.infer<typeof settingsSaveResponseSchema>;

export const settingsKernelStatusResponseSchema = z.object({
  agentDir: z.string(),
  binary: z.string().nullable(),
  binaryExists: z.boolean(),
  binDir: z.string(),
  binDirExists: z.boolean(),
  version: z.string().nullable(),
});
export type KernelStatus = z.infer<typeof settingsKernelStatusResponseSchema>;

/** Profile（README 8.8.3 / 4.15）：Agent Dir 隔离。 */
export const profileViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  agentDir: z.string(),
  isDefault: z.boolean(),
  active: z.boolean(),
  exists: z.boolean(),
});
export type ProfileView = z.infer<typeof profileViewSchema>;

export const profileListResponseSchema = z.object({
  profiles: z.array(profileViewSchema),
  activeId: z.string(),
});
export const profileCreateRequestSchema = z.object({
  name: z.string().trim().min(1).max(64),
});
export const profileCreateResponseSchema = z.object({ profile: profileViewSchema });
export const profileSwitchRequestSchema = z.object({
  id: z.string().min(1).max(64),
});
export const profileSwitchResponseSchema = z.object({
  activeId: z.string(),
  agentDir: z.string(),
  /** README 8.8.3：切换需重启所有 sidecar，重启应用后按新激活档装配。 */
  requiresRestart: z.boolean(),
});
export const profileDeleteRequestSchema = z.object({
  id: z.string().min(1).max(64),
});
export const profileDeleteResponseSchema = z.object({ deleted: z.string() });

/** Extension 兼容性标注（README 8.5.2）。 */
export const extensionCompatLevelSchema = z.enum(['FULL', 'PARTIAL', 'DEGRADED', 'TUI_ONLY']);
export type ExtensionCompatLevel = z.infer<typeof extensionCompatLevelSchema>;

export const extensionCompatIssueSchema = z.object({
  api: z.string(),
  level: extensionCompatLevelSchema,
  line: z.number().int().nullable(),
  snippet: z.string().optional(),
});
export type ExtensionCompatIssue = z.infer<typeof extensionCompatIssueSchema>;

export const extensionRuntimeNoteSchema = z.object({
  at: z.string(),
  kind: z.enum(['ui.request', 'extension.error']),
  detail: z.string(),
  extensionPath: z.string().optional(),
});
export type ExtensionRuntimeNote = z.infer<typeof extensionRuntimeNoteSchema>;

export const extensionViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  source: z.enum(['global', 'project', 'configured']),
  level: extensionCompatLevelSchema,
  issues: z.array(extensionCompatIssueSchema),
  runtimeNotes: z.array(extensionRuntimeNoteSchema),
});
export type ExtensionView = z.infer<typeof extensionViewSchema>;

export const extensionsListRequestSchema = z.object({
  workspacePath: z.string().optional(),
});
export const extensionsListResponseSchema = z.object({
  extensions: z.array(extensionViewSchema),
  runtimeNotes: z.array(extensionRuntimeNoteSchema),
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
  'workspace:pick-file': {
    request: undefined;
    response: z.infer<typeof workspacePickFileResponseSchema>;
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
  'session:set-approval-mode': {
    request: z.infer<typeof sessionSetApprovalModeRequestSchema>;
    response: undefined;
  };
  'approval:respond': {
    request: z.infer<typeof approvalRespondRequestSchema>;
    response: undefined;
  };
  'approval:audit-list': {
    request: z.infer<typeof approvalAuditListRequestSchema>;
    response: z.infer<typeof approvalAuditListResponseSchema>;
  };
  'approval:audit-export': {
    request: z.infer<typeof approvalAuditExportRequestSchema>;
    response: z.infer<typeof approvalAuditExportResponseSchema>;
  };
  'approval:audit-clear': {
    request: z.infer<typeof approvalAuditClearRequestSchema>;
    response: z.infer<typeof approvalAuditClearResponseSchema>;
  };
  'approval:rules-list': {
    request: z.infer<typeof approvalRulesListRequestSchema>;
    response: z.infer<typeof approvalRulesListResponseSchema>;
  };
  'approval:rules-save': {
    request: z.infer<typeof approvalRuleSaveRequestSchema>;
    response: z.infer<typeof approvalRuleSaveResponseSchema>;
  };
  'approval:rules-delete': {
    request: z.infer<typeof approvalRuleDeleteRequestSchema>;
    response: undefined;
  };
  'mcp:list': {
    request: z.infer<typeof mcpListRequestSchema>;
    response: z.infer<typeof mcpListResponseSchema>;
  };
  'mcp:save': {
    request: z.infer<typeof mcpSaveRequestSchema>;
    response: z.infer<typeof mcpSaveResponseSchema>;
  };
  'mcp:delete': {
    request: z.infer<typeof mcpDeleteRequestSchema>;
    response: z.infer<typeof mcpDeleteResponseSchema>;
  };
  'mcp:import': {
    request: z.infer<typeof mcpImportRequestSchema>;
    response: z.infer<typeof mcpImportResponseSchema>;
  };
  'mcp:snapshots': {
    request: z.infer<typeof mcpSnapshotsRequestSchema>;
    response: z.infer<typeof mcpSnapshotsResponseSchema>;
  };
  'mcp:test': {
    request: z.infer<typeof mcpTestRequestSchema>;
    response: z.infer<typeof mcpTestResponseSchema>;
  };
  'mcp:tools': {
    request: z.infer<typeof mcpToolsRequestSchema>;
    response: z.infer<typeof mcpToolsResponseSchema>;
  };
  'mcp:logs': {
    request: z.infer<typeof mcpLogsRequestSchema>;
    response: z.infer<typeof mcpLogsResponseSchema>;
  };
  'mcp:export': {
    request: z.infer<typeof mcpExportRequestSchema>;
    response: z.infer<typeof mcpExportResponseSchema>;
  };
  'skills:list': {
    request: z.infer<typeof skillsListRequestSchema>;
    response: z.infer<typeof skillsListResponseSchema>;
  };
  'skills:read': {
    request: z.infer<typeof skillsReadRequestSchema>;
    response: z.infer<typeof skillsReadResponseSchema>;
  };
  'skills:set-enabled': {
    request: z.infer<typeof skillsSetEnabledRequestSchema>;
    response: z.infer<typeof skillsSetEnabledResponseSchema>;
  };
  'skills:create': {
    request: z.infer<typeof skillsCreateRequestSchema>;
    response: z.infer<typeof skillsCreateResponseSchema>;
  };
  'skills:update': {
    request: z.infer<typeof skillsUpdateRequestSchema>;
    response: z.infer<typeof skillsUpdateResponseSchema>;
  };
  'skills:validate': {
    request: z.infer<typeof skillsValidateRequestSchema>;
    response: z.infer<typeof skillsValidateResponseSchema>;
  };
  'skills:install': {
    request: z.infer<typeof skillsInstallRequestSchema>;
    response: z.infer<typeof skillsInstallResponseSchema>;
  };
  'skills:recommended': {
    request: undefined;
    response: z.infer<typeof skillsRecommendedResponseSchema>;
  };
  'skills:harness-status': {
    request: undefined;
    response: z.infer<typeof skillsHarnessStatusResponseSchema>;
  };
  'skills:import-harness': {
    request: z.infer<typeof skillsImportHarnessRequestSchema>;
    response: z.infer<typeof skillsImportHarnessResponseSchema>;
  };
  'packages:list': {
    request: z.infer<typeof packagesListRequestSchema>;
    response: z.infer<typeof packagesListResponseSchema>;
  };
  'packages:install': {
    request: z.infer<typeof packagesInstallRequestSchema>;
    response: z.infer<typeof packagesInstallResponseSchema>;
  };
  'packages:uninstall': {
    request: z.infer<typeof packagesUninstallRequestSchema>;
    response: z.infer<typeof packagesUninstallResponseSchema>;
  };
  'packages:update': {
    request: z.infer<typeof packagesUpdateRequestSchema>;
    response: z.infer<typeof packagesUpdateResponseSchema>;
  };
  'packages:set-filter': {
    request: z.infer<typeof packagesSetFilterRequestSchema>;
    response: z.infer<typeof packagesSetFilterResponseSchema>;
  };
  'packages:inspect': {
    request: z.infer<typeof packagesInspectRequestSchema>;
    response: z.infer<typeof packagesInspectResponseSchema>;
  };
  'settings:read': {
    request: z.infer<typeof settingsReadRequestSchema>;
    response: z.infer<typeof settingsReadResponseSchema>;
  };
  'settings:save': {
    request: z.infer<typeof settingsSaveRequestSchema>;
    response: z.infer<typeof settingsSaveResponseSchema>;
  };
  'settings:kernel-status': {
    request: undefined;
    response: z.infer<typeof settingsKernelStatusResponseSchema>;
  };
  'profile:list': {
    request: undefined;
    response: z.infer<typeof profileListResponseSchema>;
  };
  'profile:create': {
    request: z.infer<typeof profileCreateRequestSchema>;
    response: z.infer<typeof profileCreateResponseSchema>;
  };
  'profile:switch': {
    request: z.infer<typeof profileSwitchRequestSchema>;
    response: z.infer<typeof profileSwitchResponseSchema>;
  };
  'profile:delete': {
    request: z.infer<typeof profileDeleteRequestSchema>;
    response: z.infer<typeof profileDeleteResponseSchema>;
  };
  'extensions:list': {
    request: z.infer<typeof extensionsListRequestSchema>;
    response: z.infer<typeof extensionsListResponseSchema>;
  };
}

/** 事件推送映射（主 → 渲染，单向 send）。 */
export interface EventMap {
  'event:session': z.infer<typeof sessionEventSchema>;
  'event:approval': z.infer<typeof approvalRequestViewSchema>;
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
  'workspace:pick-file': z.undefined(),
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
  'session:set-approval-mode': sessionSetApprovalModeRequestSchema,
  'approval:respond': approvalRespondRequestSchema,
  'approval:audit-list': approvalAuditListRequestSchema,
  'approval:audit-export': approvalAuditExportRequestSchema,
  'approval:audit-clear': approvalAuditClearRequestSchema,
  'approval:rules-list': approvalRulesListRequestSchema,
  'approval:rules-save': approvalRuleSaveRequestSchema,
  'approval:rules-delete': approvalRuleDeleteRequestSchema,
  'mcp:list': mcpListRequestSchema,
  'mcp:save': mcpSaveRequestSchema,
  'mcp:delete': mcpDeleteRequestSchema,
  'mcp:import': mcpImportRequestSchema,
  'mcp:snapshots': mcpSnapshotsRequestSchema,
  'mcp:test': mcpTestRequestSchema,
  'mcp:tools': mcpToolsRequestSchema,
  'mcp:logs': mcpLogsRequestSchema,
  'mcp:export': mcpExportRequestSchema,
  'skills:list': skillsListRequestSchema,
  'skills:read': skillsReadRequestSchema,
  'skills:set-enabled': skillsSetEnabledRequestSchema,
  'skills:create': skillsCreateRequestSchema,
  'skills:update': skillsUpdateRequestSchema,
  'skills:validate': skillsValidateRequestSchema,
  'skills:install': skillsInstallRequestSchema,
  'skills:recommended': z.undefined(),
  'skills:harness-status': z.undefined(),
  'skills:import-harness': skillsImportHarnessRequestSchema,
  'packages:list': packagesListRequestSchema,
  'packages:install': packagesInstallRequestSchema,
  'packages:uninstall': packagesUninstallRequestSchema,
  'packages:update': packagesUpdateRequestSchema,
  'packages:set-filter': packagesSetFilterRequestSchema,
  'packages:inspect': packagesInspectRequestSchema,
  'settings:read': settingsReadRequestSchema,
  'settings:save': settingsSaveRequestSchema,
  'settings:kernel-status': z.undefined(),
  'profile:list': z.undefined(),
  'profile:create': profileCreateRequestSchema,
  'profile:switch': profileSwitchRequestSchema,
  'profile:delete': profileDeleteRequestSchema,
  'extensions:list': extensionsListRequestSchema,
} as const satisfies Record<InvokeChannel, z.ZodType>;

export type InvokeRequest<C extends keyof InvokeMap> = InvokeMap[C]['request'];
export type InvokeResponse<C extends keyof InvokeMap> = InvokeMap[C]['response'];
