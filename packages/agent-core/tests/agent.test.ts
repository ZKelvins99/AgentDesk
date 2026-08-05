/**
 * M18 契约测试：AgentDefinition / Agent Registry / 默认 Agent。
 */
import assert from "node:assert/strict"
import { test } from "node:test"
import { AgentDefinitionRegistry, DEFAULT_AGENTS } from "../src/index.ts"

test("M18-T01: AgentDefinition 结构", () => {
  const agent = {
    id: "custom",
    name: "Custom",
    runtimeId: "pi",
    description: "自定义",
    requiredCapabilities: ["session.create"],
    systemPrompt: "prompt",
    skills: ["s1"],
  }
  assert.equal(agent.id, "custom")
  assert.equal(agent.runtimeId, "pi")
  assert.ok(Array.isArray(agent.skills))
})

test("M18-T02: Agent Registry register/get/list/unregister", () => {
  const registry = new AgentDefinitionRegistry()
  registry.register({ id: "custom-1", name: "Custom1", runtimeId: "opencode" })
  assert.equal(registry.get("custom-1")?.name, "Custom1")
  assert.equal(registry.list().length, DEFAULT_AGENTS.length + 1)
  assert.ok(registry.unregister("custom-1"))
  assert.equal(registry.get("custom-1"), undefined)
})

test("M18-T03: 默认 Agent 六个（OpenCode/Pi Native + Code/Work/Research/Data）", () => {
  const registry = new AgentDefinitionRegistry()
  const ids = registry.list().map((a) => a.id)
  for (const expected of ["opencode-native", "pi-native", "code", "work", "research", "data"]) {
    assert.ok(ids.includes(expected), `missing default agent: ${expected}`)
  }
  assert.equal(registry.get("opencode-native")?.runtimeId, "opencode")
  assert.equal(registry.get("pi-native")?.runtimeId, "pi")
  assert.equal(registry.get("work")?.requiredCapabilities?.includes("artifact.emit"), true)
})

test("M18: listByRuntime 过滤", () => {
  const registry = new AgentDefinitionRegistry()
  const opencode = registry.listByRuntime("opencode")
  assert.ok(opencode.some((a) => a.id === "code"))
  const pi = registry.listByRuntime("pi")
  assert.ok(pi.some((a) => a.id === "work"))
})
