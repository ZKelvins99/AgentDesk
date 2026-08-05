/** M18-T01: AgentDefinition —— 把 Runtime 与 Agent 概念彻底分开 */
export interface AgentDefinition {
  readonly id: string
  readonly name: string
  readonly runtimeId: string
  readonly description?: string
  readonly requiredCapabilities?: readonly string[]
  readonly systemPrompt?: string
  readonly skills?: readonly string[]
  /** native runtime agent 引用（可选） */
  readonly nativeRef?: string
}
