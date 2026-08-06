import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  collectExtensionEntries,
  ExtensionCompatService,
  ExtensionCompatTracker,
  scanExtensionSource,
} from './extension-compat';

describe('scanExtensionSource（README 8.5.2 静态扫描）', () => {
  it('只用 FULL API → FULL 且无 issue', () => {
    const report = scanExtensionSource(`
      export default function ext(pi) {
        pi.registerTool({ name: 't', run: () => {} });
        pi.on('agent_start', () => {});
        pi.ui.confirm({ text: 'ok?' });
      }
    `);
    expect(report.level).toBe('FULL');
    expect(report.issues).toEqual([]);
  });

  it('setStatus → PARTIAL', () => {
    const report = scanExtensionSource("pi.setStatus('thinking...');");
    expect(report.level).toBe('PARTIAL');
    expect(report.issues[0]).toMatchObject({ api: 'setStatus', level: 'PARTIAL', line: 1 });
  });

  it('registerMessageRenderer → DEGRADED', () => {
    const report = scanExtensionSource('pi.registerMessageRenderer((msg) => msg.text);');
    expect(report.level).toBe('DEGRADED');
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ api: 'registerMessageRenderer', level: 'DEGRADED' }),
      ]),
    );
  });

  it('registerShortcut / Component / Overlay → TUI_ONLY', () => {
    expect(scanExtensionSource('pi.registerShortcut("x", () => {});').level).toBe('TUI_ONLY');
    expect(scanExtensionSource('return <Component value={x} />;').level).toBe('TUI_ONLY');
    expect(scanExtensionSource('class X extends Component {}').level).toBe('TUI_ONLY');
    expect(scanExtensionSource('new Overlay().show();').level).toBe('TUI_ONLY');
  });

  it('优先级：TUI_ONLY > DEGRADED > PARTIAL', () => {
    expect(
      scanExtensionSource('pi.setStatus("s"); pi.registerMarkdownTransformer((x) => x);').level,
    ).toBe('DEGRADED');
    expect(
      scanExtensionSource('pi.setStatus("s"); pi.registerShortcut("x", () => {});').level,
    ).toBe('TUI_ONLY');
  });

  it('行号定位与 snippet', () => {
    const report = scanExtensionSource('const a = 1;\nconst b = 2;\npi.setStatus("x");\n');
    expect(report.issues[0]?.line).toBe(3);
    expect(report.issues[0]?.snippet).toContain('setStatus');
  });
});

describe('collectExtensionEntries', () => {
  it('发现全局/项目扩展目录与 settings.extensions[] 显式路径', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'agentdesk-ext-'));
    const agentDir = path.join(root, 'agent');
    const ws = path.join(root, 'ws');
    mkdirSync(path.join(agentDir, 'extensions'), { recursive: true });
    mkdirSync(path.join(agentDir, 'extensions', 'hello'), { recursive: true });
    mkdirSync(path.join(ws, '.pi', 'extensions'), { recursive: true });
    writeFileSync(path.join(agentDir, 'extensions', 'single.ts'), 'pi.on("x", () => {});');
    writeFileSync(path.join(agentDir, 'extensions', 'hello', 'index.ts'), 'pi.setStatus("s");');
    writeFileSync(path.join(agentDir, 'extensions', 'README.md'), 'ignore me');
    writeFileSync(path.join(ws, '.pi', 'extensions', 'proj-ext.ts'), 'pi.setTitle("t");');
    writeFileSync(path.join(agentDir, 'configured-ext.ts'), 'pi.on("x", () => {});');
    writeFileSync(path.join(ws, 'configured2.ts'), 'pi.setWidget({});');
    writeFileSync(
      path.join(agentDir, 'settings.json'),
      '{"extensions": ["./configured-ext.ts"]}\n',
    );
    writeFileSync(path.join(ws, '.pi', 'settings.json'), '{"extensions": ["./configured2.ts"]}\n');

    const entries = collectExtensionEntries(agentDir, ws);
    const ids = entries.map((e) => `${e.source}:${e.id}`).sort();
    expect(ids).toEqual([
      'configured:configured-ext.ts',
      'configured:configured2.ts',
      'global:hello/index.ts',
      'global:single.ts',
      'project:proj-ext.ts',
    ]);
    expect(entries.find((e) => e.id === 'README.md')).toBeUndefined();
  });
});

describe('ExtensionCompatTracker（运行时捕获）', () => {
  it('FULL 请求不记录；PARTIAL/editor/未知类型分级记录', () => {
    const tracker = new ExtensionCompatTracker();
    tracker.recordUiRequest('confirm', { text: 'ok' });
    tracker.recordUiRequest('notify', { text: 'hi' });
    expect(tracker.all()).toHaveLength(0);

    tracker.recordUiRequest('setStatus', {});
    tracker.recordUiRequest('editor', {});
    tracker.recordUiRequest('totally_unknown', { a: 1 });
    const notes = tracker.all();
    expect(notes).toHaveLength(3);
    expect(notes[0]?.detail).toContain('PARTIAL');
    expect(notes[1]?.detail).toContain('TUI_ONLY');
    expect(notes[2]?.detail).toContain('无法映射');
  });

  it('extension_error 按路径归属并可被 service 聚合', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'agentdesk-ext-note-'));
    const agentDir = path.join(root, 'agent');
    mkdirSync(path.join(agentDir, 'extensions'), { recursive: true });
    const extPath = path.join(agentDir, 'extensions', 'broken.ts');
    writeFileSync(extPath, 'throw new Error("boom");');

    const tracker = new ExtensionCompatTracker();
    tracker.recordExtensionError(extPath, 'boom at runtime');
    const service = new ExtensionCompatService(agentDir, tracker);
    const result = service.list();
    expect(result.extensions).toHaveLength(1);
    expect(result.extensions[0]?.runtimeNotes).toHaveLength(1);
    expect(result.extensions[0]?.runtimeNotes[0]?.detail).toContain('boom');
    expect(result.runtimeNotes).toHaveLength(0);
  });
});
