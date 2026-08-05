/**
 * M17 契约测试：Skill Manifest / Registry / Loader / Native 区分。
 */
import assert from "node:assert/strict"
import { test } from "node:test"
import { tmpdir } from "node:os"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { parseSkillFrontmatter } from "../src/index.ts"
import { SkillRegistry, type PlatformSkill } from "../src/index.ts"
import { loadSkillsFromDir } from "../src/index.ts"

const SAMPLE = `---
name: business-report
description: Create structured business reports
requiredCapabilities:
  - documents
preferredAgents:
  - document-agent
fallbackAgents:
  - pi
  - opencode
version: 1.2.0
---
# business-report

生成结构化商业报告。
`

test("M17-T01: Skill Manifest 解析（frontmatter）", () => {
  const { manifest, body } = parseSkillFrontmatter(SAMPLE)
  assert.ok(manifest)
  assert.equal(manifest?.name, "business-report")
  assert.equal(manifest?.description, "Create structured business reports")
  assert.deepEqual(manifest?.requiredCapabilities, ["documents"])
  assert.deepEqual(manifest?.preferredAgents, ["document-agent"])
  assert.deepEqual(manifest?.fallbackAgents, ["pi", "opencode"])
  assert.equal(manifest?.version, "1.2.0")
  assert.match(body, /生成结构化商业报告/)
})

test("M17-T01b: 无 frontmatter 时返回 body", () => {
  const { manifest, body } = parseSkillFrontmatter("# plain\nno frontmatter")
  assert.equal(manifest, undefined)
  assert.match(body, /plain/)
})

test("M17-T02: Skill Registry register/unregister/list/describeAll", () => {
  const registry = new SkillRegistry()
  const skill: PlatformSkill = {
    id: "platform-skill:business-report",
    name: "business-report",
    description: "Create structured business reports",
    source: "platform",
    path: "/x/SKILL.md",
    body: "content",
  }
  registry.register(skill)
  assert.equal(registry.list().length, 1)
  assert.equal(registry.get("platform-skill:business-report"), skill)

  const views = registry.describeAll([
    { id: "pi-echo", name: "pi-echo", description: "pi skill" },
    { id: "oc-skill", name: "oc-skill", description: "opencode skill", runtimeId: "opencode" },
  ])
  assert.equal(views.length, 3)
  assert.equal(views.find((v) => v.source === "platform")?.name, "business-report")
  assert.equal(views.filter((v) => v.source === "native").length, 2)
  assert.equal(views.find((v) => v.id === "oc-skill")?.runtimeId, "opencode")

  assert.ok(registry.unregister("platform-skill:business-report"))
  assert.equal(registry.list().length, 0)
})

test("M17-T03: Skill Loader 扫描 .agentdesk/skills", () => {
  const ws = mkdtempSync(join(tmpdir(), "m17-"))
  const skillDir = join(ws, ".agentdesk", "skills")
  mkdirSync(join(skillDir, "business-report"), { recursive: true })
  writeFileSync(join(skillDir, "business-report", "SKILL.md"), SAMPLE, "utf8")
  writeFileSync(join(skillDir, "quick-note.md"), "---\nname: quick-note\ndescription: 快速记录\n---\n# quick", "utf8")

  const loaded = loadSkillsFromDir(skillDir)
  assert.equal(loaded.length, 2)
  const report = loaded.find((s) => s.name === "business-report")
  assert.ok(report)
  assert.equal(report?.version, "1.2.0")
  assert.ok(loaded.some((s) => s.name === "quick-note"))
  rmSync(ws, { recursive: true, force: true })
})

test("M17-T04: Native Skill 与 Platform Skill 区分（source 字段）", () => {
  const registry = new SkillRegistry()
  registry.register({
    id: "platform-skill:p",
    name: "p",
    description: "platform",
    source: "platform",
    path: "/p",
    body: "",
  })
  const views = registry.describeAll([
    { id: "pi", name: "pi-native", description: "pi", runtimeId: "pi" },
    { id: "oc", name: "oc-native", description: "oc", runtimeId: "opencode" },
  ])
  const platform = views.filter((v) => v.source === "platform")
  const piNative = views.filter((v) => v.source === "native" && v.runtimeId === "pi")
  const ocNative = views.filter((v) => v.source === "native" && v.runtimeId === "opencode")
  assert.equal(platform.length, 1)
  assert.equal(piNative.length, 1)
  assert.equal(ocNative.length, 1)
})
