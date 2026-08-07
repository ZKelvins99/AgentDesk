/**
 * 平台检测唯一出口（前端现代化提示词 3.1）。
 * 只允许读 window.agentdesk.platform，禁止 navigator 嗅探。
 */

export type AgentDeskPlatform = 'darwin' | 'win32' | 'linux';

/** 可注入的平台源，便于单测双向覆盖 darwin / win32。 */
let platformOverride: AgentDeskPlatform | null = null;

export function setPlatformForTests(platform: AgentDeskPlatform | null): void {
  platformOverride = platform;
}

export function getPlatform(): AgentDeskPlatform {
  if (platformOverride) return platformOverride;
  const p = window.agentdesk?.platform;
  if (p === 'darwin' || p === 'win32' || p === 'linux') return p;
  return 'win32';
}

export function isMac(): boolean {
  return getPlatform() === 'darwin';
}

/** Windows 与 Linux 共用同一套修饰键 / 图标（提示词 3.1）。 */
export function isWindowsFamily(): boolean {
  return !isMac();
}

/** 应用级修饰键：macOS = meta(Cmd)，Win/Linux = ctrl。 */
export function isModKey(e: Pick<KeyboardEvent, 'metaKey' | 'ctrlKey'>): boolean {
  return isMac() ? e.metaKey : e.ctrlKey;
}

/** 是否处于可编辑输入焦点（全局快捷键应让路）。 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof HTMLElement === 'undefined') return false;
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}
