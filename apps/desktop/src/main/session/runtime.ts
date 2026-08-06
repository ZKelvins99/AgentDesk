import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  type MockProvider,
  mockModelsJson,
  startMockProvider,
  textScenario,
} from '@agentdesk/mock-provider';
import { app, BrowserWindow } from 'electron';
import { PiBridge, SidecarPool } from '../pi';
import { SessionManager } from './session-manager';

/**
 * 会话运行时装配（README 5.1/5.4）：
 * - 解析 pi 二进制（resources/bin/<platform>-<arch>）
 * - AGENTDESK_MOCK_PROVIDER=1 时启动本地 mock provider（README 14.2，E2E 不花真钱）
 * - 事件经 16ms 合流后广播到所有窗口（event:session）
 */

export interface SessionRuntimeHandle {
  sessionManager: SessionManager;
  kernel: { binary: string | null };
  dispose: () => Promise<void>;
}

export function resolvePiBinary(appPath: string): string | null {
  const platformDir = `${process.platform}-${process.arch}`;
  const bin = path.join(
    appPath,
    'resources',
    'bin',
    platformDir,
    process.platform === 'win32' ? 'pi.exe' : 'pi',
  );
  return existsSync(bin) ? bin : null;
}

interface MockSetup {
  mock: MockProvider;
  agentDir: string;
  workspace: string | null;
}

async function setupMockProvider(): Promise<MockSetup> {
  const mock = await startMockProvider({
    scenario: textScenario(['你好，我是 ', 'Mock Provider', '。这是流式回复。'], 12),
  });
  const agentDir = mkdtempSync(path.join(tmpdir(), 'agentdesk-mock-'));
  writeFileSync(path.join(agentDir, 'models.json'), mockModelsJson(mock.baseUrl));
  const workspace = process.env.AGENTDESK_WORKSPACE
    ? null
    : mkdtempSync(path.join(tmpdir(), 'agentdesk-workspace-'));
  return { mock, agentDir, workspace };
}

export async function createSessionRuntime(): Promise<SessionRuntimeHandle> {
  const binary = resolvePiBinary(app.getAppPath());
  const sessionDir = path.join(app.getPath('userData'), 'sessions');
  mkdirSync(sessionDir, { recursive: true });

  let mockSetup: MockSetup | null = null;
  if (process.env.AGENTDESK_MOCK_PROVIDER === '1') {
    mockSetup = await setupMockProvider();
  }

  const workspacePath = process.env.AGENTDESK_WORKSPACE ?? mockSetup?.workspace ?? process.cwd();
  const defaultProvider = process.env.AGENTDESK_PROVIDER ?? (mockSetup ? 'mock' : undefined);
  const defaultModel = process.env.AGENTDESK_MODEL ?? (mockSetup ? 'mock-model' : undefined);
  const trust: 'allow' | 'deny' =
    mockSetup || process.env.AGENTDESK_TRUST === 'allow' ? 'allow' : 'deny';
  const offline = mockSetup !== null || process.env.AGENTDESK_OFFLINE === '1';

  const pool = new SidecarPool({ idleTimeoutMs: 15 * 60 * 1000 });
  const bridge = new PiBridge({ binary: binary ?? '', pool });

  const sessionManager = new SessionManager({
    bridge,
    workspacePath,
    sessionDir,
    defaultProvider,
    defaultModel,
    defaultThinkingLevel: process.env.AGENTDESK_THINKING_LEVEL,
    trust,
    ...(mockSetup?.agentDir ? { agentDir: mockSetup.agentDir } : {}),
    offline,
    onEvent: (sessionId, seq, ev) => {
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('event:session', { sessionId, seq, ev });
      }
    },
  });

  return {
    sessionManager,
    kernel: { binary },
    dispose: async () => {
      await sessionManager.shutdownAll(5_000);
      pool.dispose();
      if (mockSetup) {
        await mockSetup.mock.close();
        rmSync(mockSetup.agentDir, { recursive: true, force: true });
        if (mockSetup.workspace) {
          rmSync(mockSetup.workspace, { recursive: true, force: true });
        }
      }
    },
  };
}
