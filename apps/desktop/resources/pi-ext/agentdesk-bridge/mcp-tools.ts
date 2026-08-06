/**
 * MCP 工具注册（M6 落地）：通过 uplink GET /mcp/tools 拉取清单并 pi.registerTool。
 * M5 阶段仅预留骨架：不注册任何工具，保持零副作用。
 */
export async function registerMcpTools(): Promise<void> {
  // M6：实现 MCP 工具注入（README 8.3）
}
