/**
 * M04-T05/T06 tests: Runtime Selector.
 * - both OpenCode + Echo runtimes registered
 * - switching active runtime works without restarting
 */
import assert from "node:assert/strict"
import { test } from "node:test"
import { AgentDeskPanel } from "../src/index.ts"

test("M04-T05: panel lists OpenCode + Echo runtimes", async () => {
  const panel = new AgentDeskPanel()
  await panel.start()
  const ids = panel.list().map((r) => r.id)
  assert.ok(ids.includes("opencode"), "opencode registered")
  assert.ok(ids.includes("echo"), "echo registered")
  const echo = panel.list().find((r) => r.id === "echo")
  assert.equal(echo?.displayName, "Echo Runtime")
  assert.equal(panel.activeRuntime(), "echo")
  await panel.stop()
})

test("M04-T06: switch OpenCode <-> Echo without restart", async () => {
  const panel = new AgentDeskPanel()
  await panel.start()

  panel.switchRuntime("opencode")
  assert.equal(panel.activeRuntime(), "opencode")
  const view = panel.list().find((r) => r.id === "opencode")
  assert.equal(view?.active, true)

  panel.switchRuntime("echo")
  assert.equal(panel.activeRuntime(), "echo")
  assert.equal(panel.list().find((r) => r.id === "echo")?.active, true)

  await panel.stop()
})

test("M04-T06b: unknown runtime rejected", async () => {
  const panel = new AgentDeskPanel()
  await panel.start()
  assert.throws(() => panel.switchRuntime("nope"), /Unknown runtime/)
  await panel.stop()
})

test("M04-T02/panel: send via panel streams Echo events", async () => {
  const panel = new AgentDeskPanel()
  await panel.start()
  const events: string[] = []
  panel.subscribe((e) => events.push(e.type))

  await panel.send("hello")
  await new Promise((resolve) => setTimeout(resolve, 1200))

  assert.ok(events.includes("message.started"))
  assert.ok(events.filter((t) => t === "message.delta").length >= 3)
  assert.ok(events.includes("tool.started"))
  assert.ok(events.includes("permission.request"))
  assert.ok(events.includes("session.idle"))
  await panel.stop()
})

test("M09-T02: statusLabel 映射 Ready/Busy/Error", async () => {
  const panel = new AgentDeskPanel()
  await panel.start()
  const echo = panel.list().find((r) => r.id === "echo")
  assert.ok(echo)
  assert.ok(["Ready", "Starting"].includes(echo.statusLabel))

  // 触发 Echo 会话 → busy
  await panel.send("hi")
  const busy = panel.list().find((r) => r.id === "echo")
  assert.equal(busy?.statusLabel, "Busy")
  await new Promise((resolve) => setTimeout(resolve, 1200))
  const idle = panel.list().find((r) => r.id === "echo")
  assert.equal(idle?.statusLabel, "Ready")
  await panel.stop()
})

test("M09-T03: nativeSettings 按 runtime 分开返回", async () => {
  const panel = new AgentDeskPanel()
  await panel.start()
  const echoSettings = await panel.nativeSettings("echo")
  assert.ok(typeof echoSettings === "object")
  await panel.stop()
})

test("M09-T04: installationGuide 返回 installed + guide", () => {
  const panel = new AgentDeskPanel()
  const result = panel.installationGuide("opencode")
  assert.equal(typeof result.installed, "boolean")
  assert.equal(typeof result.guide, "string")
  const echo = panel.installationGuide("echo")
  assert.ok(echo.guide)
})
