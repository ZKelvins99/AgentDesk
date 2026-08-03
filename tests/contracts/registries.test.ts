/**
 * G03 契约测试：动态注册 Demo Runtime 后可创建 Session；Capability 路由可用。
 */
import assert from "node:assert/strict"
import { test } from "node:test"
import { AgentDeskPlatform } from "../../packages/platform-core/src/index.ts"
import { DemoRuntime } from "../../packages/runtime-demo/src/index.ts"
import { CAPABILITIES } from "../../packages/runtime-protocol/src/index.ts"

test("AgentDeskPlatform 注册 Demo Runtime 并创建 Session", async () => {
  const platform = new AgentDeskPlatform({ runtimes: [new DemoRuntime()] })
  await platform.start()

  assert.equal(platform.runtimeRegistry.list().length, 1)
  assert.equal(platform.runtimeRegistry.findByCapability(CAPABILITIES.SESSION_CREATE).length, 1)
  assert.deepEqual(platform.capabilityRegistry.listRuntimes("artifact.emit"), ["demo"])

  const ref = await platform.createSession("demo", { initialMessage: "hi" })
  assert.ok(ref.sessionId)

  const health = await platform.health("demo")
  assert.equal(health[0].ok, true)

  await platform.stop()
})

test("SessionRegistry 随事件更新状态", async () => {
  const platform = new AgentDeskPlatform({ runtimes: [new DemoRuntime({ latencyMs: 1 })] })
  await platform.start()
  const ref = await platform.createSession("demo", { initialMessage: "hi" })

  await new Promise((resolve) => setTimeout(resolve, 1000))
  const current = platform.sessionRegistry.get(ref.sessionId)
  assert.equal(current?.state, "idle")

  await platform.stop()
})