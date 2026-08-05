/**
 * M15 契约测试：spreadsheet.create/read/set_cells/formula/format/chart + python analyze。
 */
import assert from "node:assert/strict"
import { test } from "node:test"
import { tmpdir } from "node:os"
import { mkdtempSync, rmSync, existsSync } from "node:fs"
import { join } from "node:path"
import {
  ToolRegistry,
  spreadsheetCreateTool,
  spreadsheetReadTool,
  spreadsheetSetCellsTool,
  spreadsheetFormulaTool,
  spreadsheetFormatTool,
  spreadsheetChartTool,
  spreadsheetAnalyzeTool,
} from "../src/index.ts"

test("M15-T01/T02: spreadsheet.create + read", async () => {
  const ws = mkdtempSync(join(tmpdir(), "m15-"))
  const registry = new ToolRegistry()
  registry.register(spreadsheetCreateTool)
  registry.register(spreadsheetReadTool)
  const created = await registry.execute(
    "platform.spreadsheet.create",
    { workspacePath: ws, allowWrite: true },
    { title: "Sales", rows: [["Q", "Amount"], ["Q1", "100"], ["Q2", "150"]] },
  )
  assert.equal(created.ok, true)
  const rel = ".agentdesk-docs/sales.xlsx"
  const read = await registry.execute("platform.spreadsheet.read", { workspacePath: ws }, { path: rel })
  assert.equal(read.ok, true)
  if (read.ok) {
    const rows = (read.output as { rows: unknown[][] }).rows
    assert.equal(rows.length, 3)
    assert.deepEqual(rows[1], ["Q1", "100"])
  }
  rmSync(ws, { recursive: true, force: true })
})

test("M15-T03: spreadsheet.set_cells", async () => {
  const ws = mkdtempSync(join(tmpdir(), "m15c-"))
  const registry = new ToolRegistry()
  registry.register(spreadsheetCreateTool)
  registry.register(spreadsheetSetCellsTool)
  registry.register(spreadsheetReadTool)
  await registry.execute("platform.spreadsheet.create", { workspacePath: ws, allowWrite: true }, { title: "S", rows: [["a", "b"]] })
  const set = await registry.execute(
    "platform.spreadsheet.set_cells",
    { workspacePath: ws, allowWrite: true },
    { path: ".agentdesk-docs/s.xlsx", cells: [{ ref: "B2", value: 42 }] },
  )
  assert.equal(set.ok, true)
  const read = await registry.execute("platform.spreadsheet.read", { workspacePath: ws }, { path: ".agentdesk-docs/s.xlsx" })
  assert.deepEqual((read.output as { rows: unknown[][] }).rows[1][1], 42)
  rmSync(ws, { recursive: true, force: true })
})

test("M15-T04: spreadsheet.formula 保留公式", async () => {
  const ws = mkdtempSync(join(tmpdir(), "m15f-"))
  const registry = new ToolRegistry()
  registry.register(spreadsheetCreateTool)
  registry.register(spreadsheetFormulaTool)
  await registry.execute("platform.spreadsheet.create", { workspacePath: ws, allowWrite: true }, { title: "F", rows: [[1, 2, 3]] })
  const f = await registry.execute(
    "platform.spreadsheet.formula",
    { workspacePath: ws, allowWrite: true },
    { path: ".agentdesk-docs/f.xlsx", cells: [{ ref: "D1", formula: "SUM(A1:C1)" }] },
  )
  assert.equal(f.ok, true)
  assert.deepEqual((f.output as { formulas: string[] }).formulas, ["D1"])
  rmSync(ws, { recursive: true, force: true })
})

test("M15-T05: spreadsheet.format 表头", async () => {
  const ws = mkdtempSync(join(tmpdir(), "m15g-"))
  const registry = new ToolRegistry()
  registry.register(spreadsheetCreateTool)
  registry.register(spreadsheetFormatTool)
  await registry.execute("platform.spreadsheet.create", { workspacePath: ws, allowWrite: true }, { title: "Fmt", rows: [["H1", "H2"], ["1", "2"]] })
  const f = await registry.execute("platform.spreadsheet.format", { workspacePath: ws, allowWrite: true }, { path: ".agentdesk-docs/fmt.xlsx", headerRow: 1 })
  assert.equal(f.ok, true)
  rmSync(ws, { recursive: true, force: true })
})

test("M15-T06: spreadsheet.chart 生成 SVG", async () => {
  const ws = mkdtempSync(join(tmpdir(), "m15h-"))
  const registry = new ToolRegistry()
  registry.register(spreadsheetCreateTool)
  registry.register(spreadsheetChartTool)
  await registry.execute("platform.spreadsheet.create", { workspacePath: ws, allowWrite: true }, { title: "C", rows: [["M", "V"], ["A", 10], ["B", 20]] })
  const c = await registry.execute(
    "platform.spreadsheet.chart",
    { workspacePath: ws },
    { path: ".agentdesk-docs/c.xlsx", labelColumn: 1, valueColumn: 2 },
  )
  assert.equal(c.ok, true)
  if (c.ok) {
    assert.ok(existsSync((c.output as { path: string }).path))
    assert.deepEqual((c.output as { values: number[] }).values, [10, 20])
  }
  rmSync(ws, { recursive: true, force: true })
})

test("M15-T07: spreadsheet.analyze Python 数据分析", async () => {
  const ws = mkdtempSync(join(tmpdir(), "m15p-"))
  const registry = new ToolRegistry()
  registry.register(spreadsheetCreateTool)
  registry.register(spreadsheetAnalyzeTool)
  await registry.execute("platform.spreadsheet.create", { workspacePath: ws, allowWrite: true }, { title: "D", rows: [["X", "Y"], [1, 10], [2, 20], [3, 30]] })
  const a = await registry.execute("platform.spreadsheet.analyze", { workspacePath: ws }, { path: ".agentdesk-docs/d.xlsx", outputPrefix: "ana" })
  if (a.ok) {
    const out = a.output as { stdout: string; stderr: string; csvPath: string; pngPath: string }
    if (/ModuleNotFoundError/.test(out.stderr)) {
      // pandas 未安装：工具正确透传 Python 错误（隔离执行链路正常）
      assert.match(out.stderr, /pandas/)
    } else {
      assert.match(out.stdout, /ROWS 3 COLS 2/)
      assert.ok(existsSync(out.csvPath))
    }
  } else {
    // python 不可用时允许降级
    assert.match(a.error ?? "", /python|spawn|ModuleNotFoundError/i)
  }
  rmSync(ws, { recursive: true, force: true })
})
