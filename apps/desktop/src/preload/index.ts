import type { EventMap, InvokeChannel, InvokeMap } from '@agentdesk/ipc';
import { EVENT_CHANNELS, IPC_CHANNELS, isIpcChannel } from '@agentdesk/ipc/channels';
import type { ThinkingLevel } from '@agentdesk/shared';
import { contextBridge, ipcRenderer } from 'electron';

/**
 * 白名单机制：只暴露固定 API 表面，底层一律经过 channel 白名单检查，
 * 未知通道直接拒绝（README 10 / 14.3 新增通道三处同步）。
 * 只导入 channels 常量（避免把 zod 拖进 sandbox preload）。
 */
function safeInvoke<C extends InvokeChannel>(
  channel: C,
  payload: InvokeMap[C]['request'],
): Promise<InvokeMap[C]['response']> {
  if (!isIpcChannel(channel)) {
    throw new Error(`IPC channel not allowed: ${channel}`);
  }
  return ipcRenderer.invoke(channel, payload) as Promise<InvokeMap[C]['response']>;
}

function safeOn<C extends keyof EventMap>(
  channel: C,
  cb: (payload: EventMap[C]) => void,
): () => void {
  if (!isIpcChannel(channel)) {
    throw new Error(`IPC channel not allowed: ${channel}`);
  }
  const h = (_: unknown, p: EventMap[C]) => cb(p);
  ipcRenderer.on(channel, h);
  return () => {
    ipcRenderer.off(channel, h);
  };
}

const api = {
  ping: (nonce?: string) =>
    safeInvoke(IPC_CHANNELS['app:ping'], nonce === undefined ? {} : { nonce }),
  getVersion: () => safeInvoke(IPC_CHANNELS['app:get-version'], undefined),
  window: {
    minimize: () => safeInvoke(IPC_CHANNELS['window:minimize'], undefined),
    maximize: () => safeInvoke(IPC_CHANNELS['window:maximize'], undefined),
    close: () => safeInvoke(IPC_CHANNELS['window:close'], undefined),
  },
  session: {
    create: (req: { workspacePath?: string; model?: string; thinkingLevel?: ThinkingLevel }) =>
      safeInvoke(IPC_CHANNELS['session:create'], req),
    attach: (req: { sessionId: string; sinceSeq?: number }) =>
      safeInvoke(IPC_CHANNELS['session:attach'], req),
    send: (req: { sessionId: string; text: string }) =>
      safeInvoke(IPC_CHANNELS['session:send'], req),
    abort: (req: { sessionId: string }) => safeInvoke(IPC_CHANNELS['session:abort'], req),
    setModel: (req: { sessionId: string; model: string }) =>
      safeInvoke(IPC_CHANNELS['session:set-model'], req),
    getModels: (req: InvokeMap['session:get-models']['request']) =>
      safeInvoke(IPC_CHANNELS['session:get-models'], req),
    setThinkingLevel: (req: InvokeMap['session:set-thinking-level']['request']) =>
      safeInvoke(IPC_CHANNELS['session:set-thinking-level'], req),
    setApprovalMode: (req: InvokeMap['session:set-approval-mode']['request']) =>
      safeInvoke(IPC_CHANNELS['session:set-approval-mode'], req),
    list: (req?: { search?: string; archived?: boolean; limit?: number; offset?: number }) =>
      safeInvoke(IPC_CHANNELS['session:list'], req ?? {}),
    rename: (req: { sessionId: string; title: string }) =>
      safeInvoke(IPC_CHANNELS['session:rename'], req),
    archive: (req: { sessionId: string }) => safeInvoke(IPC_CHANNELS['session:archive'], req),
    delete: (req: { sessionId: string }) => safeInvoke(IPC_CHANNELS['session:delete'], req),
    export: (req: { sessionId: string; format: 'md' | 'json' }) =>
      safeInvoke(IPC_CHANNELS['session:export'], req),
  },
  provider: {
    list: () => safeInvoke(IPC_CHANNELS['provider:list'], undefined),
    save: (req: InvokeMap['provider:save']['request']) =>
      safeInvoke(IPC_CHANNELS['provider:save'], req),
    delete: (req: { name: string }) => safeInvoke(IPC_CHANNELS['provider:delete'], req),
    presets: () => safeInvoke(IPC_CHANNELS['provider:presets'], undefined),
    discoverModels: (req: InvokeMap['provider:discover-models']['request']) =>
      safeInvoke(IPC_CHANNELS['provider:discover-models'], req),
    test: (req: { name: string; model?: string }) => safeInvoke(IPC_CHANNELS['provider:test'], req),
  },
  secrets: {
    status: () => safeInvoke(IPC_CHANNELS['secrets:status'], undefined),
  },
  auth: {
    status: () => safeInvoke(IPC_CHANNELS['auth:status'], undefined),
    launchLogin: (req?: { provider?: string }) =>
      safeInvoke(IPC_CHANNELS['auth:launch-login'], req ?? {}),
  },
  mcp: {
    list: (req?: { workspacePath?: string }) => safeInvoke(IPC_CHANNELS['mcp:list'], req ?? {}),
    save: (req: InvokeMap['mcp:save']['request']) => safeInvoke(IPC_CHANNELS['mcp:save'], req),
    delete: (req: InvokeMap['mcp:delete']['request']) =>
      safeInvoke(IPC_CHANNELS['mcp:delete'], req),
    importServers: (req: InvokeMap['mcp:import']['request']) =>
      safeInvoke(IPC_CHANNELS['mcp:import'], req),
    snapshots: (req?: { workspacePath?: string }) =>
      safeInvoke(IPC_CHANNELS['mcp:snapshots'], req ?? {}),
    test: (req: InvokeMap['mcp:test']['request']) => safeInvoke(IPC_CHANNELS['mcp:test'], req),
    tools: (req: InvokeMap['mcp:tools']['request']) => safeInvoke(IPC_CHANNELS['mcp:tools'], req),
    logs: (req?: InvokeMap['mcp:logs']['request']) =>
      safeInvoke(IPC_CHANNELS['mcp:logs'], req ?? {}),
    export: (req?: { workspacePath?: string }) => safeInvoke(IPC_CHANNELS['mcp:export'], req ?? {}),
  },
  skills: {
    list: (req?: { workspacePath?: string }) => safeInvoke(IPC_CHANNELS['skills:list'], req ?? {}),
    read: (req: InvokeMap['skills:read']['request']) =>
      safeInvoke(IPC_CHANNELS['skills:read'], req),
    setEnabled: (req: InvokeMap['skills:set-enabled']['request']) =>
      safeInvoke(IPC_CHANNELS['skills:set-enabled'], req),
    create: (req: InvokeMap['skills:create']['request']) =>
      safeInvoke(IPC_CHANNELS['skills:create'], req),
    update: (req: InvokeMap['skills:update']['request']) =>
      safeInvoke(IPC_CHANNELS['skills:update'], req),
    validate: (req: InvokeMap['skills:validate']['request']) =>
      safeInvoke(IPC_CHANNELS['skills:validate'], req),
    install: (req: InvokeMap['skills:install']['request']) =>
      safeInvoke(IPC_CHANNELS['skills:install'], req),
    recommended: () => safeInvoke(IPC_CHANNELS['skills:recommended'], undefined),
  },
  approval: {
    respond: (req: InvokeMap['approval:respond']['request']) =>
      safeInvoke(IPC_CHANNELS['approval:respond'], req),
    auditList: (req: InvokeMap['approval:audit-list']['request']) =>
      safeInvoke(IPC_CHANNELS['approval:audit-list'], req),
    auditExport: (req: InvokeMap['approval:audit-export']['request']) =>
      safeInvoke(IPC_CHANNELS['approval:audit-export'], req),
    auditClear: (req: InvokeMap['approval:audit-clear']['request']) =>
      safeInvoke(IPC_CHANNELS['approval:audit-clear'], req),
    rulesList: (req: InvokeMap['approval:rules-list']['request']) =>
      safeInvoke(IPC_CHANNELS['approval:rules-list'], req),
    rulesSave: (req: InvokeMap['approval:rules-save']['request']) =>
      safeInvoke(IPC_CHANNELS['approval:rules-save'], req),
    rulesDelete: (req: InvokeMap['approval:rules-delete']['request']) =>
      safeInvoke(IPC_CHANNELS['approval:rules-delete'], req),
  },
  workspace: {
    add: (req: { path: string }) => safeInvoke(IPC_CHANNELS['workspace:add'], req),
    remove: (req: { workspaceId: string }) => safeInvoke(IPC_CHANNELS['workspace:remove'], req),
    list: () => safeInvoke(IPC_CHANNELS['workspace:list'], undefined),
    open: (req: { workspaceId: string }) => safeInvoke(IPC_CHANNELS['workspace:open'], req),
    trust: (req: { workspaceId: string; decision: 'once' | 'always' | 'alwaysParent' | 'never' }) =>
      safeInvoke(IPC_CHANNELS['workspace:trust'], req),
    pickDirectory: () => safeInvoke(IPC_CHANNELS['workspace:pick-directory'], undefined),
    pickFile: () => safeInvoke(IPC_CHANNELS['workspace:pick-file'], undefined),
  },
  onSessionEvent: (cb: (payload: EventMap['event:session']) => void) =>
    safeOn(EVENT_CHANNELS['event:session'], cb),
  onApprovalEvent: (cb: (payload: EventMap['event:approval']) => void) =>
    safeOn(EVENT_CHANNELS['event:approval'], cb),
  platform: process.platform,
};

contextBridge.exposeInMainWorld('agentdesk', api);
