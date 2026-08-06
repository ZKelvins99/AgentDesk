/**
 * 迁移清单（README 8.8.2）：按 id 顺序在事务内应用，记录到 migrations 表。
 * 不依赖 drizzle-kit 生成物，纯 SQL DDL，便于审计与回放。
 */
export interface Migration {
  id: string;
  sql: string[];
}

export const MIGRATIONS: Migration[] = [
  {
    id: '0001_init',
    sql: [
      `CREATE TABLE workspaces (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        icon TEXT,
        trust TEXT NOT NULL DEFAULT 'unknown',
        lastOpenedAt INTEGER,
        settingsJson TEXT,
        createdAt INTEGER NOT NULL
      )`,
      `CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        workspaceId TEXT,
        piSessionId TEXT,
        sessionFile TEXT,
        title TEXT NOT NULL DEFAULT '新对话',
        provider TEXT,
        model TEXT,
        thinkingLevel TEXT,
        approvalMode TEXT,
        status TEXT NOT NULL DEFAULT 'idle',
        messageCount INTEGER NOT NULL DEFAULT 0,
        inputTokens INTEGER NOT NULL DEFAULT 0,
        outputTokens INTEGER NOT NULL DEFAULT 0,
        cacheReadTokens INTEGER NOT NULL DEFAULT 0,
        cacheWriteTokens INTEGER NOT NULL DEFAULT 0,
        costUsd REAL NOT NULL DEFAULT 0,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        archivedAt INTEGER,
        parentSessionId TEXT
      )`,
      `CREATE TABLE session_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sessionId TEXT NOT NULL,
        seq INTEGER NOT NULL,
        kind TEXT NOT NULL,
        payloadJson TEXT NOT NULL,
        createdAt INTEGER NOT NULL
      )`,
      `CREATE UNIQUE INDEX idx_session_events_session_seq ON session_events (sessionId, seq)`,
      `CREATE INDEX idx_sessions_workspace ON sessions (workspaceId)`,
      `CREATE INDEX idx_sessions_updated ON sessions (updatedAt DESC)`,
      `CREATE TABLE approval_rules (
        id TEXT PRIMARY KEY,
        scope TEXT NOT NULL,
        workspaceId TEXT,
        matcherJson TEXT NOT NULL,
        decision TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        expiresAt INTEGER
      )`,
      `CREATE TABLE approval_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sessionId TEXT,
        tool TEXT NOT NULL,
        argsHash TEXT,
        argsSummary TEXT,
        risk TEXT,
        decision TEXT NOT NULL,
        ruleId TEXT,
        at INTEGER NOT NULL
      )`,
      `CREATE TABLE mcp_servers (
        id TEXT PRIMARY KEY,
        scope TEXT NOT NULL,
        workspaceId TEXT,
        configJson TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        lastStatus TEXT,
        lastError TEXT,
        updatedAt INTEGER NOT NULL
      )`,
      `CREATE TABLE mcp_call_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sessionId TEXT,
        serverId TEXT,
        tool TEXT NOT NULL,
        ms INTEGER NOT NULL,
        ok INTEGER NOT NULL DEFAULT 1,
        errorMessage TEXT,
        at INTEGER NOT NULL
      )`,
      `CREATE TABLE providers_meta (
        id TEXT PRIMARY KEY,
        providerName TEXT NOT NULL,
        secretId TEXT,
        lastTestedAt INTEGER,
        lastTestResultJson TEXT
      )`,
      `CREATE TABLE secrets_meta (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        providerName TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        lastUsedAt INTEGER
      )`,
      `CREATE TABLE plugin_cache (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        metaJson TEXT,
        fetchedAt INTEGER NOT NULL
      )`,
      `CREATE TABLE app_state (
        key TEXT PRIMARY KEY,
        valueJson TEXT NOT NULL
      )`,
      `CREATE TABLE profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        agentDir TEXT NOT NULL,
        isDefault INTEGER NOT NULL DEFAULT 0,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      )`,
    ],
  },
];
