/**
 * M13 契约测试：Tool Protocol / Registry / Filesystem / Python / Permission。
 */
import assert from "node:assert/strict"
import { test } from "node:test"
import { tmpdir } from "node:os"
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs"
import { join } from "node:path"
import {
  ToolRegistry,
  PermissionCore,
  matchPattern,
  fileReadTool,
  fileWriteTool,
  fileListTool,
  pythonTool,
  type AgentDeskTool,
} from "../src/index.ts"

test("M13-T01: Tool Protocol 结构", () => {
  const tool: AgentDeskTool = {
    id: "test.hello",
    description: "hello",
    inputSchema: {},
    async execute() {
      return { ok: true, output: "hi" }
    },
  }
  assert.equal(tool.id, "test.hello")
  assert.equal(typeof tool.execute, "function")
})

test("M13-T02: Tool Registry register/unregister/list/get/execute", async () => {
  const registry = new ToolRegistry()
  const tool: AgentDeskTool = {
    id: "test.add",
    description: "add",
    inputSchema: {},
    async execute(_ctx, input) {
      return { ok: true, output: Number(input.a) + Number(input.b) }
    },
  }
  registry.register(tool)
  assert.equal(registry.list().length, 1)
  assert.equal(registry.get("test.add"), tool)
  const r = await registry.execute("test.add", {}, { a: 1, b: 2 })
  assert.deepEqual(r, { ok: true, output: 3 })
  assert.ok(registry.unregister("test.add"))
  assert.equal(registry.list().length, 0)
})

test("M13-T03: Filesystem Tools read/write/list（工作区限定）", async () => {
  const ws = mkdtempSync(join(tmpdir(), "m13-"))
  writeFileSync(join(ws, "a.txt"), "hello")
  const registry = new ToolRegistry()
  registry.register(fileReadTool)
  registry.register(fileWriteTool)
  registry.register(fileListTool)
  const ctx = { workspacePath: ws, allowWrite: true }

  const read = await registry.execute("platform.file.read", ctx, { path: "a.txt" })
  assert.deepEqual(read, { ok: true, output: { text: "hello" } })

  const write = await registry.execute("platform.file.write", ctx, { path: "b.txt", content: "world" })
  assert.equal(write.ok, true)
  assert.equal(readFileSync(join(ws, "b.txt"), "utf8"), "world")

  const list = await registry.execute("platform.file.list", ctx, { path: "." })
  assert.equal(list.ok, true)
  if (list.ok) {
    const names = (list.output as { entries: { name: string }[] }).entries.map((e) => e.name)
    assert.ok(names.includes("a.txt"))
    assert.ok(names.includes("b.txt"))
  }

  // 越界拒绝
  const outside = await registry.execute("platform.file.read", ctx, { path: "../secret.txt" })
  assert.equal(outside.ok, false)
  rmSync(ws, { recursive: true, force: true })
})

test("M13-T03b: write 需要 allowWrite", async () => {
  const ws = mkdtempSync(join(tmpdir(), "m13b-"))
  const registry = new ToolRegistry()
  registry.register(fileWriteTool)
  const r = await registry.execute("platform.file.write", { workspacePath: ws }, { path: "x.txt", content: "x" })
  assert.equal(r.ok, false)
  rmSync(ws, { recursive: true, force: true })
})

test("M13-T04: Python Tool 隔离执行", async () => {
  const ws = mkdtempSync(join(tmpdir(), "m13py-"))
  const registry = new ToolRegistry()
  registry.register(pythonTool)
  const r = await registry.execute("platform.python", { workspacePath: ws }, { code: "print(6 * 7)" })
  if (r.ok) {
    assert.match(String((r.output as { stdout: string }).stdout), /42/)
  } else {
    // python 未安装时允许降级（不视为失败断言）
    assert.match(r.error ?? "", /spawn|python/i)
  }
  rmSync(ws, { recursive: true, force: true })
})

test("M13-T05: Permission Core —— deny 规则拦截平台工具", async () => {
  const permission = new PermissionCore()
  permission.addRule({ pattern: "platform.file.write", decision: "deny" })
  const registry = new ToolRegistry(permission)
  registry.register(fileWriteTool)
  const ws = mkdtempSync(join(tmpdir(), "m13p-"))
  const r = await registry.execute("platform.file.write", { workspacePath: ws, allowWrite: true }, { path: "x.txt", content: "x" })
  assert.equal(r.ok, false)
  assert.equal(r.denied, true)
  // 未命中规则的工具默认 allow
  const read = await registry.execute("platform.file.read", { workspacePath: ws }, { path: "." })
  assert.equal(read.ok, false) // 目录读取失败但未被 deny
  assert.notEqual(read.denied, true)
  rmSync(ws, { recursive: true, force: true })
})

test("M13-T05b: matchPattern 通配", () => {
  assert.equal(matchPattern("platform.file.*", "platform.file.read"), true)
  assert.equal(matchPattern("platform.file.*", "platform.python"), false)
  assert.equal(matchPattern("*", "anything"), true)
})
