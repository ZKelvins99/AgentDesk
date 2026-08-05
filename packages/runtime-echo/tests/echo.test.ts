/**
 * M04 contract tests: Echo Runtime (G04 decoupling proof).
 * - T02 streaming: multiple message.delta, final text "Echo: hello"
 * - T03 fake tool echo.time: tool.started + tool.completed
 * - T04 permission simulation: permission.request + permission.resolved
 */
import assert from "node:assert/strict"
import { test } from "node:test"
import { EchoRuntime } from "../src/index.ts"

async function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timeout")
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

test("M04-T01: EchoRuntime implements AgentRuntime and registers", async () => {
  const runtime = new EchoRuntime({ latencyMs: 1 })
  assert.equal(runtime.id, "echo")
  assert.equal(runtime.manifest.displayName, "Echo Runtime")
  assert.ok(runtime.capabilities().ids.includes("session.stream"))
  await runtime.init()
  const health = await runtime.health()
  assert.equal(health.ok, true)
  await runtime.dispose()
})

test("M04-T02: Echo streaming returns 'Echo: hello' via multiple deltas", async () => {
  const runtime = new EchoRuntime({ latencyMs: 1 })
  await runtime.init()
  const events: string[] = []
  runtime.subscribe((e) => events.push(e.type))

  const ref = await runtime.createSession({ initialMessage: "hello" })
  assert.ok(ref.sessionId.startsWith("echo:"))

  await waitFor(() => events.includes("session.idle"))

  const deltas = events.filter((t) => t === "message.delta").length
  assert.ok(deltas >= 3, `expected multiple streaming deltas, got ${deltas}`)

  await runtime.dispose()
})

test("M04-T02b: final text is exactly 'Echo: hello'", async () => {
  const runtime = new EchoRuntime({ latencyMs: 1 })
  await runtime.init()
  let finalText = ""
  let deltas = ""
  runtime.subscribe((e) => {
    if (e.type === "message.completed") finalText = e.text
    if (e.type === "message.delta") deltas += e.delta
  })
  await runtime.createSession({ initialMessage: "hello" })
  await waitFor(() => finalText.length > 0)
  assert.equal(finalText, "Echo: hello")
  assert.equal(deltas, "Echo: hello")
  await runtime.dispose()
})

test("M04-T03: echo.time tool events emitted", async () => {
  const runtime = new EchoRuntime({ latencyMs: 1 })
  await runtime.init()
  const started: string[] = []
  const completed: string[] = []
  runtime.subscribe((e) => {
    if (e.type === "tool.started") started.push(e.toolName)
    if (e.type === "tool.completed") completed.push(e.toolName)
  })
  await runtime.createSession({ initialMessage: "hi" })
  await waitFor(() => completed.length > 0)
  assert.ok(started.includes("echo.time"))
  assert.ok(completed.includes("echo.time"))
  await runtime.dispose()
})

test("M04-T04: permission request + resolved events", async () => {
  const runtime = new EchoRuntime({ latencyMs: 1 })
  await runtime.init()
  const requests: string[] = []
  const decisions: string[] = []
  runtime.subscribe((e) => {
    if (e.type === "permission.request") requests.push(e.action)
    if (e.type === "permission.resolved") decisions.push(e.decision)
  })
  await runtime.createSession({ initialMessage: "hi" })
  await waitFor(() => decisions.length > 0)
  assert.ok(requests.includes("echo.reply"))
  assert.ok(decisions.includes("allow"))
  await runtime.dispose()
})