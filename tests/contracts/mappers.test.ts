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
// ---- M05: new session.next.* stream events ----
test("M05: session.next.text.* maps to message events", () => {
  const started = mapOpenCodeEvent(
    { type: "session.next.text.started", sessionID: "oc-1", assistantMessageID: "m1", textID: "t1" },
    "opencode",
  )
  assert.equal(started.type, "message.started")

  const delta = mapOpenCodeEvent(
    { type: "session.next.text.delta", sessionID: "oc-1", assistantMessageID: "m1", textID: "t1", delta: "hi" },
    "opencode",
  )
  assert.equal(delta.type, "message.delta")
  if (delta.type === "message.delta") assert.equal(delta.delta, "hi")

  const ended = mapOpenCodeEvent(
    { type: "session.next.text.ended", sessionID: "oc-1", assistantMessageID: "m1", textID: "t1", text: "hello" },
    "opencode",
  )
  assert.equal(ended.type, "message.completed")
  if (ended.type === "message.completed") assert.equal(ended.text, "hello")
})

test("M05: reasoning stream maps to thinking.delta", () => {
  const started = mapOpenCodeEvent(
    { type: "session.next.reasoning.started", sessionID: "oc-1", assistantMessageID: "m1", reasoningID: "r1" },
    "opencode",
  )
  assert.equal(started.type, "thinking.delta")

  const delta = mapOpenCodeEvent(
    { type: "session.next.reasoning.delta", sessionID: "oc-1", assistantMessageID: "m1", reasoningID: "r1", delta: "think..." },
    "opencode",
  )
  assert.equal(delta.type, "thinking.delta")
  if (delta.type === "thinking.delta") assert.equal(delta.delta, "think...")

  // legacy part-based reasoning
  const legacy = mapOpenCodeEvent(
    { type: "message.part.updated", sessionID: "oc-1", messageID: "m1", part: { type: "reasoning", text: "r" } },
    "opencode",
  )
  assert.equal(legacy.type, "thinking.delta")
})

test("M05: tool stream maps to tool.started/update/completed/failed", () => {
  const started = mapOpenCodeEvent(
    { type: "session.next.tool.input.started", sessionID: "oc-1", callID: "c1", name: "bash" },
    "opencode",
  )
  assert.equal(started.type, "tool.started")
  if (started.type === "tool.started") assert.equal(started.toolName, "bash")

  const progress = mapOpenCodeEvent(
    { type: "session.next.tool.progress", sessionID: "oc-1", callID: "c1", structured: { lines: 1 } },
    "opencode",
  )
  assert.equal(progress.type, "tool.update")

  const success = mapOpenCodeEvent(
    { type: "session.next.tool.success", sessionID: "oc-1", callID: "c1", result: "out" },
    "opencode",
  )
  assert.equal(success.type, "tool.completed")

  const failed = mapOpenCodeEvent(
    { type: "session.next.tool.failed", sessionID: "oc-1", callID: "c1", error: { message: "boom" } },
    "opencode",
  )
  assert.equal(failed.type, "tool.failed")
  if (failed.type === "tool.failed") assert.equal(failed.error, "boom")
})

test("M05: permission.v2 maps to permission.request/resolved", () => {
  const asked = mapOpenCodeEvent(
    { type: "permission.v2.asked", sessionID: "oc-1", requestID: "q1", permission: "edit" },
    "opencode",
  )
  assert.equal(asked.type, "permission.request")
  if (asked.type === "permission.request") assert.equal(asked.action, "edit")

  const repliedAllow = mapOpenCodeEvent(
    { type: "permission.v2.replied", sessionID: "oc-1", requestID: "q1", reply: "once" },
    "opencode",
  )
  assert.equal(repliedAllow.type, "permission.resolved")
  if (repliedAllow.type === "permission.resolved") assert.equal(repliedAllow.decision, "allow")

  const repliedDeny = mapOpenCodeEvent(
    { type: "permission.v2.replied", sessionID: "oc-1", requestID: "q1", reply: "reject" },
    "opencode",
  )
  assert.equal(repliedDeny.type, "permission.resolved")
  if (repliedDeny.type === "permission.resolved") assert.equal(repliedDeny.decision, "deny")
})

test("M05: step.failed maps to error event with recoverable", () => {
  const err = mapOpenCodeEvent(
    { type: "session.next.step.failed", sessionID: "oc-1", error: { message: "step failed" } },
    "opencode",
  )
  assert.equal(err.type, "error")
  if (err.type === "error") {
    assert.equal(err.code, "opencode.step.failed")
    assert.equal(err.message, "step failed")
    assert.equal(err.recoverable, true)
  }
})

// ---- M06: Pi mapper coverage ----
test("M06: Pi tool_execution_* maps to tool.started/completed", () => {
  const started = mapPiWebEvent({ type: "tool_execution_start", sessionId: "p1", toolName: "bash", callId: "c1", args: { cmd: "pwd" } }, "pi", "pi:p1")
  assert.equal(started?.type, "tool.started")
  if (started?.type === "tool.started") {
    assert.equal(started.toolName, "bash")
    assert.equal(started.callId, "c1")
  }

  const done = mapPiWebEvent({ type: "tool_execution_end", sessionId: "p1", toolName: "bash", callId: "c1", result: "ok" }, "pi", "pi:p1")
  assert.equal(done?.type, "tool.completed")
  if (done?.type === "tool.completed") {
    assert.equal(done.toolName, "bash")
    assert.equal(done.result, "ok")
  }
})

test("M06: Pi error events map to session.error", () => {
  const err = mapPiWebEvent({ type: "session_error", sessionId: "p1", message: "boom" }, "pi", "pi:p1")
  assert.equal(err?.type, "session.error")
  if (err?.type === "session.error") {
    assert.equal(err.error.message, "boom")
  }
})

test("M06: Pi unknown event → native escape hatch", () => {
  const native = mapPiWebEvent({ type: "something_new", sessionId: "p1", extra: 1 }, "pi", "pi:p1")
  assert.equal(native?.type, "native")
  if (native?.type === "native") assert.deepEqual(native.payload, { type: "something_new", sessionId: "p1", extra: 1 })
})

test("M06: Pi message_update with AgentMessage.content extracts text", () => {
  const delta = mapPiWebEvent(
    { type: "message_update", sessionId: "p1", message: { role: "assistant", content: [{ type: "text", text: "流式" }, { type: "thinking", text: "hidden" }] } },
    "pi",
    "pi:p1",
  )
  assert.equal(delta?.type, "message.delta")
  if (delta?.type === "message.delta") assert.equal(delta.delta, "流式")
})
