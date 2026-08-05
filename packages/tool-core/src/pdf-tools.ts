import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import type { AgentDeskTool, ToolResult } from "./protocol.ts"
import { errResult, okResult } from "./protocol.ts"

/** M14-T07: pdf.read —— 提取 PDF 文本与页数 */
export const pdfReadTool: AgentDeskTool = {
  id: "platform.pdf.read",
  description: "读取 PDF 文本内容与元信息",
  inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
  async execute(context, input): Promise<ToolResult> {
    try {
      const filePath = resolve(context.workspacePath ?? process.cwd(), String(input.path))
      const data = new Uint8Array(await readFile(filePath))
      const pdf = await getDocument({ data }).promise
      const pages: string[] = []
      const maxPages = Number(input.maxPages ?? 10)
      for (let i = 1; i <= Math.min(pdf.numPages, maxPages); i++) {
        const page = await pdf.getPage(i)
        const content = await page.getTextContent()
        pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "))
      }
      return okResult({ numPages: pdf.numPages, pages, text: pages.join("\n").slice(0, 20000) })
    } catch (error) {
      return errResult(error instanceof Error ? error.message : String(error))
    }
  },
}

/** M14-T08: pdf.meta —— 读取 PDF 元信息（渲染 Preview 用） */
export const pdfMetaTool: AgentDeskTool = {
  id: "platform.pdf.meta",
  description: "读取 PDF 页数与元数据",
  inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
  async execute(context, input): Promise<ToolResult> {
    try {
      const filePath = resolve(context.workspacePath ?? process.cwd(), String(input.path))
      const data = new Uint8Array(await readFile(filePath))
      const pdf = await getDocument({ data }).promise
      const metadata = await pdf.getMetadata()
      const info = (metadata?.info ?? {}) as { Title?: string }
      return okResult({
        numPages: pdf.numPages,
        title: info.Title,
      })
    } catch (error) {
      return errResult(error instanceof Error ? error.message : String(error))
    }
  },
}
