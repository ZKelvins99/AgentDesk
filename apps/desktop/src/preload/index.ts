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
    attach: (req: { sessionId: string }) => safeInvoke(IPC_CHANNELS['session:attach'], req),
    send: (req: { sessionId: string; text: string }) =>
      safeInvoke(IPC_CHANNELS['session:send'], req),
    abort: (req: { sessionId: string }) => safeInvoke(IPC_CHANNELS['session:abort'], req),
    setModel: (req: { sessionId: string; model: string }) =>
      safeInvoke(IPC_CHANNELS['session:set-model'], req),
  },
  onSessionEvent: (cb: (payload: EventMap['event:session']) => void) =>
    safeOn(EVENT_CHANNELS['event:session'], cb),
  platform: process.platform,
};

contextBridge.exposeInMainWorld('agentdesk', api);
