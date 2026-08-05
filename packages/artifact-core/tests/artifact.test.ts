/**
 * M11 契约测试：Artifact 定义/类型/存储/版本/血缘/事件/删除策略。
 */
import assert from "node:assert/strict"
import { test } from "node:test"
import { AgentDeskDatabase } from "@agentdesk/storage-core"
import { ArtifactStore } from "../src/index.ts"
import { ARTIFACT_TYPES, mimeForType, toArtifactRef } from "../src/index.ts"

test("M11-T01/T02: Artifact 定义 + ArtifactType 枚举", () => {
  assert.ok(ARTIFACT_TYPES.includes("code"))
  assert.ok(ARTIFACT_TYPES.includes("text"))
  assert.ok(ARTIFACT_TYPES.includes("document"))
  assert.ok(ARTIFACT_TYPES.includes("spreadsheet"))
  assert.ok(ARTIFACT_TYPES.includes("slides"))
  assert.ok(ARTIFACT_TYPES.includes("pdf"))
  assert.ok(ARTIFACT_TYPES.includes("image"))
  assert.ok(ARTIFACT_TYPES.includes("chart"))
  assert.ok(ARTIFACT_TYPES.includes("dataset"))
  assert.ok(ARTIFACT_TYPES.includes("html"))
  assert.equal(mimeForType("pdf"), "application/pdf")
})

test("M11-T03/T04: Artifact Store 创建 + 版本递增 + 历史保留", () => {
  const db = new AgentDeskDatabase(":memory:")
  const store = new ArtifactStore(db)
  const created = store.create({
    type: "code",
    title: "demo.ts",
    uri: "file:///proj/demo.ts",
    ownerRuntimeId: "opencode",
    ownerAgentId: "build",
  })
  assert.equal(created.version, 1)

  const v2 = store.update(created.id, { title: "demo.ts v2", metadata: { lines: 99 } })
  assert.ok(v2)
  assert.equal(v2.version, 2)
  assert.equal(store.versions(created.id).length, 2)
  assert.equal(store.get(created.id, 1)?.title, "demo.ts")
  assert.equal(store.get(created.id, 2)?.metadata.lines, 99)
  assert.equal(store.getLatest(created.id)?.version, 2)
  assert.equal(store.list().length, 1)
  db.close()
})

test("M11-T05: artifact.created / artifact.updated 事件", () => {
  const db = new AgentDeskDatabase(":memory:")
  const store = new ArtifactStore(db)
  const events: string[] = []
  store.subscribe((e) => events.push(e.type))
  const art = store.create({ type: "text", title: "note", uri: "file:///note.txt" })
  store.update(art.id, { title: "note v2" })
  assert.deepEqual(events, ["artifact.created", "artifact.updated"])
  db.close()
})

test("M11-T06: owner runtime/agent 记录与按 owner 查询", () => {
  const db = new AgentDeskDatabase(":memory:")
  const store = new ArtifactStore(db)
  store.create({ type: "pdf", title: "r.pdf", uri: "file:///r.pdf", ownerRuntimeId: "pi", ownerAgentId: "agent1" })
  store.create({ type: "image", title: "img.png", uri: "file:///img.png", ownerRuntimeId: "opencode" })
  assert.equal(store.listByOwner("pi").length, 1)
  assert.equal(store.listByOwner("pi")[0].ownerAgentId, "agent1")
  assert.equal(store.listByOwner("opencode").length, 1)
  db.close()
})

test("M11-T07: lineage 血缘展开", () => {
  const db = new AgentDeskDatabase(":memory:")
  const store = new ArtifactStore(db)
  const base = store.create({ type: "dataset", title: "raw.csv", uri: "file:///raw.csv" })
  const mid = store.create({ type: "dataset", title: "clean.csv", uri: "file:///clean.csv", parentIds: [base.id] })
  const final = store.create({ type: "chart", title: "chart.svg", uri: "file:///chart.svg", parentIds: [mid.id] })
  const chain = store.lineage(final.id)
  assert.deepEqual(chain.map((a) => a.id), [final.id, mid.id, base.id])
  db.close()
})

test("M11-T08: 删除 + 版本裁剪（retention）", () => {
  const db = new AgentDeskDatabase(":memory:")
  const store = new ArtifactStore(db, { maxVersions: 3 })
  const art = store.create({ type: "text", title: "t", uri: "file:///t.txt" })
  for (let i = 2; i <= 5; i++) store.update(art.id, { title: `t v${i}` })
  const kept = store.versions(art.id)
  assert.equal(kept.length, 3) // v3/v4/v5
  assert.equal(kept[kept.length - 1].version, 5)
  assert.ok(store.delete(art.id))
  assert.equal(store.getLatest(art.id), undefined)
  assert.equal(store.delete(art.id), false)
  db.close()
})

test("M11: toArtifactRef 稳定引用", () => {
  const db = new AgentDeskDatabase(":memory:")
  const store = new ArtifactStore(db)
  const art = store.create({ type: "spreadsheet", title: "s.xlsx", uri: "file:///s.xlsx", ownerRuntimeId: "pi" })
  const ref = toArtifactRef(art)
  assert.equal(ref.id, art.id)
  assert.equal(ref.kind, "spreadsheet")
  assert.equal(ref.createdBy, "pi")
  assert.equal(ref.mime, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
  db.close()
})
