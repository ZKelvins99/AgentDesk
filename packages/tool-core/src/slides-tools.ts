import { writeFile, mkdir } from "node:fs/promises"
import { join, resolve } from "node:path"
import { createRequire } from "node:module"
import type { AgentDeskTool, ToolResult } from "./protocol.ts"
import { errResult, okResult } from "./protocol.ts"

interface DeckEntry {
  readonly deckId: string
  readonly createdAt: string
  slides: Array<{ title: string; bullets: string[]; table?: string[][] }>
}

const decks = new Map<string, DeckEntry>()
const require = createRequire(import.meta.url)
type PptxGenCtor = new () => {
  addSlide(): {
    addText(text: unknown, opts?: Record<string, unknown>): void
    addTable(rows: unknown[][], opts?: Record<string, unknown>): void
  }
  writeFile(opts: { fileName: string }): Promise<unknown>
}

function docRoot(workspace: string | undefined): string {
  return join(resolve(workspace ?? process.cwd()), ".agentdesk-docs")
}

function newDeckId(): string {
  return `deck_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/** M16-T01: slides.create —— 创建演示文稿（含可选标题页） */
export const slidesCreateTool: AgentDeskTool = {
  id: "platform.slides.create",
  description: "创建演示文稿，返回 deckId（后续操作引用）",
  inputSchema: { type: "object", properties: { title: { type: "string" } } },
  async execute(_context, input): Promise<ToolResult> {
    const deckId = newDeckId()
    const entry: DeckEntry = {
      deckId,
      createdAt: new Date().toISOString(),
      slides: [{ title: String(input.title ?? "未命名演示"), bullets: [] }],
    }
    decks.set(deckId, entry)
    return okResult({ deckId, slides: entry.slides.length })
  },
}

/** M16-T02: slides.add_slide —— 追加一页（标题 + 要点 + 可选表格） */
export const slidesAddSlideTool: AgentDeskTool = {
  id: "platform.slides.add_slide",
  description: "向演示文稿追加一页（title/bullets/table）",
  inputSchema: { type: "object", properties: { deckId: { type: "string" }, title: { type: "string" }, bullets: { type: "array" }, table: { type: "array" } }, required: ["deckId", "title"] },
  async execute(_context, input): Promise<ToolResult> {
    const deck = decks.get(String(input.deckId ?? ""))
    if (!deck) return errResult("slides: unknown deckId")
    deck.slides.push({
      title: String(input.title ?? ""),
      bullets: Array.isArray(input.bullets) ? (input.bullets as unknown[]).map(String) : [],
      table: Array.isArray(input.table) ? (input.table as unknown[][]).map((r) => r.map(String)) : undefined,
    })
    return okResult({ deckId: deck.deckId, slideIndex: deck.slides.length - 1, totalSlides: deck.slides.length })
  },
}

/** M16-T03: slides.update_slide —— 更新指定页标题/要点 */
export const slidesUpdateSlideTool: AgentDeskTool = {
  id: "platform.slides.update_slide",
  description: "更新指定 slideIndex 的标题/要点",
  inputSchema: { type: "object", properties: { deckId: { type: "string" }, slideIndex: { type: "number" }, title: { type: "string" }, bullets: { type: "array" } }, required: ["deckId", "slideIndex"] },
  async execute(_context, input): Promise<ToolResult> {
    const deck = decks.get(String(input.deckId ?? ""))
    if (!deck) return errResult("slides: unknown deckId")
    const index = Number(input.slideIndex)
    const slide = deck.slides[index]
    if (!slide) return errResult(`slides: slideIndex ${index} out of range`)
    if (input.title !== undefined) slide.title = String(input.title)
    if (input.bullets !== undefined) slide.bullets = (input.bullets as unknown[]).map(String)
    return okResult({ deckId: deck.deckId, slideIndex: index, updated: true })
  },
}

/** M16-T04: slides.delete_slide —— 删除指定页 */
export const slidesDeleteSlideTool: AgentDeskTool = {
  id: "platform.slides.delete_slide",
  description: "删除指定 slideIndex 的页面",
  inputSchema: { type: "object", properties: { deckId: { type: "string" }, slideIndex: { type: "number" } }, required: ["deckId", "slideIndex"] },
  async execute(_context, input): Promise<ToolResult> {
    const deck = decks.get(String(input.deckId ?? ""))
    if (!deck) return errResult("slides: unknown deckId")
    const index = Number(input.slideIndex)
    if (index < 0 || index >= deck.slides.length) return errResult(`slides: slideIndex ${index} out of range`)
    deck.slides.splice(index, 1)
    return okResult({ deckId: deck.deckId, deletedIndex: index, totalSlides: deck.slides.length })
  },
}

/** M16-T05/T06: slides.render —— 导出 PPTX + 生成 SVG 页面预览 */
export const slidesRenderTool: AgentDeskTool = {
  id: "platform.slides.render",
  description: "将演示文稿导出为 PPTX（含每页 SVG 预览）",
  inputSchema: { type: "object", properties: { deckId: { type: "string" }, filename: { type: "string" } }, required: ["deckId"] },
  async execute(context, input): Promise<ToolResult> {
    if (!context.allowWrite) return errResult("permission: write not allowed")
    const deck = decks.get(String(input.deckId ?? ""))
    if (!deck) return errResult("slides: unknown deckId")
    try {
      const PptxGenJS = require("pptxgenjs") as PptxGenCtor
      const pptx = new PptxGenJS()
      for (const slide of deck.slides) {
        const s = pptx.addSlide()
        s.addText(slide.title, { x: 0.5, y: 0.4, w: 9, h: 0.8, fontSize: 24, bold: true })
        if (slide.bullets.length > 0) {
          s.addText(slide.bullets.map((b) => ({ text: b, options: { bullet: true } })), { x: 0.7, y: 1.4, w: 8.6, h: 4 })
        }
        if (slide.table && slide.table.length > 0) {
          s.addTable(slide.table.map((row) => row.map((cell) => ({ text: cell }))), { x: 0.7, y: 4.2, w: 8.6 })
        }
      }
      const filename = String(input.filename ?? `deck-${deck.deckId}.pptx`)
      const outPath = join(docRoot(context.workspacePath), filename)
      await mkdir(resolve(outPath, ".."), { recursive: true })
      await pptx.writeFile({ fileName: outPath })
      const preview = renderSvgPreview(deck)
      const svgPath = outPath.replace(/\.pptx$/, ".svg")
      await writeFile(svgPath, preview, "utf8")
      return okResult({
        path: outPath,
        svgPath,
        slideCount: deck.slides.length,
        mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      })
    } catch (error) {
      return errResult(error instanceof Error ? error.message : String(error))
    }
  },
}

function renderSvgPreview(deck: DeckEntry): string {
  const per = deck.slides.map((slide, i) => {
    const lines = [`<text x="16" y="24" font-size="13" font-weight="bold" fill="#e6e6e6">${escapeXml(slide.title)}</text>`]
    let y = 46
    for (const b of slide.bullets.slice(0, 6)) {
      lines.push(`<text x="20" y="${y}" font-size="11" fill="#c4c8d0">• ${escapeXml(b.slice(0, 60))}</text>`)
      y += 16
    }
    return `<g transform="translate(${(i % 2) * 290}, ${Math.floor(i / 2) * 180})"><rect x="10" y="10" width="270" height="160" rx="6" fill="#1a1c22" stroke="#26282f"/><text x="14" y="24" font-size="9" fill="#6b7280">#${i + 1}</text>${lines.join("")}</g>`
  })
  const cols = Math.min(2, Math.max(1, deck.slides.length))
  const rows = Math.ceil(deck.slides.length / cols)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * 290}" height="${rows * 180}">${per.join("")}</svg>`
}

function escapeXml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c] as string))
}
