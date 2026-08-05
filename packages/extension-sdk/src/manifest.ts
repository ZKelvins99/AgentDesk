/** M21-T02: Extension Manifest（extension.json / package.json extension 字段） */
export interface ExtensionManifest {
  readonly id: string
  readonly name: string
  readonly version: string
  readonly description?: string
  /** M21-T04: 第三方扩展声明权限 */
  readonly permissions?: readonly ExtensionPermission[]
  /** 入口文件（相对扩展根） */
  readonly entry: string
  readonly enabled?: boolean
}

/** M21-T04: 扩展权限声明 */
export type ExtensionPermission = "filesystem" | "network" | "shell" | "runtime" | "ui"

export const ALL_PERMISSIONS: readonly ExtensionPermission[] = [
  "filesystem",
  "network",
  "shell",
  "runtime",
  "ui",
]
