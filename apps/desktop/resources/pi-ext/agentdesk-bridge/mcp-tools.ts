/**
 * MCP 工具注册（README 8.3.3/8.3.4）：uplink GET /mcp/tools 拉取清单 → pi.registerTool。
 * execute → uplink POST /mcp/call → 主进程 MCP Host 转发；signal abort → POST /mcp/cancel。
 * 热更新：uplink.on('mcp:changed') → 重新拉取并注册新出现的工具（pi 无注销 API，V1 只增不删）。
 */
import { jsonSchemaToTypeBox } from './schema-to-typebox';
import type { Uplink } from './uplink';

export interface McpToolView {
  name: string;
  piName: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  enabled: boolean;
  autoApprove: boolean;
  conflict?: boolean;
}

interface McpToolsResponse {
  servers: Array<{
    name: string;
    status: string;
    error: string | null;
    tools: McpToolView[];
  }>;
}

interface UplinkCallResult {
  isError: boolean;
  content: Array<{ type: string; text?: string; uri?: string; mimeType?: string; data?: string }>;
  truncated?: boolean;
}

/** pi 的 registerTool 最小结构（README 4.12 ExtensionAPI + pi docs/extensions.md）。 */
export interface PiToolApi {
  registerTool(tool: {
    name: string;
    label?: string;
    description: string;
    parameters: unknown;
    execute: (
      toolCallId: string,
      params: unknown,
      signal: AbortSignal | undefined,
      onUpdate: ((update: { content?: unknown[] }) => void) | undefined,
      ctx: unknown,
    ) => Promise<unknown>;
  }): void;
  /** pi 已注册工具清单（docs/extensions.md getAllTools），用于命名冲突让位检测。 */
  getAllTools?: () => Array<{ name: string }>;
}

const CALL_SLACK_MS = 10_000;
const DEFAULT_CALL_TIMEOUT_MS = 30_000;

export async function registerMcpTools(
  pi: PiToolApi,
  uplink: Uplink | null,
  sessionId: string,
): Promise<void> {
  if (!uplink) return;
  const registered = new Set<string>();

  const register = async (): Promise<void> => {
    let response: McpToolsResponse;
    try {
      response = (await uplink.get(
        `/mcp/tools?sessionId=${encodeURIComponent(sessionId)}`,
        20_000,
      )) as McpToolsResponse;
    } catch (error) {
      console.warn(`[agentdesk] mcp/tools 拉取失败：${(error as Error).message}`);
      return;
    }
    const existingNames = new Set((pi.getAllTools?.() ?? []).map((t) => t.name));
    for (const server of response.servers ?? []) {
      if (server.status !== 'ready') continue;
      for (const tool of server.tools ?? []) {
        if (!tool.enabled || registered.has(tool.piName)) continue;
        if (existingNames.has(tool.piName)) {
          // MCP 让位：与 pi 内置/其他扩展工具重名时跳过注册并上报标红（README 8.3.3）
          console.warn(`[agentdesk] ${tool.piName} 与 pi 已有工具重名，MCP 让位`);
          void uplink
            .post('/mcp/conflict', {
              sessionId,
              server: server.name,
              tool: tool.name,
              piName: tool.piName,
              conflict: true,
            })
            .catch(() => {});
          continue;
        }
        registered.add(tool.piName);
        const converted = jsonSchemaToTypeBox(tool.inputSchema ?? {});
        if (converted.warnings.length > 0) {
          console.warn(
            `[agentdesk] ${tool.piName} schema 部分降级：${converted.warnings.join('; ')}`,
          );
        }
        const serverName = server.name;
        pi.registerTool({
          name: tool.piName,
          label: tool.name,
          description: tool.description ?? `MCP 工具 ${tool.name}（server ${serverName}）`,
          parameters: converted.schema,
          execute: async (_toolCallId, params, signal, _onUpdate, _ctx) => {
            const callId = `${tool.piName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const onAbort = (): void => {
              void uplink.post('/mcp/cancel', { sessionId, callId }).catch(() => {});
            };
            signal?.addEventListener('abort', onAbort);
            try {
              const result = (await uplink.post(
                '/mcp/call',
                { sessionId, server: serverName, tool: tool.name, args: params ?? {}, callId },
                DEFAULT_CALL_TIMEOUT_MS + CALL_SLACK_MS,
              )) as UplinkCallResult;
              if (result.isError) {
                const text = (result.content ?? [])
                  .filter((item) => item.type === 'text' && typeof item.text === 'string')
                  .map((item) => item.text)
                  .join('\n');
                throw new Error(text || 'MCP 工具调用失败');
              }
              return {
                content: result.content ?? [],
                details: {},
                ...(result.truncated === true ? { truncated: true } : {}),
              };
            } finally {
              signal?.removeEventListener('abort', onAbort);
            }
          },
        });
      }
    }
  };

  await register();
  uplink.on('mcp:changed', () => {
    void register();
  });
}
