import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import {
  type MockProvider,
  mockModelsJson,
  startMockProvider,
  textScenario,
} from '@agentdesk/mock-provider';
import { app, BrowserWindow } from 'electron';
import { ApprovalEngine, ApprovalStore, UplinkServer } from '../approval';
import { ConfigStore } from '../config/config-store';
import { McpConfigStore } from '../mcp/mcp-config';
import { McpConnectionManager } from '../mcp/mcp-manager';
import { PackageManager } from '../packages/package-manager';
import { PackageSecurityInspector } from '../packages/package-security';
import { PiBridge, SidecarPool } from '../pi';
import { electronSecretEncryptor, ProviderManager, SecretsStore } from '../providers';
import { SkillManager } from '../skills/skill-manager';
import { openDatabase, SessionStore, WorkspaceManager } from '../storage';
import { SessionManager } from './session-manager';

/**
 * 会话运行时装配（README 5.1/5.4）：
 * - 解析 pi 二进制（resources/bin/<platform>-<arch>）
 * - AGENTDESK_MOCK_PROVIDER=1 时启动本地 mock provider（README 14.2，E2E 不花真钱）
 * - SQLite（userData/agentdesk.db）+ WorkspaceManager（信任）
 * - 事件经 16ms 合流后广播到所有窗口（event:session）
 */

export interface SessionRuntimeHandle {
  sessionManager: SessionManager;
  workspaces: WorkspaceManager;
  providers: ProviderManager;
  approvals: ApprovalEngine;
  mcp: McpConfigStore;
  mcpHost: McpConnectionManager;
  skills: SkillManager;
  packages: PackageManager;
  packageSecurity: PackageSecurityInspector;
  config: ConfigStore;
  uplink: UplinkServer;
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
  const userData = app.getPath('userData');
  const sessionDir = path.join(userData, 'sessions');
  mkdirSync(sessionDir, { recursive: true });

  const db = openDatabase(path.join(userData, 'agentdesk.db'));
  const store = new SessionStore(db, path.join(userData, 'exports'));
  // 「本次信任」不跨重启：启动时重置为未知，下次打开重新询问（README 8.9）
  store.resetOnceTrust();
  const workspaces = new WorkspaceManager({ store });
  const secrets = new SecretsStore(path.join(homedir(), '.agentdesk'), electronSecretEncryptor);
  const providers = new ProviderManager({
    modelsDir: process.env.PI_CODING_AGENT_DIR ?? path.join(homedir(), '.pi', 'agent'),
    secrets,
    binary,
  });

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

  const mcpStore = new McpConfigStore();
  const skillManager = new SkillManager();
  const packageManager = new PackageManager(binary ? { binary } : {});
  const packageSecurity = new PackageSecurityInspector();
  const configStore = new ConfigStore();
  let sessionManager: SessionManager;
  const approvalStore = new ApprovalStore(db);
  const approvals = new ApprovalEngine({
    store: approvalStore,
    getApprovalMode: (sessionId) => sessionManager.approvalModeOf(sessionId),
    getWorkspacePath: (sessionId) => sessionManager.workspacePathOf(sessionId),
    ask: async () => 'timeout',
  });
  const mcpHost = new McpConnectionManager({ store: mcpStore });
  const uplink = new UplinkServer({
    engine: approvals,
    mcp: {
      discoverTools: (workspacePath?: string) => mcpHost.discoverTools(workspacePath),
      callTool: (request, options) => mcpHost.callTool(request, options),
      markToolConflict: (request) =>
        mcpHost.markToolConflict(request.server, request.tool, request.conflict),
    },
    resolveWorkspacePath: (sessionId: string) => sessionManager.workspacePathOf(sessionId),
    attachmentsDir: () => path.join(sessionDir, 'attachments'),
  });
  await uplink.listen();
  // MCP 工具清单变化 → 通知 Bridge Extension 重注册（README 8.2.2 /events 热更新）
  mcpHost.on('tools', () => uplink.broadcast({ type: 'mcp:changed' }));

  const bridgeExt = path.join(
    app.getAppPath(),
    'resources',
    'pi-ext',
    'agentdesk-bridge',
    'index.ts',
  );

  sessionManager = new SessionManager({
    bridge,
    workspacePath,
    sessionDir,
    store,
    defaultProvider,
    defaultModel,
    defaultThinkingLevel: process.env.AGENTDESK_THINKING_LEVEL,
    trust,
    resolveTrust: (p: string) => workspaces.resolveTrustForSpawn(p),
    resolveProviderEnv: (provider: string | null) =>
      provider ? providers.envForProvider(provider) : {},
    ...(mockSetup?.agentDir ? { agentDir: mockSetup.agentDir } : {}),
    ...(existsSync(bridgeExt) ? { extensionPath: bridgeExt } : {}),
    approvalEngine: approvals,
    uplink,
    defaultApprovalMode:
      (process.env.AGENTDESK_APPROVAL_MODE as
        | 'plan'
        | 'read-only'
        | 'auto-edit'
        | 'full-access'
        | undefined) ?? 'full-access',
    offline,
    onEvent: (sessionId, seq, ev) => {
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('event:session', { sessionId, seq, ev });
      }
    },
  });

  return {
    sessionManager,
    workspaces,
    providers,
    approvals,
    mcp: mcpStore,
    mcpHost,
    skills: skillManager,
    packages: packageManager,
    packageSecurity,
    config: configStore,
    uplink,
    kernel: { binary },
    dispose: async () => {
      await sessionManager.shutdownAll(5_000);
      await mcpHost.disposeAll();
      pool.dispose();
      await uplink.close();
      db.close();
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
