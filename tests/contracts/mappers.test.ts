/**
 * M05-T08 / M06-T10 契约测试：事件映射函数（不依赖真实 SDK）。
 */
import assert from "node:assert/strict"
import { test } from "node:test"
import { mapOpenCodeEvent } from "../../packages/runtime-opencode/src/mappers.ts"
import { mapPiWebEvent } from "../../packages/runtime-pi/src/mappers.ts"

test("OpenCode message.updated → message.delta/completed", () => {
  const delta = mapOpenCodeEvent(
    { type: "message.part.updated", sessionID: "oc-1", messageID: "m1", part: { type: "text", text: "hi" } },
    "opencode",
    "opencode:oc-1",
  )
  assert.equal(delta.type, "message.delta")

  const done = mapOpenCodeEvent(
    { type: "message.updated", sessionID: "oc-1", messageID: "m1", message: { time: { complete: true }, parts: [{ type: "text", text: "hi" }] } },
    "opencode",
    "opencode:oc-1",
  )
  assert.equal(done.type, "message.completed")
  if (done.type === "message.completed") assert.equal(done.text, "hi")
})

test("OpenCode 未知事件 → native escape hatch", () => {
  const native = mapOpenCodeEvent({ type: "something.new", sessionID: "oc-1" }, "opencode")
  assert.equal(native.type, "native")
})

test("Pi message_update → message.delta；agent_end → session.idle", () => {
  const delta = mapPiWebEvent({ type: "message_update", sessionId: "p1", text: "hi" }, "pi", "pi:p1")
  assert.equal(delta?.type, "message.delta")

  const idle = mapPiWebEvent({ type: "agent_end" }, "pi", "pi:p1")
  assert.equal(idle?.type, "session.idle")
})

test("Pi connected 事件不映射", () => {
  const result = mapPiWebEvent({ type: "connected", sessionId: "p1" }, "pi")
  assert.equal(result, null)
})