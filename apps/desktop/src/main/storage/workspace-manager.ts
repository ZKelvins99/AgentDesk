import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { SessionStore, TrustDecision, WorkspaceRecord } from './session-store';

/**
 * Workspace 管理 + 信任（README 8.9 / 11.2 / R3）：
 * - 决策写入 AgentDesk DB，并镜像到 pi 的 `~/.pi/agent/trust.json`
 * - TrustGate：spawn 时显式传 -a / -na（由 SessionManager 消费 resolveTrustForSpawn）
 */

export interface WorkspaceManagerOptions {
  store: SessionStore;
  /** pi agent 目录（默认 ~/.pi/agent），trust.json 镜像写在这里 */
  agentDir?: string;
}

interface TrustJsonEntry {
  trust: boolean;
  scope: 'workspace' | 'parent';
  source: 'agentdesk';
  updatedAt: number;
}
type TrustJson = Record<string, TrustJsonEntry>;

export class WorkspaceManager {
  private readonly store: SessionStore;
  private readonly trustJsonPath: string;

  constructor(options: WorkspaceManagerOptions) {
    this.store = options.store;
    const agentDir =
      options.agentDir ??
      path.join(process.env.HOME ?? process.env.USERPROFILE ?? '', '.pi', 'agent');
    this.trustJsonPath = path.join(agentDir, 'trust.json');
  }

  add(rawPath: string): { workspace: WorkspaceRecord; needsTrust: boolean } {
    return this.store.upsertWorkspace(rawPath);
  }

  list(): WorkspaceRecord[] {
    return this.store.listWorkspaces();
  }

  remove(id: string): void {
    this.store.removeWorkspace(id);
  }

  open(id: string): WorkspaceRecord | null {
    this.store.touchWorkspace(id);
    return this.store.getWorkspace(id);
  }

  /** 记录信任决策：写 DB + 镜像 pi trust.json（README 8.9）。 */
  trust(id: string, decision: TrustDecision): void {
    this.store.setWorkspaceTrust(id, decision);
    const ws = this.store.getWorkspace(id);
    if (!ws) return;
    this.mirrorTrustJson(ws, decision);
  }

  /** TrustGate：按 DB 决策解析 spawn 参数（未知一律 deny，杜绝资源静默失效）。 */
  resolveTrustForSpawn(rawPath: string): 'allow' | 'deny' {
    const ws = this.store.getWorkspaceByPath(rawPath);
    if (!ws) return 'deny';
    switch (ws.trust) {
      case 'always':
      case 'alwaysParent':
      case 'once':
        return 'allow';
      default:
        return 'deny';
    }
  }

  private mirrorTrustJson(ws: WorkspaceRecord, decision: TrustDecision): void {
    if (decision === 'once') return; // 本次信任不写持久镜像
    let json: TrustJson = {};
    try {
      json = JSON.parse(readFileSync(this.trustJsonPath, 'utf8')) as TrustJson;
    } catch {
      // 文件不存在或损坏：从空对象重建
    }
    const now = Date.now();
    const target =
      decision === 'alwaysParent'
        ? path.dirname(ws.path.replace(/[\\/]+$/, ''))
        : ws.path.replace(/[\\/]+$/, '');
    json[target] = {
      trust: decision !== 'never',
      scope: decision === 'alwaysParent' ? 'parent' : 'workspace',
      source: 'agentdesk',
      updatedAt: now,
    };
    mkdirSync(path.dirname(this.trustJsonPath), { recursive: true });
    const tmp = `${this.trustJsonPath}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
    renameSync(tmp, this.trustJsonPath);
  }
}
