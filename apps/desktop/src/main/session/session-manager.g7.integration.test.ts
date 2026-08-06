import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MockProvider } from '@agentdesk/mock-provider';
import { mockModelsJson, startMockProvider, textScenario } from '@agentdesk/mock-provider';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApprovalEngine, ApprovalStore, UplinkServer } from '../approval';
import { PackageManager } from '../packages/package-manager';
import { PiBridge, SidecarPool } from '../pi';
import { readPiSettings } from '../skills/pi-settings';
import { SkillManager } from '../skills/skill-manager';
import { openDatabase } from '../storage/db';
import { SessionStore } from '../storage/session-store';
import { SessionManager } from './session-manager';

/**
 * G7 验收（README 14.1 场景 7/8）：
 * 真实 pi 内核 + mock provider + Bridge Extension（resources_discover 经 uplink 上报）。
 * 场景 7：新建 Skill → resources_discover 出现 → /skill:name 调起 → 禁用后消失。
 * 场景 8：安装本地 Pi Package → 资源生效 → 部分过滤 → 卸载干净。
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const BINARY =
  process.env.PI_BINARY ??
  path.resolve(
    HERE,
    '../../../resources/bin',
    `${process.platform}-${process.arch}`,
    process.platform === 'win32' ? 'pi.exe' : 'pi',
  );
const BRIDGE_EXT = path.resolve(HERE, '../../../resources/pi-ext/agentdesk-bridge/index.ts');
const skipIntegration = !existsSync(BINARY);

async function waitFor(
  predicate: () => boolean,
  timeoutMs: number,
  intervalMs = 100,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`waitFor 超时：${timeoutMs}ms`);
}

describe.skipIf(skipIntegration)(
  'G7 验收（真实内核 + mock provider，README 14.1 场景 7/8）',
  () => {
    let root: string;
    let workspaceDir: string;
    let sessionDir: string;
    let agentDir: string;
    let store: SessionStore;

    beforeAll(() => {
      root = mkdtempSync(path.join(tmpdir(), 'agentdesk-g7-it-'));
      workspaceDir = path.join(root, 'workspace');
      sessionDir = path.join(root, 'sessions');
      agentDir = path.join(root, 'agent');
      for (const dir of [workspaceDir, sessionDir, agentDir]) {
        mkdirSync(dir, { recursive: true });
      }
      store = new SessionStore(
        openDatabase(path.join(root, 'agentdesk.db')),
        path.join(root, 'exports'),
      );
    });

    afterAll(async () => {
      store.close();
      if (root) {
        for (let attempt = 0; attempt < 5; attempt += 1) {
          try {
            rmSync(root, { recursive: true, force: true });
            break;
          } catch {
            await new Promise((r) => setTimeout(r, 250));
          }
        }
      }
    });

    interface TestEnv {
      manager: SessionManager;
      pool: SidecarPool;
      uplink: UplinkServer;
      mock: MockProvider;
      appDb: ReturnType<typeof openDatabase>;
    }

    async function makeEnv(): Promise<TestEnv> {
      const mock = await startMockProvider({ scenario: textScenario(['G7 回复'], 8) });
      writeFileSync(path.join(agentDir, 'models.json'), mockModelsJson(mock.baseUrl));
      const appDb = openDatabase(':memory:');
      const approvalStore = new ApprovalStore(appDb);
      const engine = new ApprovalEngine({
        store: approvalStore,
        getApprovalMode: () => 'full-access',
        getWorkspacePath: () => workspaceDir,
        ask: async () => ({ decision: 'deny' }),
      });
      // pi 0.83.0 的 resources_discover 只发通知，生效清单由主进程按同规则补齐（README 8.2.3）
      const sm = new SkillManager({ agentDir });
      const uplink = new UplinkServer({
        engine,
        resolveResourceLists: async () => {
          const views = await sm.list();
          const active = views.filter((v) => v.status === 'active');
          const names = active.map((v) => v.name).filter((n): n is string => n !== null);
          return { skills: names, commands: names.map((n) => `/skill:${n}`) };
        },
      });
      await uplink.listen();
      const pool = new SidecarPool({ idleTimeoutMs: 0 });
      const bridge = new PiBridge({ binary: BINARY, pool });
      const manager = new SessionManager({
        bridge,
        workspacePath: workspaceDir,
        sessionDir,
        store,
        defaultProvider: 'mock',
        defaultModel: 'mock-model',
        trust: 'allow',
        agentDir,
        extensionPath: BRIDGE_EXT,
        uplink,
        offline: true,
        onEvent: () => {},
      });
      return { manager, pool, uplink, mock, appDb };
    }

    async function disposeEnv(env: TestEnv): Promise<void> {
      await env.manager.shutdownAll(5_000);
      env.pool.dispose();
      await env.uplink.close();
      await env.mock.close();
      env.appDb.close();
    }

    it('G7 场景 7：新建 Skill → resources_discover 出现 → /skill:name 调起 → 禁用后消失', {
      timeout: 240_000,
    }, async () => {
      const skillName = 'greet';
      mkdirSync(path.join(agentDir, 'skills', skillName), { recursive: true });
      writeFileSync(
        path.join(agentDir, 'skills', skillName, 'SKILL.md'),
        `---\nname: ${skillName}\ndescription: 向用户打招呼\n---\n\n请用中文热情地打招呼。\n`,
      );
      const env = await makeEnv();
      try {
        const sessionId = await env.manager.create();
        expect(sessionId).toBeTruthy();

        // resources_discover 中出现（README 8.2.3：以 pi 上报的真实生效清单为准）
        await waitFor(() => {
          const snap = env.uplink.resourcesSnapshot();
          return snap?.skills.some((s) => s.toLowerCase().includes('greet')) === true;
        }, 90_000);

        // /skill:name 调起：mock provider 收到含技能内容的请求
        const r = await env.manager.send(sessionId, '/skill:greet 世界');
        expect(r.accepted).toBe(true);
        await waitFor(() => env.mock.calls.length >= 1, 60_000);
        const last = env.mock.calls[env.mock.calls.length - 1];
        const prompt = JSON.stringify(last?.messages ?? []);
        expect(prompt).toMatch(/greet|打招呼/);

        // 禁用 → 重启 sidecar 重新发现 → 从生效清单消失
        const sm = new SkillManager({ agentDir });
        const views = await sm.list();
        const view = views.find((v) => v.id.includes(skillName) || v.name === skillName);
        expect(view).toBeDefined();
        if (!view) throw new Error(`Skill ${skillName} 未找到`);
        await sm.setEnabled(view.id, false);

        const sessionId2 = await env.manager.create();
        expect(sessionId2).toBeTruthy();
        await waitFor(() => {
          const snap = env.uplink.resourcesSnapshot();
          return snap?.skills.every((s) => !s.toLowerCase().includes('greet')) ?? false;
        }, 90_000);
      } finally {
        await disposeEnv(env);
      }
    });

    it('G7 场景 8：安装本地 Pi Package → 资源生效 → 部分过滤 → 卸载干净', {
      timeout: 180_000,
    }, async () => {
      const pkgDir = path.join(root, 'g7-pkg');
      mkdirSync(path.join(pkgDir, 'skills', 'pkg-skill'), { recursive: true });
      mkdirSync(path.join(pkgDir, 'extensions'), { recursive: true });
      mkdirSync(path.join(pkgDir, 'prompts'), { recursive: true });
      writeFileSync(
        path.join(pkgDir, 'package.json'),
        JSON.stringify({ name: 'g7-pkg', version: '1.0.0' }),
      );
      writeFileSync(
        path.join(pkgDir, 'skills', 'pkg-skill', 'SKILL.md'),
        '---\nname: pkg-skill\ndescription: 包内技能\n---\n',
      );
      writeFileSync(path.join(pkgDir, 'extensions', 'ext.ts'), 'export default function () {}');
      writeFileSync(path.join(pkgDir, 'prompts', 'p.md'), '# prompt');

      const pm = new PackageManager({ binary: BINARY, agentDir });
      const installed = await pm.install({
        source: { type: 'local', path: pkgDir },
        scope: 'global',
      });
      expect(installed.ok).toBe(true);

      const views = await pm.list();
      const view = views.find(
        (v) =>
          v.sourceType === 'local' && path.resolve(v.installPath ?? '') === path.resolve(pkgDir),
      );
      expect(view).toBeDefined();
      if (!view) throw new Error('Package 安装后未在列表中找到');
      expect(view.resources).toMatchObject({
        extensions: 1,
        skills: 1,
        prompts: 1,
        themes: 0,
      });

      // 部分过滤：只保留 skills（extensions/prompts/themes 全停）
      const filtered = await pm.setFilter({
        source: `local:${pkgDir}`,
        scope: 'global',
        filter: { extensions: [], skills: ['pkg-skill'], prompts: [], themes: [] },
      });
      expect(filtered.filter?.extensions).toEqual([]);
      expect(filtered.filter?.skills).toEqual(['pkg-skill']);
      expect(filtered.filter?.prompts).toEqual([]);
      expect(filtered.filter?.themes).toEqual([]);

      // 卸载干净：settings.packages[] 与列表都无残留
      const removed = await pm.uninstall({ source: `local:${pkgDir}`, scope: 'global' });
      expect(removed.ok).toBe(true);
      const after = await pm.list();
      expect(
        after.some(
          (v) =>
            v.sourceType === 'local' && path.resolve(v.installPath ?? '') === path.resolve(pkgDir),
        ),
      ).toBe(false);
      const settings = readPiSettings(path.join(agentDir, 'settings.json'));
      const entries = Array.isArray(settings.packages) ? settings.packages : [];
      expect(entries).toHaveLength(0);
    });
  },
);
