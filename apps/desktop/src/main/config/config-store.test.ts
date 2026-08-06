import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ConfigStore,
  locateIssueLines,
  parseJsonc,
  piSettingsSchema,
  validateConfig,
} from './config-store';

/** README 4.3 settings.json 字段清单（G7：任意 pi 设置项都能在 UI 改到）。 */
const README_SETTINGS_FIELDS = [
  'defaultProvider',
  'defaultModel',
  'defaultThinkingLevel',
  'thinkingBudgets',
  'enabledModels',
  'hideThinkingBlock',
  'showCacheMissNotices',
  'theme',
  'externalEditor',
  'quietStartup',
  'collapseChangelog',
  'uiMode',
  'fullscreenScrollbar',
  'doubleEscapeAction',
  'treeFilterMode',
  'editorPaddingX',
  'outputPad',
  'autocompleteMaxVisible',
  'showHardwareCursor',
  'defaultProjectTrust',
  'enableInstallTelemetry',
  'enableAnalytics',
  'trackingId',
  'httpProxy',
  'transport',
  'httpIdleTimeoutMs',
  'websocketConnectTimeoutMs',
  'warnings',
  'compaction',
  'branchSummary',
  'retry',
  'steeringMode',
  'followUpMode',
  'terminal',
  'images',
  'shellPath',
  'shellCommandPrefix',
  'npmCommand',
  'sessionDir',
  'markdown',
  'packages',
  'extensions',
  'skills',
  'prompts',
  'themes',
  'enableSkillCommands',
] as const;

describe('config-store（README 4.3 / 9.7 / 16.2）', () => {
  let root: string;
  let agentDir: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'agentdesk-config-'));
    agentDir = path.join(root, 'agent');
    mkdirSync(agentDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const store = (): ConfigStore => new ConfigStore({ agentDir });

  it('parseJsonc 容忍注释与尾逗号，非对象返回 null', () => {
    expect(
      parseJsonc('{\n  // 注释\n  "theme": "dark",\n  "retry": { "enabled": true, },\n}\n'),
    ).toEqual({ theme: 'dark', retry: { enabled: true } });
    expect(parseJsonc('[1,2]')).toBeNull();
    expect(parseJsonc('not json')).toBeNull();
  });

  it('read：文件缺失返回空配置；JSONC 内容解析并校验', () => {
    const missing = store().read('settings', 'global');
    expect(missing.parsed).toEqual({});
    expect(missing.validation).toEqual([]);
    const file = path.join(agentDir, 'settings.json');
    writeFileSync(file, '{\n  // hi\n  "theme": "dark",\n  "retry": { "enabled": true },\n}\n');
    const read = store().read('settings', 'global');
    expect(read.raw).toContain('// hi');
    expect(read.parsed.theme).toBe('dark');
    expect(read.validation).toEqual([]);
  });

  it('validateConfig：错误类型给出带 path 的校验问题', () => {
    const issues = validateConfig('settings', {
      retry: { enabled: 'yes' },
      compaction: { reserveTokens: 'big' },
    });
    expect(issues.some((i) => i.path === 'retry.enabled')).toBe(true);
    expect(issues.some((i) => i.path === 'compaction.reserveTokens')).toBe(true);
    expect(validateConfig('settings', { theme: 'dark' })).toEqual([]);
    expect(validateConfig('models', { providers: {} })).toEqual([]);
  });

  it('locateIssueLines：按 path 末段定位行号', () => {
    const raw = '{\n  "theme": "dark",\n  "retry": {\n    "enabled": "yes"\n  }\n}\n';
    const issues = locateIssueLines(raw, validateConfig('settings', parseJsonc(raw) ?? {}));
    const issue = issues.find((i) => i.path === 'retry.enabled');
    expect(issue?.line).toBe(4);
  });

  it('save：parsed 序列化原子写，校验失败拒绝落盘', () => {
    const s = store();
    const ok = s.save('settings', 'global', { parsed: { theme: 'dark' } });
    expect(ok.saved).toBe(true);
    expect(JSON.parse(readFileSync(path.join(agentDir, 'settings.json'), 'utf8'))).toEqual({
      theme: 'dark',
    });
    const bad = s.save('settings', 'global', {
      parsed: { theme: 'dark', retry: { enabled: 'yes' } },
    });
    expect(bad.saved).toBe(false);
    expect(bad.validation.some((i) => i.path === 'retry.enabled')).toBe(true);
    expect(JSON.parse(readFileSync(path.join(agentDir, 'settings.json'), 'utf8')).retry).toBe(
      undefined,
    );
  });

  it('save：raw 原样写入（保留用户注释），解析失败拒绝', () => {
    const s = store();
    const raw = '{\n  // 手写注释\n  "theme": "light"\n}\n';
    const ok = s.save('settings', 'global', { raw });
    expect(ok.saved).toBe(true);
    expect(readFileSync(path.join(agentDir, 'settings.json'), 'utf8')).toBe(raw);
    const bad = s.save('settings', 'global', { raw: '{"theme":' });
    expect(bad.saved).toBe(false);
    expect(bad.validation[0]?.message).toContain('解析失败');
  });

  it('save：项目作用域写 .pi/settings.json；缺 workspacePath 抛错', () => {
    const workspace = path.join(root, 'ws');
    const s = store();
    const ok = s.save('settings', 'project', { parsed: { theme: 'dark' } }, workspace);
    expect(ok.saved).toBe(true);
    expect(ok.path).toBe(path.join(workspace, '.pi', 'settings.json'));
    expect(() => s.read('settings', 'project')).toThrow('workspacePath');
  });

  it('kernelStatus：二进制不存在时如实上报', async () => {
    const status = await store().kernelStatus(path.join(root, 'missing-pi.exe'));
    expect(status.binaryExists).toBe(false);
    expect(status.agentDir).toBe(agentDir);
    expect(status.version).toBeNull();
  });

  it('G7：piSettingsSchema 覆盖 README 4.3 全部字段（图形表单 + 原始编辑器共用）', () => {
    const shape = piSettingsSchema.shape as Record<string, unknown>;
    for (const field of README_SETTINGS_FIELDS) {
      expect(shape[field], `缺少设置字段：${field}`).toBeDefined();
    }
  });

  it('G7：原始编辑器 passthrough —— 未知顶层字段保存后不丢失', () => {
    const s = store();
    const saved = s.save('settings', 'global', {
      parsed: { theme: 'dark', customField: { a: 1 }, 'x.y': 2 },
    });
    expect(saved.saved).toBe(true);
    const read = s.read('settings', 'global');
    expect(read.parsed.customField).toEqual({ a: 1 });
    expect(read.parsed['x.y']).toBe(2);
    expect(read.parsed.theme).toBe('dark');
  });
});
