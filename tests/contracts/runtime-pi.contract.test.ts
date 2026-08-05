/**
 * M06/M07 契约测试：PiWebRuntime 结构 + nativeConfig 透传（不依赖真实 pi-web 服务）。
 */
import assert from "node:assert/strict"
import { test } from "node:test"
import { PiWebRuntime, toNativeId } from "../../packages/runtime-pi/src/index.ts"
import { CAPABILITIES } from "../../packages/runtime-protocol/src/index.ts"

test("PiWebRuntime manifest: Pi 运行时声明 + supports", () => {
  const runtime = new PiWebRuntime({ baseUrl: "http://127.0.0.1:30141", cwd: "D:\\code_kj\\Agent工具开发\\AgentDesk\\test-workspace" })
  assert.equal(runtime.id, "pi")
  assert.equal(runtime.manifest.displayName, "Pi")
  assert.equal(runtime.manifest.supports.resume, true)
  assert.equal(runtime.manifest.supports.streaming, true)
  assert.equal(runtime.manifest.supports.nativeExtensions, true)
  assert.deepEqual(runtime.manifest.upstream, { name: "pi-web", npmVersion: "0.8.6", vendoredPath: "vendor/pi-web" })
})

test("PiWebRuntime capabilities: session create/resume/stream/skills/extensions", () => {
  const runtime = new PiWebRuntime({ baseUrl: "http://127.0.0.1:30141" })
  const caps = runtime.capabilities().ids
  assert.ok(caps.includes(CAPABILITIES.SESSION_CREATE))
  assert.ok(caps.includes(CAPABILITIES.SESSION_RESUME))
  assert.ok(caps.includes(CAPABILITIES.SESSION_STREAM))
  assert.ok(caps.includes(CAPABILITIES.SKILLS_NATIVE))
  assert.ok(caps.includes(CAPABILITIES.EXTENSIONS_NATIVE))
})

test("toNativeId: pi:xxx → xxx", () => {
  assert.equal(toNativeId("pi:019fcffb-e01c-74ab-a568-5939614601ac"), "019fcffb-e01c-74ab-a568-5939614601ac")
})

test("PiWebRuntime.nativeConfig 返回全局+项目配置（M07-T01）", async () => {
  const runtime = new PiWebRuntime({ baseUrl: "http://127.0.0.1:30141", cwd: "D:\\code_kj\\Agent工具开发\\AgentDesk\\test-workspace" })
  const config = (await runtime.nativeConfig()) as {
    global: { settings?: Record<string, unknown>; models?: Record<string, unknown> }
    project: { settings?: unknown }
  }
  // 全局配置存在：~/.pi/agent/settings.json + models.json
  assert.ok(config.global.settings, "global settings should load")
  assert.equal(typeof (config.global.settings as { defaultProvider?: string }).defaultProvider, "string")
  assert.ok(config.global.models, "global models should load")
  assert.ok(
    (config.global.models as { providers?: Record<string, unknown> }).providers,
    "models.providers should exist",
  )
  // 项目配置：test-workspace/.pi/settings.json 存在（M07-T01 验收时写入）
  assert.ok(config.project.settings, "project settings should exist")
})

test("PiWebRuntime.nativeConfig 缺文件时优雅降级", async () => {
  const runtime = new PiWebRuntime({ baseUrl: "http://127.0.0.1:30141", cwd: "Z:\\no-such-dir-xyz" })
  const config = (await runtime.nativeConfig()) as { global: { settings?: unknown; models?: unknown }; project: { settings?: unknown } }
  // cwd 不存在的项目：project 配置必然缺省（global 是真实全局配置，存在与否与本用例无关）
  assert.equal(config.project.settings, undefined)
})

test("PiWebRuntime.nativeSkills 缺目录时优雅降级为空", async () => {
  const runtime = new PiWebRuntime({ baseUrl: "http://127.0.0.1:30141", cwd: "Z:\\no-such-dir-xyz" })
  const skills = await runtime.nativeSkills()
  assert.ok(Array.isArray(skills))
})
