import { create } from 'zustand';
import type { WorkspaceRecord } from '../types';

export type TrustDecision = 'once' | 'always' | 'alwaysParent' | 'never';

interface WorkspaceStore {
  workspaces: WorkspaceRecord[];
  pendingTrust: WorkspaceRecord | null;
  loaded: boolean;
  loadWorkspaces: () => Promise<void>;
  addWorkspace: (path: string) => Promise<void>;
  pickAndAdd: () => Promise<void>;
  removeWorkspace: (id: string) => Promise<void>;
  openWorkspace: (id: string) => Promise<void>;
  trustDecision: (decision: TrustDecision) => Promise<void>;
  cancelTrust: () => void;
}

/** Workspace 列表 + 信任流程（README 8.9）：决策后写入 DB 并镜像 pi trust.json。 */
export const useWorkspaceStore = create<WorkspaceStore>()((set, get) => ({
  workspaces: [],
  pendingTrust: null,
  loaded: false,

  loadWorkspaces: async () => {
    const { workspaces } = await window.agentdesk.workspace.list();
    set({ workspaces, loaded: true });
  },

  addWorkspace: async (path) => {
    const { workspace, needsTrust } = await window.agentdesk.workspace.add({ path });
    await get().loadWorkspaces();
    if (needsTrust) set({ pendingTrust: workspace });
  },

  pickAndAdd: async () => {
    const { path } = await window.agentdesk.workspace.pickDirectory();
    if (path) await get().addWorkspace(path);
  },

  removeWorkspace: async (id) => {
    await window.agentdesk.workspace.remove({ workspaceId: id });
    await get().loadWorkspaces();
  },

  openWorkspace: async (id) => {
    await window.agentdesk.workspace.open({ workspaceId: id });
    await get().loadWorkspaces();
  },

  trustDecision: async (decision) => {
    const pending = get().pendingTrust;
    if (!pending) return;
    await window.agentdesk.workspace.trust({ workspaceId: pending.id, decision });
    set({ pendingTrust: null });
    await get().loadWorkspaces();
  },

  cancelTrust: () => set({ pendingTrust: null }),
}));
