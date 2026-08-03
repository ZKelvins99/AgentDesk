/**
 * M04 契约测试：事件总线过滤、顺序、reducer。
 */
import assert from "node:assert/strict"
import { test } from "node:test"
import { EventBus, artifactReducer, messageReducer, toolLifecycleReducer } from "../../packages/event-bus/src/index.ts"
import type { AgentEvent } from "../../packages/runtime-protocol/src/index.ts"

function event(type: AgentEvent["type"], overrides: Partial<AgentEvent> = {}): AgentEvent {
  return {
    type,
    runtimeId: "demo",
    sessionId: "s1",
    at: new Date().toISOString(),
    ...overrides,
  } as AgentEvent
}

test("EventBus 发布/订阅/退订", () => {
  const bus = new EventBus()
  const received: AgentEvent[] = []
  const unsubscribe = bus.subscribe((e) => received.push(e))
  bus.publish(event("session.idle"))
  assert.equal(received.length, 1)
  unsubscribe()
  bus.publish(event("session.idle"))
  assert.equal(received.length, 1)
})

test("EventBus 支持按类型/会话过滤", () => {
  const bus = new EventBus()
  const received: AgentEvent[] = []
  bus.subscribe({ types: ["message.delta"], sessionId: "s1" }, (e) => received.push(e))
  bus.publish(event("message.delta"))
  bus.publish(event("session.idle"))
  bus.publish(event("message.delta", { sessionId: "s2" }))
  assert.equal(received.length, 1)
})

test("messageReducer 累积流式文本", () => {
  let state = messageReducer(new Map(), event("message.started", { messageId: "m1" }))
  state = messageReducer(state, event("message.delta", { messageId: "m1", delta: "你" }))
  state = messageReducer(state, event("message.delta", { messageId: "m1", delta: "好" }))
  assert.equal(state.get("s1")?.text, "你好")
  state = messageReducer(state, event("message.completed", { messageId: "m1", text: "你好" }))
  assert.equal(state.get("s1")?.status, "done")
})

test("toolLifecycleReducer 跟踪 tool 调用", () => {
  let state = toolLifecycleReducer(new Map(), event("tool.started", { toolName: "bash", callId: "c1" }))
  assert.equal(state.get("c1")?.status, "running")
  state = toolLifecycleReducer(state, event("tool.completed", { toolName: "bash", callId: "c1", result: { ok: true } }))
  assert.equal(state.get("c1")?.status, "done")
})

test("artifactReducer 累积 Artifact", () => {
  const artifact = {
    id: "a1",
    kind: "markdown",
    name: "note.md",
    mime: "text/markdown",
    uri: "agentdesk://demo/s1/note.md",
    createdAt: new Date().toISOString(),
    createdBy: "demo",
    parentIds: [],
  }
  const state = artifactReducer([], event("artifact.emitted", { artifact }))
  assert.equal(state.length, 1)
  assert.equal(state[0].name, "note.md")
})