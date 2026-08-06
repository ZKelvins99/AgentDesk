/**
 * MCP Host 共享类型（README 8.3）：连接管理 / 工具视图 / 调用结果的解耦契约。
 * 主进程（mcp-manager / mcp-sdk）与单测 fake 都基于这些接口。
 */

/** 健康状态机（README 8.3.2）：disconnected → connecting → ready → degraded → failed。 */
export type McpServerStatus = 'disconnected' | 'connecting' | 'ready' | 'degraded' | 'failed';

export interface McpToolInfo {
  /** MCP server 侧原始工具名 */
  name: string;
  description?: string;
  /** JSON Schema（tools/list 原样） */
  inputSchema: Record<string, unknown>;
}

export interface McpToolView extends McpToolInfo {
  /** pi 侧工具名：mcp__<serverId>__<toolName> */
  piName: string;
  enabled: boolean;
  autoApprove: boolean;
  /** 与 pi 内置/其他扩展工具重名时 MCP 让位，UI 标红（README 8.3.3）。 */
  conflict?: boolean;
}

export interface McpServerInfo {
  name: string;
  version?: string;
}

export interface McpServerSnapshot {
  name: string;
  status: McpServerStatus;
  tools: McpToolView[];
  lastError: string | null;
  serverInfo: McpServerInfo | null;
  connectedAt: number | null;
  reconnectAttempts: number;
}

/** discoverTools 的单个 server 聚合结果（uplink GET /mcp/tools）。 */
export interface McpServerDiscovery {
  name: string;
  status: McpServerStatus;
  error: string | null;
  tools: McpToolView[];
}

export interface McpCallRequest {
  /** serverId（配置里的 server 名） */
  server: string;
  /** 原始 MCP 工具名 */
  tool: string;
  args: Record<string, unknown>;
}

export interface McpCallOptions {
  workspacePath?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export type McpCallContent =
  | { type: 'text'; text: string }
  | { type: 'image' | 'audio' | 'video'; data: string; mimeType?: string }
  | { type: 'resource'; uri: string; mimeType?: string; text?: string }
  | { type: 'other'; raw?: unknown };

export interface McpCallResult {
  isError: boolean;
  content: McpCallContent[];
  /** 原始 CallToolResult，供审计日志与调试 */
  raw: unknown;
}

export class McpCallError extends Error {
  constructor(
    readonly code: 'timeout' | 'aborted' | 'unavailable' | 'error',
    message: string,
  ) {
    super(message);
    this.name = 'McpCallError';
  }
}

export class McpServerConnectError extends Error {
  constructor(
    readonly server: string,
    message: string,
  ) {
    super(message);
    this.name = 'McpServerConnectError';
  }
}

/** Transport 抽象：SDK 三种 transport 的最小公共面。 */
export interface McpTransportLike {
  close(): Promise<void>;
  readonly pid?: number | null;
}

/** Client 抽象：真实实现是 SdkMcpClient，测试可注入 fake。 */
export interface McpClientLike {
  connect(): Promise<void>;
  close(): Promise<void>;
  listTools(): Promise<{ tools: McpToolInfo[] }>;
  callTool(
    tool: string,
    args: Record<string, unknown>,
    options: { timeoutMs: number; signal?: AbortSignal },
  ): Promise<McpCallResult>;
  /** 订阅 notifications/tools/list_changed（MCP 服务端工具热更新）。 */
  setToolsChangedHandler(handler: (() => void) | null): void;
  /** transport 意外断开回调（重连状态机用；真实实现由 transport onclose 触发）。 */
  setDisconnectHandler(handler: (() => void) | null): void;
  getServerInfo(): McpServerInfo | null;
  /** stdio server 最近 stderr 行（诊断用）。 */
  readonly recentStderr?: string[];
}

export type McpClientFactory = (config: import('@agentdesk/ipc').McpServerConfig) => McpClientLike;
