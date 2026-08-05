/**
 * M20 契约测试：Hybrid Mode / Task Classification / Capability Matching / Handoff / Workflow。
 */
import assert from "node:assert/strict"
import { test } from "node:test"
import { ModeSwitch, TaskClassifier, TaskRouter, HandoffRegistry, buildHybridWorkflow } from "../src/index.ts"
import { DEFAULT_AGENTS } from "@agentdesk/agent-core"

test("M20-T01: Hybrid Mode 切换", () => {
  const mode = new ModeSwitch()
  assert.equal(mode.current(), "MODE_NATIVE_OPENCODE")
  assert.equal(mode.switch("MODE_HYBRID"), "MODE_HYBRID")
  assert.equal(mode.isHybrid, true)
  assert.equal(mode.switch("MODE_NATIVE_PI"), "MODE_NATIVE_PI")
  assert.equal(mode.isHybrid, false)
})

test("M20-T02: 规则任务分类", () => {
  const classifier = new TaskClassifier()
  assert.equal(classifier.classify("帮我写个函数处理 bug"), "coding")
  assert.equal(classifier.classify("生成季度汇报 PPT"), "slides")
  assert.equal(classifier.classify("分析 CSV 数据"), "data")
  assert.equal(classifier.classify("做一份 Word 文档报告"), "document")
  assert.equal(classifier.classify("随便聊聊"), "general")
})

test("M20-T03: Capability Matching 路由 Agent", () => {
  const router = new TaskRouter()
  const slides = router.route("slides", DEFAULT_AGENTS)
  assert.equal(slides?.id, "work")
  const coding = router.route("coding", DEFAULT_AGENTS)
  assert.equal(coding?.id, "code")
  const data = router.route("data", DEFAULT_AGENTS)
  assert.equal(data?.id, "data")
})

test("M20-T04: Artifact Handoff 记录与消费", () => {
  const handoffs = new HandoffRegistry()
  const h = handoffs.record({ id: "art_1", uri: "file:///analysis.csv" }, "data")
  assert.equal(h.producedByAgent, "data")
  const consumed = handoffs.consume("art_1", "slides")
  assert.equal(consumed?.consumedByAgent, "slides")
  assert.equal(handoffs.list().length, 1)
})

test("M20-T05: Hybrid Workflow 编排（Data → Slides）", () => {
  const steps = buildHybridWorkflow("data")
  assert.equal(steps.length, 2)
  assert.equal(steps[0].agentId, "data")
  assert.equal(steps[1].agentId, "slides")
})
