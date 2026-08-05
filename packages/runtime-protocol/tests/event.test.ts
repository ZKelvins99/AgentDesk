/**
 * M02 contract tests: unified Agent Event Protocol.
 * - M02-T01..T05 event shapes
 * - Gate G03: protocol never references OpenCodeEvent / PiEvent
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"
import { eventSessionId, type AgentEvent } from "../src/index.ts"

const T = (): string => new Date().toISOString()

test("M02-T01: AgentEvent union covers all required event kinds", () => {
  const events: AgentEvent[] = [
    { type: "session.created", runtimeId: "r", sessionId: "s", at: T() },
    { type: "message.started", runtimeId: "r", sessionId: "s", messageId: "m", at: T() },
    { type: "message.delta", runtimeId: "r", sessionId: "s", messageId: "m", delta: "hi", at: T() },
    { type: "message.completed", runtimeId: "r", sessionId: "s", messageId: "m", text: "hi", at: T() },
    { type: "thinking.delta", runtimeId: "r", sessionId: "s", messageId: "m", delta: "reasoning...", at: T() },
    { type: "tool.started", runtimeId: "r", sessionId: "s", toolName: "bash", at: T() },
    { type: "tool.update", runtimeId: "r", sessionId: "s", toolName: "bash", callId: "c1", update: { partial: 1 }, at: T() },
    { type: "tool.completed", runtimeId: "r", sessionId: "s", toolName: "bash", result: "out", at: T() },
    { type: "tool.failed", runtimeId: "r", sessionId: "s", toolName: "bash", error: "boom", at: T() },
    { type: "permission.request", runtimeId: "r", sessionId: "s", action: "edit", at: T() },
    { type: "permission.resolved", runtimeId: "r", sessionId: "s", action: "edit", decision: "allow", at: T() },
    { type: "artifact.emitted", runtimeId: "r", sessionId: "s", artifact: { id: "a1", kind: "text", name: "a1", mime: "text/plain", uri: "file:///a1", createdBy: "r", parentIds: [], createdAt: T() }, at: T() },
    { type: "status", runtimeId: "r", sessionId: "s", status: "initializing", at: T() },
    { type: "error", runtimeId: "r", sessionId: "s", code: "E1", message: "failed", recoverable: true, at: T() },
    { type: "session.idle", runtimeId: "r", sessionId: "s", at: T() },
    { type: "session.error", runtimeId: "r", sessionId: "s", error: { code: "E2", message: "x" }, at: T() },
    { type: "session.ended", runtimeId: "r", sessionId: "s", at: T() },
  ]
  const kinds = events.map((e) => e.type)
  for (const required of [
    "session.created", "message.started", "message.delta", "message.completed",
    "thinking.delta", "tool.started", "tool.update", "tool.completed", "tool.failed",
    "permission.request", "permission.resolved", "artifact.emitted", "status", "error",
  ]) {
    assert.ok((kinds as string[]).includes(required), `missing event kind: ${required}`)
  }
})

test("M02-T02: message.delta shape (sessionId/messageId/delta)", () => {
  const e: AgentEvent = { type: "message.delta", runtimeId: "r", sessionId: "s1", messageId: "m1", delta: "d", at: T() }
  assert.equal(e.sessionId, "s1")
  assert.equal(e.messageId, "m1")
  assert.equal(e.delta, "d")
})

test("M02-T03: tool.start / tool.update / tool.completed / tool.failed", () => {
  const start: AgentEvent = { type: "tool.started", runtimeId: "r", sessionId: "s", toolName: "bash", callId: "c", args: { cmd: "pwd" }, at: T() }
  const update: AgentEvent = { type: "tool.update", runtimeId: "r", sessionId: "s", toolName: "bash", callId: "c", update: { line: 2 }, at: T() }
  const done: AgentEvent = { type: "tool.completed", runtimeId: "r", sessionId: "s", toolName: "bash", callId: "c", result: "ok", at: T() }
  const failed: AgentEvent = { type: "tool.failed", runtimeId: "r", sessionId: "s", toolName: "bash", callId: "c", error: "E", at: T() }
  assert.equal(start.type, "tool.started")
  assert.equal(update.type, "tool.update")
  assert.equal(done.type, "tool.completed")
  assert.equal(failed.type, "tool.failed")
  assert.ok(failed.error.length > 0)
})

test("M02-T04: permission.request / permission.resolved", () => {
  const req: AgentEvent = { type: "permission.request", runtimeId: "r", sessionId: "s", action: "edit", detail: { file: "a.ts" }, at: T() }
  const res: AgentEvent = { type: "permission.resolved", runtimeId: "r", sessionId: "s", action: "edit", decision: "deny", at: T() }
  assert.equal(req.type, "permission.request")
  assert.equal(res.decision, "deny")
})

test("M02-T05: error event has runtimeId/sessionId?/code/message/recoverable", () => {
  const e: AgentEvent = { type: "error", runtimeId: "r", code: "NETWORK", message: "timeout", recoverable: true, at: T() }
  assert.equal(e.code, "NETWORK")
  assert.equal(e.recoverable, true)
  assert.equal(eventSessionId(e), undefined)
  const withSession: AgentEvent = { type: "error", runtimeId: "r", sessionId: "s", code: "X", message: "y", recoverable: false, at: T() }
  assert.equal(eventSessionId(withSession), "s")
})

test("Gate G03: protocol never references OpenCodeEvent / PiEvent", () => {
  const eventSource = readFileSync(join(import.meta.dirname, "..", "src", "event.ts"), "utf8")
  assert.ok(!eventSource.includes("OpenCodeEvent"))
  assert.ok(!eventSource.includes("PiEvent"))
  assert.ok(!eventSource.includes("opencode"))
  assert.ok(!eventSource.includes("pi"))
})