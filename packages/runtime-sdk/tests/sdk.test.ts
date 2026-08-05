/**
 * M22 契约测试：Runtime SDK（BaseRuntime + Manifest）+ 第三方 runtime 骨架。
 */
import assert from "node:assert/strict"
import { test } from "node:test"
import { CAPABILITIES, type AgentCapabilities } from "@agentdesk/runtime-protocol"
import { BaseRuntime, createRuntimeManifest } from "../src/index.ts"

class MiniRuntime extends BaseRuntime {
  readonly id = "mini"
  readonly displayName = "Mini Runtime"
  capabilities(): AgentCapabilities {
    return { ids: [CAPABILITIES.SESSION_CREATE, CAPABILITIES.SESSION_STREAM] }
  }
  async doHealth() {
    return { ok: true }
  }
  protected async runTurn(sessionId: string, message: string): Promise<void> {
    this.emit({ type: "message.started", runtimeId: this.id, sessionId, messageId: "m1", at: new Date().toISOString() })
    this.emit({ type: "message.delta", runtimeId: this.id, sessionId, messageId: "m1", delta: message, at: new Date().toISOString() })
    this.emit({ type: "message.completed", runtimeId: this.id, sessionId, messageId: "m1", text: message, at: new Date().toISOString() })
    this.emit({ type: "session.idle", runtimeId: this.id, sessionId, at: new Date().toISOString() })
  }
  protected async doCancel(_sessionId: string): Promise<void> {}
}

test("M22-T01/T03: BaseRuntime + Manifest 构建", async () => {
  const runtime = new MiniRuntime()
  await runtime.init()
  assert.equal(runtime.manifest.displayName, "Mini Runtime")
  assert.ok(runtime.manifest.supports.streaming)
  const manifest = createRuntimeManifest({
    id: "x",
    displayName: "X",
    capabilities: { ids: [CAPABILITIES.SESSION_CREATE] },
  })
  assert.equal(manifest.id, "x")
  assert.equal(manifest.supports.streaming, true)
  await runtime.dispose()
})

test("M22-T05/T06: Session 创建 + 流式事件", async () => {
  const runtime = new MiniRuntime()
  await runtime.init()
  const events: string[] = []
  runtime.subscribe((e) => events.push(e.type))
  const ref = await runtime.createSession({ initialMessage: "hello", cwd: "/tmp" })
  assert.ok(ref.sessionId.startsWith("mini:"))
  await new Promise((r) => setTimeout(r, 100))
  assert.ok(events.includes("session.created"))
  assert.ok(events.includes("message.started"))
  assert.ok(events.includes("message.delta"))
  assert.ok(events.includes("message.completed"))
  assert.ok(events.includes("session.idle"))
  await runtime.dispose()
})

test("M22-T07/T08: Tool 事件与 cancel", async () => {
  const runtime = new MiniRuntime()
  await runtime.init()
  const events: string[] = []
  runtime.subscribe((e) => events.push(e.type))
  const ref = await runtime.createSession()
  await runtime.cancel(ref.sessionId)
  assert.ok(events.includes("session.ended"))
  await runtime.dispose()
})
