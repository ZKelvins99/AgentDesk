/**
 * G02 契约测试：协议层可被完全假的 Runtime 实现而无需 OpenCode/Pi。
 */
import assert from "node:assert/strict"
import { test } from "node:test"
import { DemoRuntime } from "../../packages/runtime-demo/src/index.ts"
import {
  CAPABILITIES,
  hasCapability,
  type AgentEvent,
} from "../../packages/runtime-protocol/src/index.ts"

test("DemoRuntime 满足 AgentRuntime 契约", async () => {
  const runtime = new DemoRuntime({ latencyMs: 1 })
  await runtime.init()

  const events: AgentEvent[] = []
  const unsubscribe = runtime.subscribe((event) => events.push(event))

  const ref = await runtime.createSession({ initialMessage: "hello" })
  assert.equal(ref.runtimeId, "demo")
  assert.ok(ref.sessionId.startsWith("demo:"))

  // 等待模拟 turn 完成
  await waitFor(() => events.some((e) => e.type === "session.idle"))

  const types = events.map((e) => e.type)
  assert.ok(types.includes("message.started"), "应有 message.started")
  assert.ok(types.includes("message.delta"), "应有 message.delta")
  assert.ok(types.includes("tool.started"), "应有 tool.started")
  assert.ok(types.includes("artifact.emitted"), "应有 artifact.emitted")
  assert.ok(types.includes("message.completed"), "应有 message.completed")

  const health = await runtime.health()
  assert.equal(health.ok, true)

  unsubscribe()
  await runtime.dispose()
})

test("DemoRuntime capability 声明与查询", () => {
  const runtime = new DemoRuntime()
  assert.ok(hasCapability(runtime.capabilities(), CAPABILITIES.SESSION_CREATE))
  assert.ok(runtime.capabilities().ids.includes("artifact.emit"))
})

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timeout")
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}