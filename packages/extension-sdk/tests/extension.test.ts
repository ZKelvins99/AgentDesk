/**
 * M21 契约测试：Extension API / Manifest / Loader / Permission。
 */
import assert from "node:assert/strict"
import { test } from "node:test"
import { tmpdir } from "node:os"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { ExtensionRegistry } from "../src/index.ts"
import { loadExtensionsFromDir } from "../src/index.ts"

test("M21-T01: Extension API 注册全部能力", () => {
  const registry = new ExtensionRegistry()
  const api = registry.createAPI({ id: "ext:demo", name: "Demo", version: "1.0.0" }, ["ui", "tool"])
  api.registerRuntime({ id: "ext-runtime", displayName: "Ext Runtime", version: "1.0.0" })
  api.registerAgent({ id: "ext-agent", name: "Ext Agent", runtimeId: "ext-runtime" })
  api.registerTool({ id: "ext.tool", description: "t", inputSchema: {}, execute: async () => ({ ok: true }) })
  api.registerSkill({ name: "ext-skill", description: "s", body: "# s" })
  api.registerArtifactRenderer({ type: "image", renderer: async () => "<img/>" })
  api.registerCommand({ name: "extcmd", handler: async () => {} })
  api.registerSidebarPanel({ id: "ext-panel", title: "Ext", render: async () => "<div/>" })

  assert.equal(registry.runtimes.length, 1)
  assert.equal(registry.agents.length, 1)
  assert.equal(registry.tools.length, 1)
  assert.equal(registry.skills.length, 1)
  assert.equal(registry.artifactRenderers.length, 1)
  assert.equal(registry.commands.length, 1)
  assert.equal(registry.sidebarPanels.length, 1)
})

test("M21-T02: Extension Manifest 结构", () => {
  const registry = new ExtensionRegistry()
  const api = registry.createAPI({ id: "ext:x", name: "X", version: "0.1.0" }, ["filesystem"])
  assert.equal(api.manifest.name, "X")
  assert.equal(api.permissions.has("filesystem"), true)
  assert.equal(api.permissions.has("shell"), false)
})

test("M21-T03: Extension Loader 扫描 .agentdesk/extensions", () => {
  const ws = mkdtempSync(join(tmpdir(), "m21-"))
  const extDir = join(ws, ".agentdesk", "extensions", "my-ext")
  mkdirSync(extDir, { recursive: true })
  writeFileSync(join(extDir, "extension.json"), JSON.stringify({
    id: "ext:my-ext",
    name: "My Ext",
    version: "2.0.0",
    permissions: ["filesystem", "network"],
    entry: "index.ts",
  }), "utf8")
  writeFileSync(join(extDir, "index.ts"), "export default (api) => {}", "utf8")
  mkdirSync(join(ws, ".agentdesk", "extensions", "broken"), { recursive: true })
  writeFileSync(join(ws, ".agentdesk", "extensions", "broken", "extension.json"), "{not-json", "utf8")

  const loaded = loadExtensionsFromDir(join(ws, ".agentdesk", "extensions"))
  assert.equal(loaded.length, 1)
  assert.equal(loaded[0].manifest.name, "My Ext")
  assert.deepEqual(loaded[0].manifest.permissions, ["filesystem", "network"])
  rmSync(ws, { recursive: true, force: true })
})

test("M21-T04: 权限声明与运行时检查", () => {
  const registry = new ExtensionRegistry()
  const api = registry.createAPI({ id: "ext:safe", name: "Safe", version: "1.0.0" }, ["ui"])
  assert.equal(api.permissions.has("ui"), true)
  assert.equal(api.permissions.has("runtime"), false)
  const all = registry.createAPI({ id: "ext:all", name: "All", version: "1.0.0" }, ["filesystem", "network", "shell", "runtime", "ui"])
  assert.equal(all.permissions.has("shell"), true)
})
