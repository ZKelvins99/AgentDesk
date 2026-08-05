import ExcelJS from "exceljs"
import { writeFile, readFile, mkdir, rm } from "node:fs/promises"
import { join, resolve } from "node:path"
import { spawnSync } from "node:child_process"
import type { AgentDeskTool, ToolResult } from "./protocol.ts"
import { errResult, okResult } from "./protocol.ts"

function docRoot(workspace: string | undefined): string {
  return join(resolve(workspace ?? process.cwd()), ".agentdesk-docs")
}

function rowToArray(row: ExcelJS.Row): (string | number | boolean | null)[] {
  const out: (string | number | boolean | null)[] = []
  row.eachCell({ includeEmpty: true }, (cell) => {
    const v = cell.value
    if (v === null || v === undefined) out.push(null)
    else if (typeof v === "object" && "result" in v) out.push((v as { result: unknown }).result as string | number | boolean)
    else out.push(v as string | number | boolean)
  })
  return out
}

/** M15-T01: spreadsheet.create —— 二维数据 → XLSX */
export const spreadsheetCreateTool: AgentDeskTool = {
  id: "platform.spreadsheet.create",
  description: "根据表格数据创建 XLSX",
  inputSchema: { type: "object", properties: { title: { type: "string" }, rows: { type: "array" }, filename: { type: "string" } }, required: ["title"] },
  async execute(context, input): Promise<ToolResult> {
    if (!context.allowWrite) return errResult("permission: write not allowed")
    try {
      const rows = Array.isArray(input.rows) ? (input.rows as unknown[][]).map((r) => r.map(String)) : []
      const workbook = new ExcelJS.Workbook()
      const sheet = workbook.addWorksheet("Sheet1")
      for (const row of rows) sheet.addRow(row)
      const filename = String(input.filename ?? `${slug(String(input.title))}.xlsx`)
      const outPath = join(docRoot(context.workspacePath), filename)
      await mkdir(resolve(outPath, ".."), { recursive: true })
      await workbook.xlsx.writeFile(outPath)
      return okResult({ path: outPath, rows: rows.length, columns: rows[0]?.length ?? 0, mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
    } catch (error) {
      return errResult(error instanceof Error ? error.message : String(error))
    }
  },
}

/** M15-T02: spreadsheet.read —— 读取 XLSX 为二维数组（Preview 数据源） */
export const spreadsheetReadTool: AgentDeskTool = {
  id: "platform.spreadsheet.read",
  description: "读取 XLSX 表格数据（返回 rows）",
  inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
  async execute(context, input): Promise<ToolResult> {
    try {
      const filePath = resolve(context.workspacePath ?? process.cwd(), String(input.path))
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.readFile(filePath)
      const sheet = workbook.worksheets[0]
      const rows: (string | number | boolean | null)[][] = []
      sheet.eachRow((row) => rows.push(rowToArray(row)))
      return okResult({ sheet: sheet.name, rows, rowCount: rows.length, columnCount: rows[0]?.length ?? 0 })
    } catch (error) {
      return errResult(error instanceof Error ? error.message : String(error))
    }
  },
}

/** M15-T03: spreadsheet.set_cells —— 定点写单元格（支持坐标 A1 或 r/c） */
export const spreadsheetSetCellsTool: AgentDeskTool = {
  id: "platform.spreadsheet.set_cells",
  description: "在 XLSX 指定单元格写入值（cells: [{ ref, value }]）",
  inputSchema: { type: "object", properties: { path: { type: "string" }, cells: { type: "array" } }, required: ["path", "cells"] },
  async execute(context, input): Promise<ToolResult> {
    if (!context.allowWrite) return errResult("permission: write not allowed")
    try {
      const filePath = resolve(context.workspacePath ?? process.cwd(), String(input.path))
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.readFile(filePath)
      const sheet = workbook.worksheets[0]
      const cells = Array.isArray(input.cells) ? (input.cells as Array<{ ref?: string; row?: number; column?: number; value: unknown }>) : []
      for (const c of cells) {
        if (c.ref) sheet.getCell(String(c.ref)).value = c.value as ExcelJS.CellValue
        else if (c.row && c.column) sheet.getCell(Number(c.row), Number(c.column)).value = c.value as ExcelJS.CellValue
      }
      await workbook.xlsx.writeFile(filePath)
      return okResult({ path: filePath, updated: cells.length })
    } catch (error) {
      return errResult(error instanceof Error ? error.message : String(error))
    }
  },
}

/** M15-T04: spreadsheet.formula —— 写公式单元格（exceljs 保留公式） */
export const spreadsheetFormulaTool: AgentDeskTool = {
  id: "platform.spreadsheet.formula",
  description: "向 XLSX 写入公式（cells: [{ ref, formula }]）",
  inputSchema: { type: "object", properties: { path: { type: "string" }, cells: { type: "array" } }, required: ["path", "cells"] },
  async execute(context, input): Promise<ToolResult> {
    if (!context.allowWrite) return errResult("permission: write not allowed")
    try {
      const filePath = resolve(context.workspacePath ?? process.cwd(), String(input.path))
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.readFile(filePath)
      const sheet = workbook.worksheets[0]
      const cells = Array.isArray(input.cells) ? (input.cells as Array<{ ref: string; formula: string }>) : []
      for (const c of cells) {
        sheet.getCell(c.ref).value = { formula: c.formula }
      }
      await workbook.xlsx.writeFile(filePath)
      return okResult({ path: filePath, formulas: cells.map((c) => c.ref) })
    } catch (error) {
      return errResult(error instanceof Error ? error.message : String(error))
    }
  },
}

/** M15-T05: spreadsheet.format —— 表头加粗 + 填充 */
export const spreadsheetFormatTool: AgentDeskTool = {
  id: "platform.spreadsheet.format",
  description: "格式化 XLSX（表头加粗/填充色）",
  inputSchema: { type: "object", properties: { path: { type: "string" }, headerRow: { type: "number" } }, required: ["path"] },
  async execute(context, input): Promise<ToolResult> {
    if (!context.allowWrite) return errResult("permission: write not allowed")
    try {
      const filePath = resolve(context.workspacePath ?? process.cwd(), String(input.path))
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.readFile(filePath)
      const sheet = workbook.worksheets[0]
      const headerRow = Number(input.headerRow ?? 1)
      const row = sheet.getRow(headerRow)
      row.font = { bold: true, color: { argb: "FFFFFFFF" } }
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } }
      await workbook.xlsx.writeFile(filePath)
      return okResult({ path: filePath, headerRow })
    } catch (error) {
      return errResult(error instanceof Error ? error.message : String(error))
    }
  },
}

/** M15-T06: spreadsheet.chart —— 基于数据生成 SVG chart（Artifact 数据源） */
export const spreadsheetChartTool: AgentDeskTool = {
  id: "platform.spreadsheet.chart",
  description: "根据 XLSX 数据生成 SVG 柱状图",
  inputSchema: { type: "object", properties: { path: { type: "string" }, valueColumn: { type: "number" }, labelColumn: { type: "number" }, output: { type: "string" } }, required: ["path"] },
  async execute(context, input): Promise<ToolResult> {
    try {
      const filePath = resolve(context.workspacePath ?? process.cwd(), String(input.path))
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.readFile(filePath)
      const sheet = workbook.worksheets[0]
      const labelCol = Number(input.labelColumn ?? 1)
      const valueCol = Number(input.valueColumn ?? 2)
      const labels: string[] = []
      const values: number[] = []
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return // skip header
        const label = row.getCell(labelCol).text
        const value = Number(row.getCell(valueCol).value)
        if (label && Number.isFinite(value)) {
          labels.push(label)
          values.push(value)
        }
      })
      const svg = renderSvgBarChart(labels, values)
      const outPath = join(docRoot(context.workspacePath), String(input.output ?? `chart-${Date.now()}.svg`))
      await mkdir(resolve(outPath, ".."), { recursive: true })
      await writeFile(outPath, svg, "utf8")
      return okResult({ path: outPath, labels, values, mime: "image/svg+xml" })
    } catch (error) {
      return errResult(error instanceof Error ? error.message : String(error))
    }
  },
}

/** M15-T07: python.analyze —— Spreadsheet → Python → Dataset/Chart（pandas + matplotlib，隔离执行） */
export const spreadsheetAnalyzeTool: AgentDeskTool = {
  id: "platform.spreadsheet.analyze",
  description: "用 Python(pandas) 分析 XLSX 并生成 CSV 数据集 + PNG 图表",
  inputSchema: { type: "object", properties: { path: { type: "string" }, script: { type: "string" }, outputPrefix: { type: "string" } }, required: ["path"] },
  async execute(context, input): Promise<ToolResult> {
    try {
      const filePath = resolve(context.workspacePath ?? process.cwd(), String(input.path))
      const prefix = String(input.outputPrefix ?? "analysis")
      const outDir = docRoot(context.workspacePath)
      await mkdir(outDir, { recursive: true })
      const csvPath = join(outDir, `${prefix}.csv`)
      const pngPath = join(outDir, `${prefix}.png`)
      const defaultScript = [
        "import pandas as pd",
        "import matplotlib",
        "matplotlib.use('Agg')",
        "import matplotlib.pyplot as plt",
        `df = pd.read_excel(r"${filePath}")`,
        `df.to_csv(r"${csvPath}", index=False)`,
        "numeric = df.select_dtypes(include='number')",
        "if len(numeric.columns) > 0:",
        "    numeric.plot(kind='bar')",
        `    plt.savefig(r"${pngPath}", bbox_inches='tight')`,
        `print("ROWS", len(df), "COLS", len(df.columns))`,
        "print(df.head().to_string())",
      ].join("\n")
      const script = String(input.script ?? defaultScript)
      const scriptPath = join(outDir, `analyze_${Date.now()}.py`)
      await writeFile(scriptPath, script, "utf8")
      const result = runPythonScript(scriptPath, resolve(context.workspacePath ?? process.cwd()))
      await rm(scriptPath, { force: true })
      return okResult({ stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode, csvPath, pngPath })
    } catch (error) {
      return errResult(error instanceof Error ? error.message : String(error))
    }
  },
}

function runPythonScript(script: string, cwd: string): { stdout: string; stderr: string; exitCode: number } {
  const python = resolvePython()
  if (!python) return { stdout: "", stderr: "python not found", exitCode: -1 }
  const result = spawnSync(python, [script], { cwd, encoding: "utf8", timeout: 60000, windowsHide: true })
  return { stdout: result.stdout ?? "", stderr: result.stderr ?? "", exitCode: result.status ?? -1 }
}

function resolvePython(): string | undefined {
  const candidates = [process.env.PYTHON, process.env.PYTHON_EXE, "python", "python3"].filter((c): c is string => Boolean(c))
  for (const candidate of candidates) {
    try {
      const out = spawnSync(candidate, ["--version"], { encoding: "utf8", timeout: 5000, windowsHide: true })
      if (/Python \d+\.\d+/.test(out.stdout ?? "")) return candidate
    } catch { /* next */ }
  }
  try {
    const uv = spawnSync("uv", ["python", "find"], { encoding: "utf8", timeout: 10000, windowsHide: true })
    if (uv.stdout?.trim()) return uv.stdout.trim()
  } catch { /* no uv */ }
  return undefined
}

function renderSvgBarChart(labels: string[], values: number[]): string {
  const width = 600
  const height = 300
  const max = Math.max(...values, 1)
  const barWidth = Math.max(20, Math.floor(width / Math.max(labels.length, 1)) - 20)
  const bars = values
    .map((v, i) => {
      const x = i * (width / Math.max(values.length, 1)) + 10
      const h = (v / max) * (height - 60)
      const y = height - 40 - h
      return `<rect x="${x}" y="${y}" width="${barWidth}" height="${h}" fill="#3b82f6"/><text x="${x + barWidth / 2}" y="${height - 20}" font-size="10" text-anchor="middle" fill="#e6e6e6">${escapeXml(labels[i] ?? "")}</text><text x="${x + barWidth / 2}" y="${y - 4}" font-size="10" text-anchor="middle" fill="#9ca3af">${v}</text>`
    })
    .join("")
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${bars}</svg>`
}

function escapeXml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c] as string))
}

function slug(title: string): string {
  return title.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-+|-+$/g, "") || "sheet"
}
