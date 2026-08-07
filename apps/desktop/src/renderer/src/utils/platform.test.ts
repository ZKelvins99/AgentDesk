import { afterEach, describe, expect, it } from 'vitest';
import {
  isEditableTarget,
  isMac,
  isModKey,
  isWindowsFamily,
  setPlatformForTests,
} from './platform';
import { shortcut } from './shortcut';

describe('platform + shortcut', () => {
  afterEach(() => setPlatformForTests(null));

  it('darwin: mod = meta, shortcut 保留 ⌘', () => {
    setPlatformForTests('darwin');
    expect(isMac()).toBe(true);
    expect(isWindowsFamily()).toBe(false);
    expect(isModKey({ metaKey: true, ctrlKey: false })).toBe(true);
    expect(isModKey({ metaKey: false, ctrlKey: true })).toBe(false);
    expect(shortcut('⌘⇧K')).toBe('⌘⇧K');
  });

  it('win32: mod = ctrl, shortcut 改写为 Ctrl+', () => {
    setPlatformForTests('win32');
    expect(isMac()).toBe(false);
    expect(isWindowsFamily()).toBe(true);
    expect(isModKey({ metaKey: true, ctrlKey: false })).toBe(false);
    expect(isModKey({ metaKey: false, ctrlKey: true })).toBe(true);
    expect(shortcut('⌘⇧K')).toBe('Ctrl+Shift+K');
  });

  it('linux 与 Windows 同套', () => {
    setPlatformForTests('linux');
    expect(isWindowsFamily()).toBe(true);
    expect(isModKey({ metaKey: false, ctrlKey: true })).toBe(true);
    expect(shortcut('⌘K')).toBe('Ctrl+K');
  });

  it('isEditableTarget 对 null 为 false', () => {
    expect(isEditableTarget(null)).toBe(false);
  });
});
