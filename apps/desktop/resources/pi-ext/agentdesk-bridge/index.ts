/**
 * AgentDesk Bridge Extension（README 8.2）：注入 pi 进程的"代理人"。
 * M5 落地权限拦截：tool_call → uplink → 主进程 ApprovalEngine → block/reason。
 * M6 落地 MCP 工具注入：uplink GET /mcp/tools → registerTool；POST /mcp/call 转发调用。
 * 模块：uplink（HTTP loopback 控制通道）/ approval（权限拦截）/ mcp-tools（MCP 注入）。
 */

import { decideApproval } from './approval';
import { registerMcpTools } from './mcp-tools';
import { createUplink, type Uplink } from './uplink';

interface ToolCallEvent {
  toolName?: string;
  toolCallId?: string;
  input?: unknown;
}

interface ToolCallContext {
  cwd?: string;
}

export default async function agentdeskBridge(pi: {
  on: (event: string, handler: (event: unknown, ctx: unknown) => unknown) => void;
  registerTool: (tool: unknown) => void;
}): Promise<void> {
  const uplink: Uplink | null = createUplink(
    process.env.AGENTDESK_UPLINK,
    process.env.AGENTDESK_TOKEN,
  );
  const sessionId = process.env.AGENTDESK_SESSION_ID ?? 'unknown';

  pi.on('tool_call', async (event: ToolCallEvent, ctx: ToolCallContext): Promise<unknown> => {
    if (!event.toolName) return undefined;
    return decideApproval(
      {
        toolName: event.toolName,
        toolCallId: event.toolCallId ?? '',
        input: event.input,
      },
      ctx?.cwd ?? process.cwd(),
      sessionId,
      uplink,
    );
  });

  await registerMcpTools(pi, uplink, sessionId).catch((error: unknown) => {
    console.warn(`[agentdesk] MCP 工具注册失败（降级为空工具集）：${(error as Error).message}`);
  });

  // 资源生效清单上报（README 8.2.3）：Skill/Extension 的“真实生效清单”只有 pi 自己知道，
  // resources_discover 是 AgentDesk 管理界面的权威来源（G7 场景 7 验收）。
  pi.on('resources_discover', (event: unknown) => {
    void uplink
      ?.post('/state/resources', {
        ...(event && typeof event === 'object' ? event : {}),
        sessionId,
      })
      .catch(() => {});
  });

  pi.on('session_shutdown', () => {
    uplink?.close();
  });
}
