/**
 * M01-T02/T03/T04/T05 contract tests:
 * - AgentRuntime / RuntimeManifest / AgentCapabilities are implementable with ZERO
 *   external deps (no OpenCode / Pi / Electron / SolidJS) -> Gate G02.
 * - Package can typecheck / build / test independently.
 */
import assert from "node:assert/strict"
import { test } from "node:test"
import {
  CAPABILITIES,
  hasCapability,
  type AgentCapabilities,
  type AgentEvent,
  type AgentRuntime,
  type HealthStatus,
  type RuntimeManifest,
  type RuntimeSessionRef,
  type SendInput,
  type SessionId,
  type Unsubscribe,
} from "../src/index.ts"

class FakeRuntime implements AgentRuntime {
  readonly id = "fake"
  readonly manifest: RuntimeManifest = {
    id: "fake",
    displayName: "Fake Runtime",
    version: "0.0.1",
    description: "M01 contract test runtime",
    icon: "fake",
    upstream: { name: "none" },
    capabilities: { ids: [CAPABILITIES.SESSION_CREATE, CAPABILITIES.SESSION_STREAM] },
    supports: {
      resume: true,
      streaming: true,
      cancel: true,
      nativePermissions: false,
      nativeExtensions: false,
    },
  }

  async init(): Promise<void> {}
  async dispose(): Promise<void> {}

  async health(): Promise<HealthStatus> {
    return { ok: true, runtimeId: this.id, checkedAt: new Date().toISOString() }
  }

  async createSession(): Promise<RuntimeSessionRef> {
    return { sessionId: "fake:1", runtimeId: this.id, state: "created", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  }

  async resumeSession(sessionId: SessionId): Promise<RuntimeSessionRef> {
    return { sessionId, runtimeId: this.id, state: "created", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  }

  async send(input: SendInput): Promise<RuntimeSessionRef> {
    return { sessionId: input.sessionId, runtimeId: this.id, state: "running", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  }

  async cancel(_sessionId: SessionId): Promise<void> {}

  subscribe(listener: (event: AgentEvent) => void): Unsubscribe {
    const timer = setTimeout(() => {
      listener({
        type: "message.completed",
        runtimeId: this.id,
        sessionId: "fake:1",
        messageId: "m1",
        text: "done",
        at: new Date().toISOString(),
      })
    }, 1)
    return () => clearTimeout(timer)
  }

  capabilities(): AgentCapabilities {
    return this.manifest.capabilities
  }
}

test("M01-T02: AgentRuntime contract implementable with zero deps (Gate G02)", () => {
  const runtime = new FakeRuntime()
  assert.equal(runtime.id, "fake")
  assert.equal(runtime.manifest.displayName, "Fake Runtime")
})

test("M01-T03: RuntimeManifest has id/name/version/description/icon", () => {
  const runtime = new FakeRuntime()
  assert.equal(runtime.manifest.id, "fake")
  assert.equal(runtime.manifest.displayName, "Fake Runtime")
  assert.equal(runtime.manifest.version, "0.0.1")
  assert.equal(runtime.manifest.description, "M01 contract test runtime")
  assert.equal(runtime.manifest.icon, "fake")
})

test("M01-T04: capability query works (streaming/tools/...)", () => {
  const runtime = new FakeRuntime()
  assert.ok(hasCapability(runtime.capabilities(), CAPABILITIES.SESSION_CREATE))
  assert.ok(hasCapability(runtime.capabilities(), CAPABILITIES.SESSION_STREAM))
  assert.ok(CAPABILITIES.TOOLS_NATIVE)
  assert.ok(CAPABILITIES.SKILLS_NATIVE)
  assert.ok(CAPABILITIES.PERMISSION_EVENTS)
})

test("M01-T02: createSession / resumeSession / send / cancel / dispose work", async () => {
  const runtime = new FakeRuntime()
  await runtime.init()
  const ref = await runtime.createSession()
  assert.ok(ref.sessionId.startsWith("fake:"))
  const resumed = await runtime.resumeSession(ref.sessionId)
  assert.equal(resumed.sessionId, ref.sessionId)
  const sent = await runtime.send({ sessionId: ref.sessionId, message: "hi" })
  assert.equal(sent.state, "running")
  await runtime.cancel(ref.sessionId)
  const events: AgentEvent[] = []
  const unsubscribe = runtime.subscribe((e) => events.push(e))
  await new Promise((resolve) => setTimeout(resolve, 10))
  unsubscribe()
  assert.equal(events[0]?.type, "message.completed")
  await runtime.dispose()
})