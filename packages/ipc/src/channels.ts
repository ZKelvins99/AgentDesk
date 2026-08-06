/**
 * IPC 通道常量。README 16.1：IPC 通道命名 `domain:action`。
 * 新增通道必须同时出现在这里、InvokeMap/EventMap 与 preload 白名单中（CI 检查）。
 */
export const IPC_CHANNELS = {
  'app:ping': 'app:ping',
  'app:get-version': 'app:get-version',
  'window:minimize': 'window:minimize',
  'window:maximize': 'window:maximize',
  'window:close': 'window:close',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

export const ALL_IPC_CHANNELS = Object.values(IPC_CHANNELS);

export function isIpcChannel(channel: string): channel is IpcChannel {
  return (ALL_IPC_CHANNELS as readonly string[]).includes(channel);
}
