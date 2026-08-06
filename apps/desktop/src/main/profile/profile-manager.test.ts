import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigStore } from '../config/config-store';
import { PackageManager } from '../packages/package-manager';
import { DEFAULT_PROFILE_ID, isSafeProfileId, ProfileManager, slugify } from './profile-manager';

interface Fixture {
  manager: ProfileManager;
  root: string;
  stateFile: string;
  defaultAgentDir: string;
}

function makeFixture(): Fixture {
  const root = mkdtempSync(path.join(tmpdir(), 'agentdesk-profile-'));
  const stateFile = path.join(root, 'profile.json');
  const defaultAgentDir = mkdtempSync(path.join(tmpdir(), 'agentdesk-default-agent-'));
  const manager = new ProfileManager({ profilesRoot: root, stateFile, defaultAgentDir });
  return { manager, root, stateFile, defaultAgentDir };
}

describe('slugify / isSafeProfileId', () => {
  it('slugify：小写、非法字符折叠为 -、去首尾 -、空回退 profile', () => {
    expect(slugify('My Test Profile!')).toBe('my-test-profile');
    expect(slugify('  My   Test!!  ')).toBe('my-test');
    expect(slugify('实验档')).toBe('profile');
    expect(slugify('a'.repeat(100))).toHaveLength(64);
  });

  it('isSafeProfileId：拒绝空、大写、点、路径穿越与超长', () => {
    expect(isSafeProfileId('alpha')).toBe(true);
    expect(isSafeProfileId('a-b_c1')).toBe(true);
    expect(isSafeProfileId('')).toBe(false);
    expect(isSafeProfileId('Alpha')).toBe(false);
    expect(isSafeProfileId('a/b')).toBe(false);
    expect(isSafeProfileId('..')).toBe(false);
    expect(isSafeProfileId('a'.repeat(65))).toBe(false);
  });
});

describe('ProfileManager（README 8.8.3 / 4.15）', () => {
  it('无状态文件时 list 只含默认档且为激活', () => {
    const { manager, defaultAgentDir } = makeFixture();
    expect(manager.activeId()).toBe(DEFAULT_PROFILE_ID);
    expect(manager.currentAgentDir()).toBe(defaultAgentDir);
    expect(manager.list()).toEqual([
      expect.objectContaining({
        id: DEFAULT_PROFILE_ID,
        isDefault: true,
        active: true,
        agentDir: defaultAgentDir,
      }),
    ]);
  });

  it('create 建隔离 agent 目录与元数据，重复 slug 报错', () => {
    const { manager, root } = makeFixture();
    const view = manager.create('My Test Profile');
    expect(view.id).toBe('my-test-profile');
    expect(view.name).toBe('My Test Profile');
    expect(view.isDefault).toBe(false);
    expect(view.active).toBe(false);
    expect(view.exists).toBe(true);
    expect(existsSync(path.join(root, 'my-test-profile', 'agent'))).toBe(true);
    const meta = JSON.parse(
      readFileSync(path.join(root, 'my-test-profile', 'profile.json'), 'utf8'),
    ) as {
      name: string;
    };
    expect(meta.name).toBe('My Test Profile');
    expect(() => manager.create('my test profile!')).toThrow(/已存在/);
  });

  it('create 拒绝空名称与 default 保留名', () => {
    const { manager } = makeFixture();
    expect(() => manager.create('   ')).toThrow(/不能为空/);
    expect(() => manager.create('Default')).toThrow(/default/);
  });

  it('switch 持久化激活状态并返回新 Agent Dir；list 随之更新', () => {
    const { manager, root } = makeFixture();
    const created = manager.create('Isolated');
    const agentDir = manager.switch(created.id);
    expect(agentDir).toBe(path.join(root, 'isolated', 'agent'));
    expect(manager.activeId()).toBe('isolated');
    expect(manager.currentAgentDir()).toBe(agentDir);
    expect(JSON.parse(readFileSync(path.join(root, 'profile.json'), 'utf8'))).toEqual({
      activeId: 'isolated',
    });
    const active = manager.list().find((p) => p.id === 'isolated');
    expect(active?.active).toBe(true);
    expect(manager.list().find((p) => p.isDefault)?.active).toBe(false);
  });

  it('switch 回默认档、拒绝不存在档与非法 id', () => {
    const { manager, defaultAgentDir } = makeFixture();
    manager.create('Other');
    expect(manager.switch(DEFAULT_PROFILE_ID)).toBe(defaultAgentDir);
    expect(() => manager.switch('nope')).toThrow(/不存在/);
    expect(() => manager.switch('../evil')).toThrow(/非法/);
  });

  it('delete 拒绝默认档 / 激活档 / 非法 id / 不存在档', () => {
    const { manager } = makeFixture();
    manager.create('Doomed');
    expect(() => manager.delete(DEFAULT_PROFILE_ID)).toThrow(/默认/);
    expect(() => manager.delete('../evil')).toThrow(/非法/);
    expect(() => manager.delete('nope')).toThrow(/不存在/);
    manager.switch('doomed');
    expect(() => manager.delete('doomed')).toThrow(/激活/);
  });

  it('delete 只删非激活隔离档且目录消失', () => {
    const { manager, root } = makeFixture();
    manager.create('Keep');
    manager.create('Doomed');
    manager.switch('keep');
    manager.delete('doomed');
    expect(existsSync(path.join(root, 'doomed'))).toBe(false);
    expect(existsSync(path.join(root, 'keep'))).toBe(true);
    expect(
      manager
        .list()
        .map((p) => p.id)
        .sort(),
    ).toEqual(['default', 'keep']);
  });

  it('损坏状态文件回退默认档', () => {
    const { manager, stateFile, defaultAgentDir } = makeFixture();
    manager.create('X');
    manager.switch('x');
    writeFileSync(stateFile, '{oops');
    expect(manager.activeId()).toBe(DEFAULT_PROFILE_ID);
    expect(manager.currentAgentDir()).toBe(defaultAgentDir);
  });

  it('G7：切 Profile 后两套配置互不影响（ConfigStore/PackageManager 各自 agentDir）', () => {
    const { manager, defaultAgentDir } = makeFixture();
    const created = manager.create('Demo');
    const defaultStore = new ConfigStore({ agentDir: defaultAgentDir });
    const isolatedStore = new ConfigStore({ agentDir: created.agentDir });

    expect(defaultStore.save('settings', 'global', { parsed: { theme: 'dark' } }).saved).toBe(true);
    expect(isolatedStore.save('settings', 'global', { parsed: { theme: 'light' } }).saved).toBe(
      true,
    );
    expect(defaultStore.read('settings', 'global').parsed.theme).toBe('dark');
    expect(isolatedStore.read('settings', 'global').parsed.theme).toBe('light');
    expect(existsSync(path.join(defaultAgentDir, 'settings.json'))).toBe(true);
    expect(existsSync(path.join(created.agentDir, 'settings.json'))).toBe(true);

    manager.switch(created.id);
    expect(manager.currentAgentDir()).toBe(created.agentDir);
    const switchedStore = new ConfigStore({ agentDir: manager.currentAgentDir() });
    expect(switchedStore.read('settings', 'global').parsed.theme).toBe('light');

    const defaultPm = new PackageManager({ agentDir: defaultAgentDir });
    const isolatedPm = new PackageManager({ agentDir: created.agentDir });
    expect(defaultPm.globalSettingsFile()).not.toBe(isolatedPm.globalSettingsFile());
    expect(defaultPm.globalSettingsFile()).toBe(path.join(defaultAgentDir, 'settings.json'));
    expect(isolatedPm.globalSettingsFile()).toBe(path.join(created.agentDir, 'settings.json'));
  });
});
