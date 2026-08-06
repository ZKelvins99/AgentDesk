/**
 * 快捷键文案本地化。
 *
 * 代码里统一用 mac 记法（⌘⇧X）书写，展示时按平台改写；
 * Windows/Linux 上直接显示 ⌘ 会让用户找不到对应按键。
 */

/** 把 mac 记法转成当前平台的显示文案（Windows/Linux → Ctrl+Shift+X）。 */
export function shortcut(mac: string): string {
  if (window.agentdesk.platform === 'darwin') return mac;
  return mac.replace('⌘', 'Ctrl+').replace('⇧', 'Shift+');
}
