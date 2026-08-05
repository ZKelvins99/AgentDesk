import { readFile, writeFile, readdir, stat, mkdir } from "node:fs/promises"
import { join, resolve, sep } from "node:path"
import type { AgentDeskTool } from "./protocol.ts"
import { errResult, okResult } from "./protocol.ts"

/** 限制工具读写范围：仅允许 workspace 内路径 */
function resolveWithin(root: string | undefined, target: string): { path?: string; error?: string } {
  const base = resolve(root ?? process.cwd())
  const candidate = resolve(base, target)
  if (candidate !== base && !candidate.startsWith(base + sep)) {
    return { error: `path outside workspace: ${target}` }
  }
  return { path: candidate }
}

/** M13-T03: platform.file.read */
export const fileReadTool: AgentDeskTool = {
  id: "platform.file.read",
  description: "读取工作区内文件内容",
  inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
  async execute(context, input) {
    const resolved = resolveWithin(context.workspacePath, String(input.path ?? ""))
    if (resolved.error) return errResult(resolved.error)
    try {
      const text = await readFile(resolved.path!, "utf8")
      return okResult({ text })
    } catch (error) {
      return errResult(error instanceof Error ? error.message : String(error))
    }
  },
}

/** M13-T03: platform.file.write */
export const fileWriteTool: AgentDeskTool = {
  id: "platform.file.write",
  description: "写入工作区内文件（允许写操作）",
  inputSchema: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] },
  async execute(context, input) {
    if (!context.allowWrite) return errResult("permission: write not allowed")
    const resolved = resolveWithin(context.workspacePath, String(input.path ?? ""))
    if (resolved.error) return errResult(resolved.error)
    try {
      await mkdir(resolve(resolved.path!, ".."), { recursive: true })
      await writeFile(resolved.path!, String(input.content ?? ""), "utf8")
      return okResult({ written: resolved.path })
    } catch (error) {
      return errResult(error instanceof Error ? error.message : String(error))
    }
  },
}

/** M13-T03: platform.file.list */
export const fileListTool: AgentDeskTool = {
  id: "platform.file.list",
  description: "列出工作区内目录条目",
  inputSchema: { type: "object", properties: { path: { type: "string" } } },
  async execute(context, input) {
    const resolved = resolveWithin(context.workspacePath, String(input.path ?? "."))
    if (resolved.error) return errResult(resolved.error)
    try {
      const entries = await readdir(resolved.path!, { withFileTypes: true })
      const out = entries.map((e) => ({ name: e.name, type: e.isDirectory() ? "directory" : "file" }))
      return okResult({ entries: out })
    } catch (error) {
      return errResult(error instanceof Error ? error.message : String(error))
    }
  },
}

/** 额外元数据工具（M13 扩展）：file.stat */
export const fileStatTool: AgentDeskTool = {
  id: "platform.file.stat",
  description: "查看工作区内文件元信息",
  inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
  async execute(context, input) {
    const resolved = resolveWithin(context.workspacePath, String(input.path ?? ""))
    if (resolved.error) return errResult(resolved.error)
    try {
      const s = await stat(resolved.path!)
      return okResult({ size: s.size, isDirectory: s.isDirectory(), isFile: s.isFile(), mtime: s.mtime.toISOString() })
    } catch (error) {
      return errResult(error instanceof Error ? error.message : String(error))
    }
  },
}
