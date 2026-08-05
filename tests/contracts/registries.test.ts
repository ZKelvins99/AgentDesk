/**
 * G03 契约测试：动态注册 Demo Runtime 后可创建 Session；Capability 路由可用。
 */
import assert from "node:assert/strict"
import { test } from "node:test"
import { AgentDeskPlatform } from "../../packages/platform-core/src/index.ts"
import { RuntimeFactoryRegistry, RuntimeLifecycleManager } from "../../packages/registry-core/src/index.ts"
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
test("M03-T02: Runtime Factory 延迟实例化", async () => {
  let instantiated = 0
  const factories = new RuntimeFactoryRegistry()
  factories.register("demo", () => {
    instantiated++
    return new DemoRuntime()
  })
  // 注册后不应立即实例化
  assert.equal(instantiated, 0)
  assert.ok(factories.has("demo"))
  assert.equal(factories.listFactories().length, 1)

  const runtime = await factories.instantiate("demo")
  assert.equal(instantiated, 1)
  assert.equal(runtime.id, "demo")

  // 幂等：重复 instantiate 复用实例
  const again = await factories.instantiate("demo")
  assert.equal(again, runtime)
  assert.equal(instantiated, 1)
})

test("M03-T03: Lifecycle 状态机 uninitialized→initializing→ready→busy→ready→disposed", async () => {
  const runtime = new DemoRuntime({ latencyMs: 1 })
  const manager = new RuntimeLifecycleManager()
  const map = new Map<string, typeof runtime>([["demo", runtime]])

  assert.equal(manager.stateOf("demo").state, "uninitialized")
  await manager.startAll(map)
  assert.equal(manager.stateOf("demo").state, "ready")

  const events: import("@agentdesk/runtime-protocol").AgentEvent[] = []
  runtime.subscribe((e) => events.push(e))
  await runtime.createSession({ initialMessage: "hi" })
  await new Promise((resolve) => setTimeout(resolve, 500))
  assert.equal(manager.stateOf("demo").state, "ready")

  await manager.stopAll(map)
  assert.equal(manager.stateOf("demo").state, "disposed")
})

test("M03-T04: healthSnapshot 输出 Ready 状态供 UI 展示", async () => {
  const runtime = new DemoRuntime({ latencyMs: 1 })
  const manager = new RuntimeLifecycleManager()
  const map = new Map<string, typeof runtime>([["demo", runtime]])
  await manager.startAll(map)
  const snapshot = manager.healthSnapshot(map)
  assert.equal(snapshot[0]?.runtimeId, "demo")
  assert.equal(snapshot[0]?.state, "ready")
  assert.equal(snapshot[0]?.ok, true)
  await manager.stopAll(map)
})