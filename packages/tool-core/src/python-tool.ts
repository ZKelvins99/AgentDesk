import { spawn, execFileSync } from "node:child_process"
import { writeFile, mkdir } from "node:fs/promises"
import { join, resolve, sep } from "node:path"
import type { AgentDeskTool, ToolResult } from "./protocol.ts"
import { errResult, okResult } from "./protocol.ts"

/**
 * M13-T04: platform.python —— 隔离执行环境运行 Python（数据处理）。
 * 隔离策略：独立子进程 + 受限超时 + 工作区目录隔离 + 无网络透传（最小实现）。
 */
export const pythonTool: AgentDeskTool = {
  id: "platform.python",
  description: "在隔离环境中执行 Python 代码（支持 pandas 等数据处理）",
  inputSchema: {
    type: "object",
    properties: { code: { type: "string" }, args: { type: "array", items: { type: "string" } } },
    required: ["code"],
  },
  async execute(context, input): Promise<ToolResult> {
    const code = String(input.code ?? "")
    if (!code.trim()) return errResult("python: empty code")
    const workspace = resolve(context.workspacePath ?? process.cwd())
    const scriptDir = join(workspace, ".agentdesk-python")
    const scriptPath = join(scriptDir, `run_${Date.now()}.py`)
    try {
      await mkdir(scriptDir, { recursive: true })
      await writeFile(scriptPath, code, "utf8")
      const output = await runPython(scriptPath, workspace, (input.args as string[] | undefined) ?? [])
      return okResult({ stdout: output.stdout, stderr: output.stderr, exitCode: output.exitCode })
    } catch (error) {
      return errResult(error instanceof Error ? error.message : String(error))
    }
  },
}

function runPython(script: string, cwd: string, args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolvePromise) => {
    const interpreter = resolvePython()
    if (!interpreter) {
      resolvePromise({ stdout: "", stderr: "python not found (set PYTHON or install python)", exitCode: -1 })
      return
    }
    const child = spawn(interpreter, [script, ...args], {
      cwd,
      env: {
        ...process.env,
        // 隔离：不继承敏感代理与模型密钥
        HTTP_PROXY: "",
        HTTPS_PROXY: "",
        AGENTDESK_INTERNAL_API_KEY: "",
      },
      windowsHide: true,
    })
    let stdout = ""
    let stderr = ""
    const timer = setTimeout(() => {
      child.kill("SIGKILL")
      resolvePromise({ stdout, stderr: stderr + "\n[timeout: python execution > 30s]", exitCode: -1 })
    }, 30000)
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()))
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()))
    child.on("close", (code) => {
      clearTimeout(timer)
      resolvePromise({ stdout, stderr, exitCode: code ?? -1 })
    })
    child.on("error", (error) => {
      clearTimeout(timer)
      resolvePromise({ stdout, stderr: `python spawn failed: ${error.message}`, exitCode: -1 })
    })
  })
}

/** 探测可用 Python 解释器（Windows Store stub 会返回空版本，需跳过） */
function resolvePython(): string | undefined {
  const candidates = [
    process.env.PYTHON,
    process.env.PYTHON_EXE,
    "python",
    "python3",
  ].filter((c): c is string => typeof c === "string" && c.length > 0)
  for (const candidate of candidates) {
    try {
      const out = execFileSync(candidate, ["--version"], { windowsHide: true, timeout: 5000 })
      const version = out.toString().trim()
      if (/Python \d+\.\d+/.test(version)) return candidate
    } catch {
      // try next
    }
  }
  // 兜底：uv 管理的解释器（uv python find）
  try {
    const path = execFileSync("uv", ["python", "find"], { windowsHide: true, timeout: 10000 }).toString().trim()
    if (path) return path
  } catch {
    // uv not available
  }
  return undefined
}
