import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * AgentDesk SQLite schema（README 8.8.2）：
 * 会话索引 / 渲染缓存 / workspace 与信任 / 审批 / MCP / 密钥元数据 / 插件缓存 / UI 状态。
 * pi 仍持有会话完整内容，这里只存索引与可重建缓存（8.8.1 不重复存储）。
 */

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  path: text('path').notNull().unique(),
  name: text('name').notNull(),
  icon: text('icon'),
  trust: text('trust').notNull().default('unknown'),
  lastOpenedAt: integer('lastOpenedAt'),
  settingsJson: text('settingsJson'),
  createdAt: integer('createdAt').notNull(),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  workspaceId: text('workspaceId'),
  piSessionId: text('piSessionId'),
  sessionFile: text('sessionFile'),
  title: text('title').notNull().default('新对话'),
  provider: text('provider'),
  model: text('model'),
  thinkingLevel: text('thinkingLevel'),
  approvalMode: text('approvalMode'),
  status: text('status').notNull().default('idle'),
  messageCount: integer('messageCount').notNull().default(0),
  inputTokens: integer('inputTokens').notNull().default(0),
  outputTokens: integer('outputTokens').notNull().default(0),
  cacheReadTokens: integer('cacheReadTokens').notNull().default(0),
  cacheWriteTokens: integer('cacheWriteTokens').notNull().default(0),
  costUsd: real('costUsd').notNull().default(0),
  createdAt: integer('createdAt').notNull(),
  updatedAt: integer('updatedAt').notNull(),
  archivedAt: integer('archivedAt'),
  parentSessionId: text('parentSessionId'),
});

export const sessionEvents = sqliteTable('session_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('sessionId').notNull(),
  seq: integer('seq').notNull(),
  kind: text('kind').notNull(),
  payloadJson: text('payloadJson').notNull(),
  createdAt: integer('createdAt').notNull(),
});

export const approvalRules = sqliteTable('approval_rules', {
  id: text('id').primaryKey(),
  scope: text('scope').notNull(),
  workspaceId: text('workspaceId'),
  matcherJson: text('matcherJson').notNull(),
  decision: text('decision').notNull(),
  createdAt: integer('createdAt').notNull(),
  expiresAt: integer('expiresAt'),
});

export const approvalAudit = sqliteTable('approval_audit', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('sessionId'),
  tool: text('tool').notNull(),
  argsHash: text('argsHash'),
  argsSummary: text('argsSummary'),
  risk: text('risk'),
  decision: text('decision').notNull(),
  ruleId: text('ruleId'),
  at: integer('at').notNull(),
});

export const mcpServers = sqliteTable('mcp_servers', {
  id: text('id').primaryKey(),
  scope: text('scope').notNull(),
  workspaceId: text('workspaceId'),
  configJson: text('configJson').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  lastStatus: text('lastStatus'),
  lastError: text('lastError'),
  updatedAt: integer('updatedAt').notNull(),
});

export const mcpCallLog = sqliteTable('mcp_call_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('sessionId'),
  serverId: text('serverId'),
  tool: text('tool').notNull(),
  ms: integer('ms').notNull(),
  ok: integer('ok', { mode: 'boolean' }).notNull().default(true),
  errorMessage: text('errorMessage'),
  at: integer('at').notNull(),
});

export const providersMeta = sqliteTable('providers_meta', {
  id: text('id').primaryKey(),
  providerName: text('providerName').notNull(),
  secretId: text('secretId'),
  lastTestedAt: integer('lastTestedAt'),
  lastTestResultJson: text('lastTestResultJson'),
});

export const secretsMeta = sqliteTable('secrets_meta', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  providerName: text('providerName').notNull(),
  createdAt: integer('createdAt').notNull(),
  lastUsedAt: integer('lastUsedAt'),
});

export const pluginCache = sqliteTable('plugin_cache', {
  id: text('id').primaryKey(),
  source: text('source').notNull(),
  metaJson: text('metaJson'),
  fetchedAt: integer('fetchedAt').notNull(),
});

/** 文件变更审计（README 8.9：Diff 逐块接受/回滚记录）。 */
export const fileAudit = sqliteTable('file_audit', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  path: text('path').notNull(),
  workspacePath: text('workspacePath'),
  action: text('action').notNull(),
  patchJson: text('patchJson').notNull(),
  at: integer('at').notNull(),
});

export const appState = sqliteTable('app_state', {
  key: text('key').primaryKey(),
  valueJson: text('valueJson').notNull(),
});

export const profiles = sqliteTable('profiles', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  agentDir: text('agentDir').notNull(),
  isDefault: integer('isDefault', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('createdAt').notNull(),
  updatedAt: integer('updatedAt').notNull(),
});

export const migrations = sqliteTable('migrations', {
  id: text('id').primaryKey(),
  appliedAt: integer('appliedAt').notNull(),
});

export type WorkspaceRow = typeof workspaces.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type SessionEventRow = typeof sessionEvents.$inferSelect;
