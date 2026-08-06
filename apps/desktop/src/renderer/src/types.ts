/** 渲染层共享类型：与 packages/ipc 契约结构一致（env.d.ts 引用）。 */

export interface WorkspaceRecord {
  id: string;
  path: string;
  name: string;
  icon: string | null;
  trust: 'unknown' | 'once' | 'always' | 'alwaysParent' | 'never';
  lastOpenedAt: number | null;
  createdAt: number;
}

export interface SessionSummary {
  id: string;
  workspaceId: string | null;
  workspacePath: string | null;
  title: string;
  provider: string | null;
  model: string | null;
  status: 'idle' | 'streaming' | 'degraded' | 'error';
  messageCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  seq: number;
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
}
