import { describe, expect, it } from 'vitest';
import { IPC_CHANNELS, isIpcChannel } from './channels';
import { invokeRequestSchemas } from './contracts';

describe('IPC 白名单', () => {
  it('所有通道都以 domain:action 命名', () => {
    for (const channel of Object.values(IPC_CHANNELS)) {
      expect(channel).toMatch(/^[a-z]+:[a-z-]+$/);
    }
  });

  it('每个 invoke 通道都有对应请求 schema', () => {
    for (const channel of Object.values(IPC_CHANNELS)) {
      expect(invokeRequestSchemas).toHaveProperty(channel);
    }
  });

  it('isIpcChannel 拒绝未知通道', () => {
    expect(isIpcChannel('app:ping')).toBe(true);
    expect(isIpcChannel('shell:exec')).toBe(false);
  });
});
