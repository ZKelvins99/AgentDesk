/**
 * M10 契约测试：SQLite 数据库、Workspace、Session 映射、Runtime Config、崩溃恢复。
 */
import assert from "node:assert/strict"
import { test } from "node:test"
import { tmpdir } from "node:os"
import { rmSync } from "node:fs"
import {
  AgentDeskDatabase,
  WorkspaceStore,
  RuntimeConfigStore,
  CrashRecovery,
} from "../src/index.ts"

test("M10-T01/T02: SQLite 建表 + Workspace CRUD", () => {
  const db = new AgentDeskDatabase(":memory:")
  const store = new WorkspaceStore(db)

  const ws = store.createWorkspace("AgentDesk", "D:\\code_kj\\Agent工具开发\\AgentDesk")
  assert.ok(ws.id.startsWith("ws_"))
  assert.equal(store.listWorkspaces().length, 1)
  assert.equal(store.getWorkspace(ws.id)?.path, "D:\\code_kj\\Agent工具开发\\AgentDesk")
  assert.equal(store.findWorkspaceByPath("D:\\code_kj\\Agent工具开发\\AgentDesk")?.id, ws.id)

  // last_opened_at 刷新
  store.touchWorkspace(ws.id)
  const touched = store.getWorkspace(ws.id)
  assert.ok(touched && touched.lastOpenedAt >= ws.createdAt)

  db.close()
})

test("M10-T03: Session Mapping 保存与反查", () => {
  const db = new AgentDeskDatabase(":memory:")
  const store = new WorkspaceStore(db)
  const ws = store.createWorkspace("ws", "C:\\proj")

  store.bindSession({
    agentdeskSessionId: "opencode:ses_abc",
    runtimeId: "opencode",
    nativeSessionId: "ses_abc",
    workspaceId: ws.id,
  })
  const byAdk = store.getBinding("opencode:ses_abc")
  assert.equal(byAdk?.runtimeId, "opencode")
  assert.equal(byAdk?.workspaceId, ws.id)

  // 按原生 id 反查（崩溃恢复用）
  const byNative = store.getBindingByNative("opencode", "ses_abc")
  assert.equal(byNative?.agentdeskSessionId, "opencode:ses_abc")

  // 幂等：同 runtime+native 重复绑定不产生两行
  store.bindSession({
    agentdeskSessionId: "opencode:ses_abc",
    runtimeId: "opencode",
    nativeSessionId: "ses_abc",
    workspaceId: ws.id,
  })
  assert.equal(store.listBindingsByWorkspace(ws.id).length, 1)

  db.close()
})

test("M10-T04: Runtime Config 独立保存（Native Config 不混入）", () => {
  const db = new AgentDeskDatabase(":memory:")
  const store = new RuntimeConfigStore(db)

  store.save("pi", { defaultWorkspace: "C:\\proj", language: "zh" })
  store.save("opencode", { showPlan: true })

  const pi = store.get("pi")
  assert.deepEqual(pi?.config, { defaultWorkspace: "C:\\proj", language: "zh" })
  const oc = store.get("opencode")
  assert.deepEqual(oc?.config, { showPlan: true })

  db.close()
})

test("M10-T05: Crash Recovery 恢复 Workspace + Session 映射", () => {
  const db = new AgentDeskDatabase(":memory:")
  const store = new WorkspaceStore(db)
  const ws = store.createWorkspace("ws", "C:\\proj")
  store.bindSession({
    agentdeskSessionId: "pi:s1",
    runtimeId: "pi",
    nativeSessionId: "s1",
    workspaceId: ws.id,
  })
  store.bindSession({
    agentdeskSessionId: "opencode:ses_xyz",
    runtimeId: "opencode",
    nativeSessionId: "ses_xyz",
    workspaceId: ws.id,
  })

  const recovery = new CrashRecovery(db)
  const snapshot = recovery.snapshot()
  assert.equal(snapshot.workspaces.length, 1)
  assert.equal(snapshot.bindings.length, 2)

  const groups = recovery.groupBindingsByWorkspace(snapshot)
  const wsBindings = groups.get(ws.id) ?? []
  assert.equal(wsBindings.length, 2)
  assert.ok(wsBindings.some((b) => b.runtimeId === "pi"))
  assert.ok(wsBindings.some((b) => b.runtimeId === "opencode"))

  db.close()
})

test("M10-T05b: 崩溃后新实例可从磁盘恢复", () => {
  const file = `${tmpdir()}\\agentdesk-m10-${Date.now()}.db`
  const db1 = new AgentDeskDatabase(file)
  const store1 = new WorkspaceStore(db1)
  store1.createWorkspace("p", "C:\\proj")
  store1.bindSession({ agentdeskSessionId: "echo:e1", runtimeId: "echo", nativeSessionId: "e1", workspaceId: store1.listWorkspaces()[0].id })
  db1.close()

  // 模拟崩溃后重启：新数据库实例读同一文件
  const db2 = new AgentDeskDatabase(file)
  const store2 = new WorkspaceStore(db2)
  const ws = store2.listWorkspaces()[0]
  assert.equal(ws.name, "p")
  const bindings = store2.listBindingsByWorkspace(ws.id)
  assert.equal(bindings.length, 1)
  assert.equal(bindings[0].runtimeId, "echo")
  db2.close()

  rmSync(file, { force: true })
  rmSync(`${file}-wal`, { force: true })
  rmSync(`${file}-shm`, { force: true })
})
