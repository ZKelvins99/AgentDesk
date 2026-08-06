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
  'session:create': 'session:create',
  'session:attach': 'session:attach',
  'session:send': 'session:send',
  'session:abort': 'session:abort',
  'session:set-model': 'session:set-model',
  'session:list': 'session:list',
  'session:rename': 'session:rename',
  'session:archive': 'session:archive',
  'session:delete': 'session:delete',
  'session:export': 'session:export',
  'workspace:add': 'workspace:add',
  'workspace:remove': 'workspace:remove',
  'workspace:list': 'workspace:list',
  'workspace:open': 'workspace:open',
  'workspace:trust': 'workspace:trust',
  'workspace:pick-directory': 'workspace:pick-directory',
  'provider:list': 'provider:list',
  'provider:save': 'provider:save',
  'provider:delete': 'provider:delete',
  'provider:presets': 'provider:presets',
  'provider:discover-models': 'provider:discover-models',
  'provider:test': 'provider:test',
  'secrets:status': 'secrets:status',
  'auth:status': 'auth:status',
  'auth:launch-login': 'auth:launch-login',
  'session:get-models': 'session:get-models',
  'session:set-thinking-level': 'session:set-thinking-level',
} as const;

/** 请求/响应通道（invoke） */
export const INVOKE_CHANNELS = IPC_CHANNELS;

/** 事件推送通道（主 → 渲染，单向 send） */
export const EVENT_CHANNELS = {
  'event:session': 'event:session',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
export type InvokeChannel = keyof typeof INVOKE_CHANNELS;
export type EventChannel = keyof typeof EVENT_CHANNELS;

export const ALL_IPC_CHANNELS = [
  ...Object.values(IPC_CHANNELS),
  ...Object.values(EVENT_CHANNELS),
] as const;

export function isIpcChannel(channel: string): channel is IpcChannel | EventChannel {
  return (ALL_IPC_CHANNELS as readonly string[]).includes(channel);
}
