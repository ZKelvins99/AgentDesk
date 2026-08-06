import type { InvokeMap, IpcChannel } from '@agentdesk/ipc';
import { IPC_CHANNELS, isIpcChannel } from '@agentdesk/ipc/channels';
import { contextBridge, ipcRenderer } from 'electron';

/**
 * 白名单机制：只暴露固定 API 表面，底层一律经过 channel 白名单检查，
 * 未知通道直接拒绝（README 10 / 14.3 新增通道三处同步）。
 */
function safeInvoke<C extends IpcChannel>(
  channel: C,
  payload: InvokeMap[C]['request'],
): Promise<InvokeMap[C]['response']> {
  if (!isIpcChannel(channel)) {
    throw new Error(`IPC channel not allowed: ${channel}`);
  }
  return ipcRenderer.invoke(channel, payload) as Promise<InvokeMap[C]['response']>;
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
};

contextBridge.exposeInMainWorld('agentdesk', api);
