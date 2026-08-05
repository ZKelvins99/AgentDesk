/** M08-T06: Runtime 扩展兼容等级 */
export type ExtensionCompatibilityLevel = "FULL" | "PARTIAL" | "TUI_ONLY" | "UNSUPPORTED"

/** M08-T07: 单个扩展的兼容状态视图 */
export interface ExtensionCompatibilityView {
  readonly name: string
  readonly source: "extension" | "package" | "builtin"
  readonly level: ExtensionCompatibilityLevel
  readonly supportedMethods: readonly string[]
  readonly reason?: string
}
