/**
 * MCP SDK 适配器（README 8.3.2）：基于 @modelcontextprotocol/sdk 的 Client +
 * StdioClientTransport / SSEClientTransport / StreamableHTTPClientTransport。
 * 与 McpConnectionManager 解耦：上层只依赖 McpClientLike 接口。
 */
import type { McpServerConfig } from '@agentdesk/ipc';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  ErrorCode,
  McpError,
  ToolListChangedNotificationSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { killProcessTree } from '../pi/sidecar';
import type {
  McpCallContent,
  McpCallResult,
  McpClientLike,
  McpServerInfo,
  McpToolInfo,
} from './mcp-types';
import { McpCallError } from './mcp-types';

export interface SdkMcpClientOptions {
  config: McpServerConfig;
  onStderr?: (line: string) => void;
}

type SdkTransport = StdioClientTransport | SSEClientTransport | StreamableHTTPClientTransport;

const STDERR_RING_SIZE = 200;
const LIST_TOOLS_TIMEOUT_MS = 15_000;

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' ||
      error.name === 'TimeoutError' ||
      error.name === 'AbortSignalTimeError')
  );
}

function toContent(item: unknown): McpCallContent | null {
  if (typeof item !== 'object' || item === null) return null;
  const record = item as Record<string, unknown>;
  const type = record.type;
  if (type === 'text' && typeof record.text === 'string') {
    return { type: 'text', text: record.text };
  }
  if (
    (type === 'image' || type === 'audio' || type === 'video') &&
    typeof record.data === 'string'
  ) {
    const mimeType = typeof record.mimeType === 'string' ? record.mimeType : undefined;
    if (mimeType !== undefined) return { type, data: record.data, mimeType };
    return { type, data: record.data };
  }
  if (type === 'resource' && typeof record.resource === 'object' && record.resource !== null) {
    const resource = record.resource as Record<string, unknown>;
    const uri = typeof resource.uri === 'string' ? resource.uri : '';
    if (!uri) return { type: 'other', raw: item };
    const mimeType = typeof resource.mimeType === 'string' ? resource.mimeType : undefined;
    const text = typeof resource.text === 'string' ? resource.text : undefined;
    const base: { type: 'resource'; uri: string; mimeType?: string; text?: string } = {
      type: 'resource',
      uri,
    };
    if (mimeType !== undefined) base.mimeType = mimeType;
    if (text !== undefined) base.text = text;
    return base;
  }
  return { type: 'other', raw: item };
}

function normalizeCallResult(raw: CallToolResult): McpCallResult {
  const content: McpCallContent[] = [];
  for (const item of Array.isArray(raw.content) ? raw.content : []) {
    const converted = toContent(item);
    if (converted) content.push(converted);
  }
  return { isError: raw.isError === true, content, raw };
}

export class SdkMcpClient implements McpClientLike {
  private readonly config: McpServerConfig;
  private readonly onStderr: ((line: string) => void) | undefined;
  private readonly client: Client;
  private transport: SdkTransport | null = null;
  private serverInfo: McpServerInfo | null = null;
  private toolsChangedHandler: (() => void) | null = null;
  private disconnectHandler: (() => void) | null = null;
  private readonly stderrRing: string[] = [];

  constructor(options: SdkMcpClientOptions) {
    this.config = options.config;
    this.onStderr = options.onStderr;
    this.client = new Client({ name: 'agentdesk-mcp-host', version: '0.0.0' });
  }

  get recentStderr(): string[] {
    return [...this.stderrRing];
  }

  setToolsChangedHandler(handler: (() => void) | null): void {
    this.toolsChangedHandler = handler;
  }

  setDisconnectHandler(handler: (() => void) | null): void {
    this.disconnectHandler = handler;
  }

  getServerInfo(): McpServerInfo | null {
    return this.serverInfo;
  }

  async connect(): Promise<void> {
    const transport = this.createTransport();
    this.transport = transport;
    try {
      // SDK 1.30 的 esm 类型在 exactOptionalPropertyTypes 下对 sessionId getter
      // 存在误报（类声明 implements Transport，运行时结构一致），此处显式收窄。
      await this.client.connect(transport as Transport);
      this.client.setNotificationHandler(ToolListChangedNotificationSchema, () => {
        this.toolsChangedHandler?.();
      });
      const version = this.client.getServerVersion();
      this.serverInfo = version ? { name: version.name, version: version.version } : null;
    } catch (error) {
      this.serverInfo = null;
      await transport.close().catch(() => {});
      throw error;
    }
  }

  async close(): Promise<void> {
    const transport = this.transport;
    this.transport = null;
    this.serverInfo = null;
    if (!transport) return;
    const pid = 'pid' in transport && typeof transport.pid === 'number' ? transport.pid : null;
    // stdio：趁根进程还活着先软杀整树、再强制补杀（taskkill /T 只认存活根进程），
    // 之后才关闭协议流，避免 SDK 杀掉直接子进程后漏掉孙进程（README 8.3.2）。
    if (pid !== null && pid > 0) {
      await killProcessTree(pid, false, 2_000);
      await killProcessTree(pid, true, 3_000);
    }
    await this.client.close().catch(() => {});
    await transport.close().catch(() => {});
  }

  async listTools(): Promise<{ tools: McpToolInfo[] }> {
    const tools: McpToolInfo[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.client.listTools(cursor ? { cursor } : undefined, {
        timeout: LIST_TOOLS_TIMEOUT_MS,
      });
      for (const tool of page.tools) {
        const info: McpToolInfo = {
          name: tool.name,
          inputSchema: (tool.inputSchema ?? {}) as Record<string, unknown>,
        };
        if (typeof tool.description === 'string') info.description = tool.description;
        tools.push(info);
      }
      cursor = typeof page.nextCursor === 'string' ? page.nextCursor : undefined;
    } while (cursor);
    return { tools };
  }

  async callTool(
    tool: string,
    args: Record<string, unknown>,
    options: { timeoutMs: number; signal?: AbortSignal },
  ): Promise<McpCallResult> {
    try {
      const raw = (await this.client.callTool({ name: tool, arguments: args }, undefined, {
        ...(options.signal !== undefined ? { signal: options.signal } : {}),
        timeout: options.timeoutMs,
      })) as CallToolResult;
      return normalizeCallResult(raw);
    } catch (error) {
      if (error instanceof McpError && error.code === ErrorCode.RequestTimeout) {
        throw new McpCallError('timeout', `MCP 工具 ${tool} 调用超时（${options.timeoutMs}ms）`);
      }
      if (isAbortError(error)) {
        throw new McpCallError('aborted', `MCP 工具 ${tool} 调用已取消`);
      }
      throw error;
    }
  }

  private createTransport(): SdkTransport {
    const config = this.config;
    const handleDisconnect = (): void => {
      this.disconnectHandler?.();
    };
    if (config.transport === 'stdio') {
      const transport = new StdioClientTransport({
        command: config.command ?? '',
        args: config.args ?? [],
        stderr: 'pipe',
        ...(config.env !== undefined ? { env: config.env } : {}),
        ...(config.cwd !== undefined ? { cwd: config.cwd } : {}),
      });
      transport.onclose = () => handleDisconnect();
      transport.onerror = () => handleDisconnect();
      transport.stderr?.on('data', (chunk: Buffer) => {
        for (const line of chunk.toString('utf8').split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          this.stderrRing.push(trimmed);
          if (this.stderrRing.length > STDERR_RING_SIZE) this.stderrRing.shift();
          this.onStderr?.(trimmed);
        }
      });
      return transport;
    }
    const url = new URL(config.url ?? '');
    const requestInit = config.headers ? { requestInit: { headers: config.headers } } : {};
    if (config.transport === 'sse') {
      const transport = new SSEClientTransport(url, requestInit);
      transport.onclose = () => handleDisconnect();
      transport.onerror = () => handleDisconnect();
      return transport;
    }
    const transport = new StreamableHTTPClientTransport(url, requestInit);
    transport.onclose = () => handleDisconnect();
    transport.onerror = () => handleDisconnect();
    return transport;
  }
}
