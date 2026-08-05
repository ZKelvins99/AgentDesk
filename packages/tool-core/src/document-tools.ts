import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType } from "docx"
import mammoth from "mammoth"
import { writeFile, mkdir, readFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import type { AgentDeskTool, ToolResult } from "./protocol.ts"
import { errResult, okResult } from "./protocol.ts"

export interface StructuredDocument {
  readonly title: string
  readonly paragraphs: ReadonlyArray<string>
  readonly table?: ReadonlyArray<ReadonlyArray<string>>
}

/** 结构化内容 → DOCX buffer（M14-T02/T06） */
export async function buildDocxBuffer(doc: StructuredDocument): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [
    new Paragraph({ text: doc.title, heading: HeadingLevel.HEADING_1 }),
  ]
  for (const p of doc.paragraphs) {
    children.push(new Paragraph({ children: [new TextRun(p)] }))
  }
  if (doc.table && doc.table.length > 0) {
    const rows = doc.table.map(
      (row) =>
        new TableRow({
          children: row.map(
            (cell) =>
              new TableCell({
                width: { size: 100 / row.length, type: WidthType.PERCENTAGE },
                children: [new Paragraph({ children: [new TextRun(cell)] })],
              }),
          ),
        }),
    )
    children.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }))
  }
  const document = new Document({ sections: [{ children }] })
  return Buffer.from(await Packer.toBuffer(document))
}

function structuredFromInput(input: Record<string, unknown>): StructuredDocument {
  return {
    title: String(input.title ?? "Untitled"),
    paragraphs: Array.isArray(input.paragraphs)
      ? (input.paragraphs as unknown[]).map(String)
      : [],
    table: Array.isArray(input.table)
      ? (input.table as unknown[][]).map((row) => row.map(String))
      : undefined,
  }
}

function resolveOut(root: string | undefined, name: string): { path: string; error?: string } {
  const base = resolve(root ?? process.cwd())
  const outDir = join(base, ".agentdesk-docs")
  return { path: join(outDir, name) }
}

/** M14-T02/T06: document.create —— 结构化内容生成 DOCX（+ 并存 markdown 源） */
export const documentCreateTool: AgentDeskTool = {
  id: "platform.document.create",
  description: "根据结构化内容生成 DOCX 文档（title/paragraphs/table）",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string" },
      paragraphs: { type: "array", items: { type: "string" } },
      table: { type: "array" },
      filename: { type: "string" },
    },
    required: ["title"],
  },
  async execute(context, input): Promise<ToolResult> {
    if (!context.allowWrite) return errResult("permission: write not allowed")
    try {
      const doc = structuredFromInput(input)
      const filename = String(input.filename ?? `${slug(doc.title)}.docx`)
      const resolved = resolveOut(context.workspacePath, filename)
      await mkdir(resolve(resolved.path, ".."), { recursive: true })
      const buffer = await buildDocxBuffer(doc)
      await writeFile(resolved.path, buffer)
      // 并存 markdown 源（预览友好）
      const mdPath = resolved.path.replace(/\.docx$/, ".md")
      await writeFile(mdPath, mdFromDoc(doc), "utf8")
      return okResult({ path: resolved.path, mdPath, sizeBytes: buffer.length, mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })
    } catch (error) {
      return errResult(error instanceof Error ? error.message : String(error))
    }
  },
}

/** M14-T03: document.read —— 读取 DOCX 结构（mammoth 提取文本） */
export const documentReadTool: AgentDeskTool = {
  id: "platform.document.read",
  description: "读取 DOCX 文档文本内容",
  inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
  async execute(context, input): Promise<ToolResult> {
    try {
      const filePath = resolve(context.workspacePath ?? process.cwd(), String(input.path))
      const buffer = await readFile(filePath)
      const result = await mammoth.extractRawText({ buffer })
      return okResult({ text: result.value, paragraphs: result.value.split(/\n+/).filter(Boolean) })
    } catch (error) {
      return errResult(error instanceof Error ? error.message : String(error))
    }
  },
}

/** M14-T04: document.edit —— 定点替换段落后重新生成 DOCX */
export const documentEditTool: AgentDeskTool = {
  id: "platform.document.edit",
  description: "对 DOCX 执行文本替换后生成新文件",
  inputSchema: {
    type: "object",
    properties: { path: { type: "string" }, search: { type: "string" }, replace: { type: "string" }, output: { type: "string" } },
    required: ["path", "search", "replace"],
  },
  async execute(context, input): Promise<ToolResult> {
    if (!context.allowWrite) return errResult("permission: write not allowed")
    try {
      const base = resolve(context.workspacePath ?? process.cwd())
      const filePath = resolve(base, String(input.path))
      const read = await documentReadTool.execute(context, { path: String(input.path) })
      if (!read.ok) return read
      const text = String((read.output as { text: string }).text)
      const search = String(input.search)
      const replace = String(input.replace)
      const edited = text.split(search).join(replace)
      const outputName = String(input.output ?? `edited-${Date.now()}.docx`)
      const outPath = join(base, ".agentdesk-docs", outputName)
      await mkdir(resolve(outPath, ".."), { recursive: true })
      const doc: StructuredDocument = { title: "Edited Document", paragraphs: edited.split(/\n+/).filter(Boolean) }
      await writeFile(outPath, await buildDocxBuffer(doc))
      return okResult({ path: outPath, replaced: text !== edited })
    } catch (error) {
      return errResult(error instanceof Error ? error.message : String(error))
    }
  },
}

/** M14-T05: document.render —— 生成 HTML 预览 */
export const documentRenderTool: AgentDeskTool = {
  id: "platform.document.render",
  description: "将 DOCX 渲染为 HTML 预览",
  inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
  async execute(context, input): Promise<ToolResult> {
    try {
      const filePath = resolve(context.workspacePath ?? process.cwd(), String(input.path))
      const buffer = await readFile(filePath)
      const result = await mammoth.convertToHtml({ buffer })
      return okResult({ html: result.value })
    } catch (error) {
      return errResult(error instanceof Error ? error.message : String(error))
    }
  },
}

function slug(title: string): string {
  return title.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-+|-+$/g, "") || "document"
}

function mdFromDoc(doc: StructuredDocument): string {
  const lines = [`# ${doc.title}`, ""]
  for (const p of doc.paragraphs) lines.push(p, "")
  if (doc.table && doc.table.length > 0) {
    const header = doc.table[0]
    lines.push(`| ${header.join(" | ")} |`, `| ${header.map(() => "---").join(" | ")} |`)
    for (const row of doc.table.slice(1)) lines.push(`| ${row.join(" | ")} |`)
  }
  return lines.join("\n")
}
