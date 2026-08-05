/**
 * M16 契约测试：slides.create/add_slide/update_slide/delete_slide/render（PPTX + SVG 预览）。
 */
import assert from "node:assert/strict"
import { test } from "node:test"
import { tmpdir } from "node:os"
import { mkdtempSync, rmSync, existsSync } from "node:fs"
import { join } from "node:path"
import {
  ToolRegistry,
  slidesCreateTool,
  slidesAddSlideTool,
  slidesUpdateSlideTool,
  slidesDeleteSlideTool,
  slidesRenderTool,
} from "../src/index.ts"

test("M16-T01/T02: slides.create + add_slide", async () => {
  const registry = new ToolRegistry()
  registry.register(slidesCreateTool)
  registry.register(slidesAddSlideTool)
  const created = await registry.execute("platform.slides.create", {}, { title: "季度汇报" })
  assert.equal(created.ok, true)
  const deckId = (created.output as { deckId: string }).deckId
  const added = await registry.execute(
    "platform.slides.add_slide",
    {},
    { deckId, title: "销售", bullets: ["增长 20%", "成本下降"], table: [["Q", "金额"], ["Q1", "100"]] },
  )
  assert.equal(added.ok, true)
  assert.equal((added.output as { totalSlides: number }).totalSlides, 2)
})

test("M16-T03: slides.update_slide", async () => {
  const registry = new ToolRegistry()
  registry.register(slidesCreateTool)
  registry.register(slidesAddSlideTool)
  registry.register(slidesUpdateSlideTool)
  const deckId = (await registry.execute("platform.slides.create", {}, { title: "A" })).output as { deckId: string }
  await registry.execute("platform.slides.add_slide", {}, { deckId: deckId.deckId, title: "旧标题", bullets: ["旧"] })
  const updated = await registry.execute(
    "platform.slides.update_slide",
    {},
    { deckId: deckId.deckId, slideIndex: 1, title: "新标题", bullets: ["新要点"] },
  )
  assert.equal(updated.ok, true)
})

test("M16-T04: slides.delete_slide", async () => {
  const registry = new ToolRegistry()
  registry.register(slidesCreateTool)
  registry.register(slidesAddSlideTool)
  registry.register(slidesDeleteSlideTool)
  const deckId = (await registry.execute("platform.slides.create", {}, { title: "A" })).output as { deckId: string }
  await registry.execute("platform.slides.add_slide", {}, { deckId: deckId.deckId, title: "B" })
  const del = await registry.execute("platform.slides.delete_slide", {}, { deckId: deckId.deckId, slideIndex: 1 })
  assert.equal(del.ok, true)
  assert.equal((del.output as { totalSlides: number }).totalSlides, 1)
  const outOfRange = await registry.execute("platform.slides.delete_slide", {}, { deckId: deckId.deckId, slideIndex: 9 })
  assert.equal(outOfRange.ok, false)
})

test("M16-T05/T06: slides.render 导出 PPTX + SVG 预览", async () => {
  const ws = mkdtempSync(join(tmpdir(), "m16-"))
  const registry = new ToolRegistry()
  registry.register(slidesCreateTool)
  registry.register(slidesAddSlideTool)
  registry.register(slidesRenderTool)
  const deckId = (await registry.execute("platform.slides.create", {}, { title: "演示" })).output as { deckId: string }
  await registry.execute("platform.slides.add_slide", {}, { deckId: deckId.deckId, title: "第二页", bullets: ["要点1"] })
  const rendered = await registry.execute(
    "platform.slides.render",
    { workspacePath: ws, allowWrite: true },
    { deckId: deckId.deckId, filename: "demo.pptx" },
  )
  assert.equal(rendered.ok, true)
  if (rendered.ok) {
    const out = rendered.output as { path: string; svgPath: string; slideCount: number }
    assert.equal(out.slideCount, 2)
    assert.ok(existsSync(out.path))
    assert.ok(existsSync(out.svgPath))
  }
  rmSync(ws, { recursive: true, force: true })
})
