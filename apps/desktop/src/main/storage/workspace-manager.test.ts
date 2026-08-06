import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from './db';
import { SessionStore } from './session-store';
import { WorkspaceManager } from './workspace-manager';

describe('WorkspaceManager（README 8.9 / R3：信任决策 + trust.json 镜像 + TrustGate）', () => {
  let root: string;
  let store: SessionStore;
  let workspaces: WorkspaceManager;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'agentdesk-ws-'));
    store = new SessionStore(
      openDatabase(path.join(root, 'agentdesk.db')),
      path.join(root, 'exports'),
    );
    workspaces = new WorkspaceManager({ store, agentDir: path.join(root, 'agent') });
  });

  afterEach(() => {
    store.close();
    rmSync(root, { recursive: true, force: true });
  });

  it('添加 workspace：needsTrust 提示 + 未知信任默认 deny（安全默认）', () => {
    const { workspace, needsTrust } = workspaces.add(path.join(root, 'proj'));
    expect(needsTrust).toBe(true);
    expect(workspace.trust).toBe('unknown');
    expect(workspaces.resolveTrustForSpawn(workspace.path)).toBe('deny');
  });

  it('always：spawn 解析为 allow，trust.json 写入 workspace 级 true', () => {
    const { workspace } = workspaces.add(path.join(root, 'proj'));
    workspaces.trust(workspace.id, 'always');
    expect(workspaces.resolveTrustForSpawn(workspace.path)).toBe('allow');
    const json = JSON.parse(readFileSync(path.join(root, 'agent', 'trust.json'), 'utf8')) as Record<
      string,
      { trust: boolean; scope: string; source: string }
    >;
    expect(json[workspace.path]?.trust).toBe(true);
    expect(json[workspace.path]?.scope).toBe('workspace');
    expect(json[workspace.path]?.source).toBe('agentdesk');
  });

  it('alwaysParent：写入父目录级 true，父目录内其他项目也 allow', () => {
    const parent = path.join(root, 'parent');
    const proj = path.join(parent, 'child');
    const { workspace } = workspaces.add(proj);
    workspaces.trust(workspace.id, 'alwaysParent');
    const json = JSON.parse(readFileSync(path.join(root, 'agent', 'trust.json'), 'utf8')) as Record<
      string,
      { trust: boolean; scope: string }
    >;
    expect(json[parent]?.trust).toBe(true);
    expect(json[parent]?.scope).toBe('parent');
    const sibling = path.join(parent, 'sibling');
    workspaces.add(sibling);
    // sibling 自身仍未知 → deny（镜像仅供 pi 侧语义对齐；AgentDesk TrustGate 以 DB 为准）
    expect(workspaces.resolveTrustForSpawn(sibling)).toBe('deny');
  });

  it('never：解析为 deny，镜像写入 false', () => {
    const { workspace } = workspaces.add(path.join(root, 'proj'));
    workspaces.trust(workspace.id, 'never');
    expect(workspaces.resolveTrustForSpawn(workspace.path)).toBe('deny');
    const json = JSON.parse(readFileSync(path.join(root, 'agent', 'trust.json'), 'utf8')) as Record<
      string,
      { trust: boolean }
    >;
    expect(json[workspace.path]?.trust).toBe(false);
  });

  it('once：仅本次允许，不写持久镜像；重启（新实例）后回 unknown', () => {
    const { workspace } = workspaces.add(path.join(root, 'proj'));
    workspaces.trust(workspace.id, 'once');
    expect(workspaces.resolveTrustForSpawn(workspace.path)).toBe('allow');
    expect(() => readFileSync(path.join(root, 'agent', 'trust.json'), 'utf8')).toThrow();
    store.resetOnceTrust();
    expect(workspaces.resolveTrustForSpawn(workspace.path)).toBe('deny');
  });
});
