/**
 * M19 契约测试：Broker invoke/cancel/getStatus + Invocation Context + 跨 Runtime 隔离。
 */
import assert from "node:assert/strict"
import { test } from "node:test"
import { AgentBroker, runtimeExecutor } from "../src/index.ts"
import { DemoRuntime } from "@agentdesk/runtime-demo"

test("M19-T01: Broker invoke → completed，getStatus 可查", async () => {
  const broker = new AgentBroker(async () => `echo:${Date.now()}`)
  const record = await broker.invoke("echo", { message: "hi" })
  assert.ok(record.context.invocationId.startsWith("inv_"))
  // 等待异步完成
  await new Promise((r) => setTimeout(r, 300))
  const status = broker.getStatus(record.context.invocationId)
  assert.equal(status?.status, "completed")
  assert.ok(status?.sessionId)
})

test("M19-T01b: Broker cancel 未完成调用", async () => {
  let resolveRun: (() => void) | undefined
  const gate = new Promise<void>((resolve) => { resolveRun = resolve })
  const broker = new AgentBroker(async () => {
    await gate
    return "echo:1"
  })
  const record = await broker.invoke("echo", { message: "slow" })
  const cancelled = await broker.cancel(record.context.invocationId)
  assert.equal(cancelled, true)
  assert.equal(broker.getStatus(record.context.invocationId)?.status, "cancelled")
  resolveRun?.()
})

test("M19-T02: Invocation Context 记录 parent/child/artifacts/permissions", async () => {
  const broker = new AgentBroker(async () => "echo:2")
  const record = await broker.invoke("work", {
    message: "生成报告",
    parentSession: "pi:s1",
    parentAgent: "user",
    artifacts: ["art_1"],
    permissions: ["platform.document.create"],
  })
  const ctx = record.context
  assert.equal(ctx.parentSession, "pi:s1")
  assert.equal(ctx.parentAgent, "user")
  assert.equal(ctx.childAgent, "work")
  assert.deepEqual(ctx.artifacts, ["art_1"])
  assert.deepEqual(ctx.permissions, ["platform.document.create"])
})

test("M19-T02b: invoke 失败 → failed 状态", async () => {
  const broker = new AgentBroker(async () => { throw new Error("boom") })
  const record = await broker.invoke("opencode", { message: "x" })
  await new Promise((r) => setTimeout(r, 100))
  const status = broker.getStatus(record.context.invocationId)
  assert.equal(status?.status, "failed")
  assert.equal(status?.error, "boom")
})

test("M19-T03: runtimeExecutor 经 Broker 跨 Runtime 执行", async () => {
  const runtimes = new Map([["echo", new DemoRuntime({ latencyMs: 5 }) as never]])
  const executor = runtimeExecutor(runtimes as Map<string, never>)
  const broker = new AgentBroker(executor)
  const record = await broker.invoke("echo", { message: "hello" })
  await new Promise((r) => setTimeout(r, 400))
  const status = broker.getStatus(record.context.invocationId)
  assert.equal(status?.status, "completed")
  assert.ok(status?.sessionId?.startsWith("demo:"))
})
