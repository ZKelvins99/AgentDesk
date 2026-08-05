/** M13-T01: AgentDeskTool 协议 */
export interface ToolExecutionContext {
  readonly sessionId?: string
  readonly workspacePath?: string
  /** 是否允许非只读操作（由 Permission Core 注入） */
  readonly allowWrite?: boolean
  readonly [key: string]: unknown
}

export interface ToolResult {
  readonly ok: boolean
  readonly output?: unknown
  readonly error?: string
}

export interface AgentDeskTool<TSchema = unknown> {
  readonly id: string
  readonly description: string
  readonly inputSchema: TSchema
  readonly permissions?: readonly string[]
  execute(context: ToolExecutionContext, input: Record<string, unknown>): Promise<ToolResult>
}

/** 工具结果辅助 */
export function okResult(output: unknown): ToolResult {
  return { ok: true, output }
}

export function errResult(error: string): ToolResult {
  return { ok: false, error }
}
