import { getPlatform } from './platform';

/**
 * 快捷键文案本地化。
 * 代码里统一用 mac 记法（⌘⇧X）书写，展示时按平台改写。
 */

/** 把 mac 记法转成当前平台的显示文案（Windows/Linux → Ctrl+Shift+X）。 */
export function shortcut(mac: string): string {
  if (getPlatform() === 'darwin') return mac;
  return mac
    .replaceAll('⌘', 'Ctrl+')
    .replaceAll('⇧', 'Shift+')
    .replaceAll('⌥', 'Alt+')
    .replaceAll('⌫', 'Backspace')
    .replace(/\+\+/g, '+');
}
