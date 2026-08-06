/**
 * MCP 工具命名（README 8.3.3）：pi 侧工具名 `mcp__<serverId>__<toolName>`。
 * 非法字符（非 [a-zA-Z0-9_]）替换为 `_`；整名超过 64 字符时截断并追加 4 位哈希。
 */

export const PI_TOOL_NAME_MAX = 64;

const MCP_SEGMENT_RE = /[^a-zA-Z0-9_]/g;

/** FNV-1a 32 位哈希 → 4 位十六进制（确定性短哈希，用于超长名截断）。 */
export function shortHash4(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0').slice(0, 4);
}

/** 名称非法字符（非 [a-zA-Z0-9_]）替换为 `_`。 */
export function sanitizeMcpSegment(segment: string): string {
  return segment.replace(MCP_SEGMENT_RE, '_');
}

/** 生成 pi 侧工具名，整名不超过 PI_TOOL_NAME_MAX。 */
export function toPiToolName(serverId: string, toolName: string): string {
  const sid = sanitizeMcpSegment(serverId);
  const tool = sanitizeMcpSegment(toolName);
  const base = `mcp__${sid}__${tool}`;
  if (base.length <= PI_TOOL_NAME_MAX) return base;
  const prefix = `mcp__${sid}__`;
  const hash = shortHash4(tool);
  const room = PI_TOOL_NAME_MAX - prefix.length - 1 - hash.length;
  return `${prefix}${tool.slice(0, Math.max(0, room))}_${hash}`;
}
