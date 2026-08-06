import {
  type approvalAuditClearRequestSchema,
  type approvalAuditExportRequestSchema,
  type approvalAuditListRequestSchema,
  type approvalRespondRequestSchema,
  type approvalRuleDeleteRequestSchema,
  type approvalRuleSaveRequestSchema,
  type approvalRulesListRequestSchema,
  type authLaunchLoginRequestSchema,
  type diffApplyHunkRequestSchema,
  type diffComputeRequestSchema,
  type diffFileRequestSchema,
  type extensionsListRequestSchema,
  type InvokeChannel,
  IPC_CHANNELS,
  invokeRequestSchemas,
  type kernelUpdateRequestSchema,
  type mcpDeleteRequestSchema,
  type mcpExportRequestSchema,
  type mcpImportRequestSchema,
  type mcpListRequestSchema,
  type mcpLogsRequestSchema,
  type mcpSaveRequestSchema,
  type mcpSnapshotsRequestSchema,
  type mcpTestRequestSchema,
  type mcpToolsRequestSchema,
  type onboardingCompleteRequestSchema,
  type packagesInspectRequestSchema,
  type packagesInstallRequestSchema,
  type packagesListRequestSchema,
  type packagesSetFilterRequestSchema,
  type packagesUninstallRequestSchema,
  type packagesUpdateRequestSchema,
  type profileCreateRequestSchema,
  type profileDeleteRequestSchema,
  type profileSwitchRequestSchema,
  type providerDeleteRequestSchema,
  type providerDiscoverModelsRequestSchema,
  type providerSaveRequestSchema,
  type providerTestRequestSchema,
  type ptyCreateRequestSchema,
  type ptyKillRequestSchema,
  type ptyResizeRequestSchema,
  type ptyWriteRequestSchema,
  type sessionAbortRequestSchema,
  type sessionArchiveRequestSchema,
  type sessionAttachRequestSchema,
  type sessionContextUsageRequestSchema,
  type sessionCreateRequestSchema,
  type sessionDeleteRequestSchema,
  type sessionExportRequestSchema,
  type sessionForkRequestSchema,
  type sessionGetModelsRequestSchema,
  type sessionGetTreeRequestSchema,
  type sessionListRequestSchema,
  type sessionNavigateTreeRequestSchema,
  type sessionRenameRequestSchema,
  type sessionSendRequestSchema,
  type sessionSetApprovalModeRequestSchema,
  type sessionSetModelRequestSchema,
  type sessionSetThinkingLevelRequestSchema,
  type settingsReadRequestSchema,
  type settingsSaveRequestSchema,
  type skillsCreateRequestSchema,
  type skillsImportHarnessRequestSchema,
  type skillsInstallRequestSchema,
  type skillsListRequestSchema,
  type skillsReadRequestSchema,
  type skillsSetEnabledRequestSchema,
  type skillsUpdateRequestSchema,
  type skillsValidateRequestSchema,
  type workspaceAddRequestSchema,
  type workspaceOpenRequestSchema,
  type workspaceRemoveRequestSchema,
  type workspaceSearchRequestSchema,
  type workspaceTreeRequestSchema,
  type workspaceTrustRequestSchema,
} from '@agentdesk/ipc';
import { AgentDeskError } from '@agentdesk/shared';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import type { z } from 'zod';
import type { ApprovalEngine, AskResponse, UplinkServer } from './approval';
import type { ConfigStore } from './config/config-store';
import type { DiffEngine } from './diff/diff-engine';
import type { ExtensionCompatService } from './extensions/extension-compat';
import type { KernelManager } from './kernel/kernel-manager';
import type { McpConfigStore } from './mcp/mcp-config';
import type { McpConnectionManager } from './mcp/mcp-manager';
import type {
  PackageInstallSource,
  PackageManager,
  PackageResourceFilter,
} from './packages/package-manager';
import type { PackageSecurityInspector } from './packages/package-security';
import type { ProfileManager } from './profile/profile-manager';
import type { ProviderManager } from './providers';
import type { PtyService } from './pty/pty-service';
import type { OnboardingStore } from './onboarding/onboarding-store';
import type { SessionManager } from './session/session-manager';
import type { SkillManager } from './skills/skill-manager';
import type { WorkspaceManager } from './storage';
import type { DiagnosticService } from './telemetry/diagnostic';
import type { MetricsStore } from './telemetry/metrics-store';
import type { UpdateManager } from './updater/updater';
import type { FileTreeService } from './workspace/file-tree';

/** 边界数据必须过 zod 校验后才进入 handler（README 16.1）。 */
function parseRequest(channel: InvokeChannel, raw: unknown): unknown {
  const schema = invokeRequestSchemas[channel] as z.ZodType<unknown>;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new AgentDeskError({
      code: 'INVALID_IPC_PAYLOAD',
      scope: 'ipc',
      userMessage: `IPC ${channel} 请求不合法`,
      cause: parsed.error,
    });
  }
  return parsed.data;
}

type PackageSourceInput =
  | { type: 'npm'; name: string; version?: string | undefined }
  | { type: 'git'; url: string; ref?: string | undefined }
  | { type: 'local'; path: string };

/** zod 推断的 optional 属性含显式 undefined，归一化后再交给管理器（exactOptionalPropertyTypes）。 */
function normalizePackageSource(source: PackageSourceInput): PackageInstallSource {
  if (source.type === 'npm') {
    return {
      type: 'npm',
      name: source.name,
      ...(source.version !== undefined ? { version: source.version } : {}),
    };
  }
  if (source.type === 'git') {
    return {
      type: 'git',
      url: source.url,
      ...(source.ref !== undefined ? { ref: source.ref } : {}),
    };
  }
  return source;
}

export interface IpcHandlerDeps {
  sessionManager: SessionManager;
  workspaces: WorkspaceManager;
  providers: ProviderManager;
  approvals: ApprovalEngine;
  mcp: McpConfigStore;
  mcpHost: McpConnectionManager;
  /** M7：Skill 浏览/详情/启停（README 8.4.1）。 */
  skills: SkillManager;
  /** M7：Pi Package 管理（README 8.5.1）。 */
  packages: PackageManager;
  /** M7：插件安全审查（README 8.5.1）。 */
  packageSecurity: PackageSecurityInspector;
  /** M7：设置页 ConfigStore（README 9.7 / 16.2）。 */
  config: ConfigStore;
  /** M7：Profile（Agent Dir 隔离，README 8.8.3）。 */
  profiles: ProfileManager;
  /** M7：Extension 兼容性标注（README 8.5.2，静态扫描 + 运行时捕获）。 */
  extensions: ExtensionCompatService;
  /** M8：文件树（懒加载 + .gitignore + rg 搜索，README 8.9）。 */
  fileTree: FileTreeService;
  /** M8：Diff 面板（逐块接受/回滚 + 审计，README 8.9）。 */
  diff: DiffEngine;
  /** M8：PTY 终端面板（xterm.js + node-pty，README 9.6）。 */
  pty: PtyService;
  /** 内核二进制路径（设置页 2 健康状态展示）。 */
  kernelBinary: string | null;
  /** M6：MCP 配置变更后向 Bridge Extension 广播热更新。 */
  uplink: UplinkServer;
  /** M9：首次启动引导页状态。 */
  onboarding: OnboardingStore;
  /** M9：内核独立升级。 */
  kernelManager: KernelManager;
  /** M9：自动更新。 */
  updater: UpdateManager;
  /** M9：诊断报告。 */
  diagnostic: DiagnosticService;
  /** M9：指标。 */
  metrics: MetricsStore;
}

export function registerIpcHandlers(deps: IpcHandlerDeps): void {
  ipcMain.handle(IPC_CHANNELS['app:ping'], async (_event, raw: unknown) => {
    const { nonce } = parseRequest('app:ping', raw) as { nonce?: string };
    return { pong: `pong:${nonce ?? '-'}` };
  });

  ipcMain.handle(IPC_CHANNELS['app:get-version'], async () => {
    return { version: app.getVersion() };
  });

  ipcMain.handle(IPC_CHANNELS['window:minimize'], (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });

  ipcMain.handle(IPC_CHANNELS['window:maximize'], (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });

  ipcMain.handle(IPC_CHANNELS['window:close'], (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });

  // ---- 会话（README 10.2 session:*）----

  ipcMain.handle(IPC_CHANNELS['session:create'], async (_event, raw: unknown) => {
    const req = parseRequest('session:create', raw) as z.infer<typeof sessionCreateRequestSchema>;
    const sessionId = await deps.sessionManager.create(req);
    return { sessionId, workspacePath: deps.sessionManager.workspacePath };
  });

  ipcMain.handle(IPC_CHANNELS['session:attach'], async (_event, raw: unknown) => {
    const req = parseRequest('session:attach', raw) as z.infer<typeof sessionAttachRequestSchema>;
    return deps.sessionManager.attach(req.sessionId, req.sinceSeq ?? 0);
  });

  ipcMain.handle(IPC_CHANNELS['session:send'], async (_event, raw: unknown) => {
    const req = parseRequest('session:send', raw) as z.infer<typeof sessionSendRequestSchema>;
    return deps.sessionManager.send(req.sessionId, req.text);
  });

  ipcMain.handle(IPC_CHANNELS['session:abort'], async (_event, raw: unknown) => {
    const req = parseRequest('session:abort', raw) as z.infer<typeof sessionAbortRequestSchema>;
    await deps.sessionManager.abort(req.sessionId);
  });

  ipcMain.handle(IPC_CHANNELS['session:set-model'], async (_event, raw: unknown) => {
    const req = parseRequest('session:set-model', raw) as z.infer<
      typeof sessionSetModelRequestSchema
    >;
    await deps.sessionManager.setModel(req.sessionId, req.model);
  });

  ipcMain.handle(IPC_CHANNELS['session:list'], async (_event, raw: unknown) => {
    const req = parseRequest('session:list', raw) as z.infer<typeof sessionListRequestSchema>;
    return { sessions: deps.sessionManager.list(req) };
  });

  ipcMain.handle(IPC_CHANNELS['session:rename'], async (_event, raw: unknown) => {
    const req = parseRequest('session:rename', raw) as z.infer<typeof sessionRenameRequestSchema>;
    deps.sessionManager.rename(req.sessionId, req.title);
  });

  ipcMain.handle(IPC_CHANNELS['session:archive'], async (_event, raw: unknown) => {
    const req = parseRequest('session:archive', raw) as z.infer<typeof sessionArchiveRequestSchema>;
    deps.sessionManager.archive(req.sessionId);
  });

  ipcMain.handle(IPC_CHANNELS['session:delete'], async (_event, raw: unknown) => {
    const req = parseRequest('session:delete', raw) as z.infer<typeof sessionDeleteRequestSchema>;
    await deps.sessionManager.delete(req.sessionId);
  });

  ipcMain.handle(IPC_CHANNELS['session:export'], async (_event, raw: unknown) => {
    const req = parseRequest('session:export', raw) as z.infer<typeof sessionExportRequestSchema>;
    const filePath = deps.sessionManager.export(req.sessionId, req.format);
    return { path: filePath, format: req.format };
  });

  // ---- Workspace（README 10.2 workspace:*）----

  ipcMain.handle(IPC_CHANNELS['workspace:add'], async (_event, raw: unknown) => {
    const req = parseRequest('workspace:add', raw) as z.infer<typeof workspaceAddRequestSchema>;
    return deps.workspaces.add(req.path);
  });

  ipcMain.handle(IPC_CHANNELS['workspace:remove'], async (_event, raw: unknown) => {
    const req = parseRequest('workspace:remove', raw) as z.infer<
      typeof workspaceRemoveRequestSchema
    >;
    deps.workspaces.remove(req.workspaceId);
  });

  ipcMain.handle(IPC_CHANNELS['workspace:list'], async () => {
    return { workspaces: deps.workspaces.list() };
  });

  ipcMain.handle(IPC_CHANNELS['workspace:open'], async (_event, raw: unknown) => {
    const req = parseRequest('workspace:open', raw) as z.infer<typeof workspaceOpenRequestSchema>;
    const workspace = deps.workspaces.open(req.workspaceId);
    if (!workspace) {
      throw new AgentDeskError({
        code: 'WORKSPACE_NOT_FOUND',
        scope: 'workspace',
        userMessage: '工作区不存在',
      });
    }
    return { workspace };
  });

  ipcMain.handle(IPC_CHANNELS['workspace:trust'], async (_event, raw: unknown) => {
    const req = parseRequest('workspace:trust', raw) as z.infer<typeof workspaceTrustRequestSchema>;
    deps.workspaces.trust(req.workspaceId, req.decision);
  });

  ipcMain.handle(IPC_CHANNELS['session:get-models'], async (_event, raw: unknown) => {
    const req = parseRequest('session:get-models', raw) as z.infer<
      typeof sessionGetModelsRequestSchema
    >;
    return { models: await deps.sessionManager.getModels(req.sessionId) };
  });

  ipcMain.handle(IPC_CHANNELS['session:set-thinking-level'], async (_event, raw: unknown) => {
    const req = parseRequest('session:set-thinking-level', raw) as z.infer<
      typeof sessionSetThinkingLevelRequestSchema
    >;
    await deps.sessionManager.setThinkingLevel(req.sessionId, req.level);
  });

  ipcMain.handle(IPC_CHANNELS['session:set-approval-mode'], async (_event, raw: unknown) => {
    const req = parseRequest('session:set-approval-mode', raw) as z.infer<
      typeof sessionSetApprovalModeRequestSchema
    >;
    deps.sessionManager.setApprovalMode(req.sessionId, req.mode);
  });

  // ---- 审批（README 8.7）：uplink /approval → 弹窗 → 决策回填 ----
  const pendingApprovals = new Map<string, (res: AskResponse | 'timeout') => void>();
  deps.approvals.setAskHandler(async (req) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win || win.isDestroyed()) return 'timeout';
    return await new Promise<AskResponse | 'timeout'>((resolve) => {
      pendingApprovals.set(req.id, resolve);
      win.webContents.send('event:approval', req);
    });
  });

  ipcMain.handle(IPC_CHANNELS['approval:respond'], async (_event, raw: unknown) => {
    const req = parseRequest('approval:respond', raw) as z.infer<
      typeof approvalRespondRequestSchema
    >;
    const resolve = pendingApprovals.get(req.requestId);
    if (!resolve) return;
    pendingApprovals.delete(req.requestId);
    resolve({
      decision: req.decision,
      ...(req.reason !== undefined ? { reason: req.reason } : {}),
    });
  });

  ipcMain.handle(IPC_CHANNELS['approval:audit-list'], async (_event, raw: unknown) => {
    const req = parseRequest('approval:audit-list', raw) as z.infer<
      typeof approvalAuditListRequestSchema
    >;
    return {
      entries: deps.approvals.store.listAudit({
        ...(req.sessionId !== undefined ? { sessionId: req.sessionId } : {}),
        ...(req.limit !== undefined ? { limit: req.limit } : {}),
      }),
    };
  });

  ipcMain.handle(IPC_CHANNELS['approval:audit-export'], async (_event, raw: unknown) => {
    const req = parseRequest('approval:audit-export', raw) as z.infer<
      typeof approvalAuditExportRequestSchema
    >;
    return { content: deps.approvals.store.exportAudit(req.format) };
  });

  ipcMain.handle(IPC_CHANNELS['approval:audit-clear'], async (_event, raw: unknown) => {
    const req = parseRequest('approval:audit-clear', raw) as z.infer<
      typeof approvalAuditClearRequestSchema
    >;
    return {
      cleared:
        req.sessionId !== undefined
          ? deps.approvals.store.clearAudit(req.sessionId)
          : deps.approvals.store.clearAudit(),
    };
  });

  ipcMain.handle(IPC_CHANNELS['approval:rules-list'], async (_event, raw: unknown) => {
    const req = parseRequest('approval:rules-list', raw) as z.infer<
      typeof approvalRulesListRequestSchema
    >;
    return {
      rules: deps.approvals.store
        .listRules(req.sessionId !== undefined ? { sessionId: req.sessionId } : {})
        .map((r) => deps.approvals.store.toApiRule(r)),
    };
  });

  ipcMain.handle(IPC_CHANNELS['approval:rules-save'], async (_event, raw: unknown) => {
    const req = parseRequest('approval:rules-save', raw) as z.infer<
      typeof approvalRuleSaveRequestSchema
    >;
    return deps.approvals.store.saveRule(req.rule);
  });

  ipcMain.handle(IPC_CHANNELS['approval:rules-delete'], async (_event, raw: unknown) => {
    const req = parseRequest('approval:rules-delete', raw) as z.infer<
      typeof approvalRuleDeleteRequestSchema
    >;
    deps.approvals.store.deleteRule(req.id);
  });

  // ---- MCP Host（README 8.3）Server CRUD ---

  ipcMain.handle(IPC_CHANNELS['mcp:list'], async (_event, raw: unknown) => {
    const req = parseRequest('mcp:list', raw) as z.infer<typeof mcpListRequestSchema>;
    return { servers: deps.mcp.list(req.workspacePath) };
  });

  ipcMain.handle(IPC_CHANNELS['mcp:save'], async (_event, raw: unknown) => {
    const req = parseRequest('mcp:save', raw) as z.infer<typeof mcpSaveRequestSchema>;
    const { workspacePath, ...saveReq } = req;
    const server = deps.mcp.save({
      ...saveReq,
      ...(workspacePath !== undefined ? { workspacePath } : {}),
    });
    await deps.mcpHost.invalidate(req.name);
    deps.uplink.broadcast({ type: 'mcp:changed' });
    return { server };
  });

  ipcMain.handle(IPC_CHANNELS['mcp:delete'], async (_event, raw: unknown) => {
    const req = parseRequest('mcp:delete', raw) as z.infer<typeof mcpDeleteRequestSchema>;
    const deleted = deps.mcp.remove(req.name, req.scope, req.workspacePath);
    if (deleted) await deps.mcpHost.invalidate(req.name);
    deps.uplink.broadcast({ type: 'mcp:changed' });
    return { deleted };
  });

  ipcMain.handle(IPC_CHANNELS['mcp:import'], async (_event, raw: unknown) => {
    const req = parseRequest('mcp:import', raw) as z.infer<typeof mcpImportRequestSchema>;
    const result = deps.mcp.importClaude(req.json, req.scope, req.workspacePath);
    for (const name of result.imported.map((v) => v.name)) {
      await deps.mcpHost.invalidate(name);
    }
    deps.uplink.broadcast({ type: 'mcp:changed' });
    return result;
  });

  ipcMain.handle(IPC_CHANNELS['mcp:snapshots'], async (_event, raw: unknown) => {
    const req = parseRequest('mcp:snapshots', raw) as z.infer<typeof mcpSnapshotsRequestSchema>;
    return { snapshots: deps.mcpHost.listSnapshots(req.workspacePath) };
  });

  ipcMain.handle(IPC_CHANNELS['mcp:test'], async (_event, raw: unknown) => {
    const req = parseRequest('mcp:test', raw) as z.infer<typeof mcpTestRequestSchema>;
    return deps.mcpHost.testConnection(req.name, req.workspacePath);
  });

  ipcMain.handle(IPC_CHANNELS['mcp:tools'], async (_event, raw: unknown) => {
    const req = parseRequest('mcp:tools', raw) as z.infer<typeof mcpToolsRequestSchema>;
    return { tools: await deps.mcpHost.listTools(req.name, req.workspacePath) };
  });

  ipcMain.handle(IPC_CHANNELS['mcp:logs'], async (_event, raw: unknown) => {
    const req = parseRequest('mcp:logs', raw) as z.infer<typeof mcpLogsRequestSchema>;
    return { logs: deps.mcpHost.callLogs(req.limit ?? 20) };
  });

  ipcMain.handle(IPC_CHANNELS['mcp:export'], async (_event, raw: unknown) => {
    const req = parseRequest('mcp:export', raw) as z.infer<typeof mcpExportRequestSchema>;
    return { json: deps.mcp.exportJson(req.workspacePath) };
  });

  // ---- Skills（README 8.4.1）：浏览 / 详情 / 启停 ----

  ipcMain.handle(IPC_CHANNELS['skills:list'], async (_event, raw: unknown) => {
    const req = parseRequest('skills:list', raw) as z.infer<typeof skillsListRequestSchema>;
    return { skills: deps.skills.list(req.workspacePath) };
  });

  ipcMain.handle(IPC_CHANNELS['skills:read'], async (_event, raw: unknown) => {
    const req = parseRequest('skills:read', raw) as z.infer<typeof skillsReadRequestSchema>;
    const result = deps.skills.read(req.id, req.workspacePath);
    if (!result) {
      throw new AgentDeskError({
        code: 'SKILL_NOT_FOUND',
        scope: 'skills',
        userMessage: 'Skill 不存在',
      });
    }
    return result;
  });

  ipcMain.handle(IPC_CHANNELS['skills:set-enabled'], async (_event, raw: unknown) => {
    const req = parseRequest('skills:set-enabled', raw) as z.infer<
      typeof skillsSetEnabledRequestSchema
    >;
    return { skill: deps.skills.setEnabled(req.id, req.enabled, req.workspacePath) };
  });

  ipcMain.handle(IPC_CHANNELS['skills:create'], async (_event, raw: unknown) => {
    const req = parseRequest('skills:create', raw) as z.infer<typeof skillsCreateRequestSchema>;
    return {
      skill: deps.skills.create({
        name: req.name,
        description: req.description,
        ...(req.template !== undefined ? { template: req.template } : {}),
        ...(req.scope !== undefined ? { scope: req.scope } : {}),
        ...(req.workspacePath !== undefined ? { workspacePath: req.workspacePath } : {}),
      }),
    };
  });

  ipcMain.handle(IPC_CHANNELS['skills:update'], async (_event, raw: unknown) => {
    const req = parseRequest('skills:update', raw) as z.infer<typeof skillsUpdateRequestSchema>;
    return { skill: deps.skills.update(req.id, req.content, req.workspacePath) };
  });

  ipcMain.handle(IPC_CHANNELS['skills:validate'], async (_event, raw: unknown) => {
    const req = parseRequest('skills:validate', raw) as z.infer<typeof skillsValidateRequestSchema>;
    return deps.skills.validate(req.content, req.dirName);
  });

  ipcMain.handle(IPC_CHANNELS['skills:install'], async (_event, raw: unknown) => {
    const req = parseRequest('skills:install', raw) as z.infer<typeof skillsInstallRequestSchema>;
    const source =
      req.source.type === 'git'
        ? {
            type: 'git' as const,
            url: req.source.url,
            ...(req.source.ref !== undefined ? { ref: req.source.ref } : {}),
          }
        : req.source;
    return deps.skills.install({
      source,
      ...(req.scope !== undefined ? { scope: req.scope } : {}),
      ...(req.workspacePath !== undefined ? { workspacePath: req.workspacePath } : {}),
    });
  });

  ipcMain.handle(IPC_CHANNELS['skills:recommended'], async () => ({
    sources: deps.skills.recommended(),
  }));

  ipcMain.handle(IPC_CHANNELS['skills:harness-status'], async () => ({
    harnesses: deps.skills.otherHarnessStatus(),
  }));

  ipcMain.handle(IPC_CHANNELS['skills:import-harness'], async (_event, raw: unknown) => {
    const req = parseRequest('skills:import-harness', raw) as z.infer<
      typeof skillsImportHarnessRequestSchema
    >;
    return deps.skills.importOtherHarness(req.harness);
  });

  // ---- Pi Package 管理（README 8.5.1，M7 第五步）----

  ipcMain.handle(IPC_CHANNELS['packages:list'], async (_event, raw: unknown) => {
    const req = parseRequest('packages:list', raw) as z.infer<typeof packagesListRequestSchema>;
    return { packages: await deps.packages.list(req.workspacePath) };
  });

  ipcMain.handle(IPC_CHANNELS['packages:install'], async (_event, raw: unknown) => {
    const req = parseRequest('packages:install', raw) as z.infer<
      typeof packagesInstallRequestSchema
    >;
    return deps.packages.install({
      source: normalizePackageSource(req.source),
      scope: req.scope,
      ...(req.workspacePath !== undefined ? { workspacePath: req.workspacePath } : {}),
    });
  });

  ipcMain.handle(IPC_CHANNELS['packages:uninstall'], async (_event, raw: unknown) => {
    const req = parseRequest('packages:uninstall', raw) as z.infer<
      typeof packagesUninstallRequestSchema
    >;
    return deps.packages.uninstall({
      source: req.source,
      scope: req.scope,
      ...(req.workspacePath !== undefined ? { workspacePath: req.workspacePath } : {}),
    });
  });

  ipcMain.handle(IPC_CHANNELS['packages:update'], async (_event, raw: unknown) => {
    const req = parseRequest('packages:update', raw) as z.infer<typeof packagesUpdateRequestSchema>;
    return deps.packages.update({
      scope: req.scope,
      ...(req.source !== undefined ? { source: req.source } : {}),
      ...(req.extensions !== undefined ? { extensions: req.extensions } : {}),
      ...(req.workspacePath !== undefined ? { workspacePath: req.workspacePath } : {}),
    });
  });

  ipcMain.handle(IPC_CHANNELS['packages:set-filter'], async (_event, raw: unknown) => {
    const req = parseRequest('packages:set-filter', raw) as z.infer<
      typeof packagesSetFilterRequestSchema
    >;
    const filter: PackageResourceFilter = {};
    for (const key of ['extensions', 'skills', 'prompts', 'themes'] as const) {
      if (req.filter[key] !== undefined) filter[key] = req.filter[key];
    }
    if (req.filter.autoload !== undefined) filter.autoload = req.filter.autoload;
    return {
      package: await deps.packages.setFilter({
        source: req.source,
        scope: req.scope,
        filter,
        ...(req.workspacePath !== undefined ? { workspacePath: req.workspacePath } : {}),
      }),
    };
  });

  ipcMain.handle(IPC_CHANNELS['packages:inspect'], async (_event, raw: unknown) => {
    const req = parseRequest('packages:inspect', raw) as z.infer<
      typeof packagesInspectRequestSchema
    >;
    return { inspection: await deps.packageSecurity.inspect(normalizePackageSource(req.source)) };
  });

  // ---- 设置页（README 9.7 / 16.2，M7 第七步）----

  ipcMain.handle(IPC_CHANNELS['settings:read'], async (_event, raw: unknown) => {
    const req = parseRequest('settings:read', raw) as z.infer<typeof settingsReadRequestSchema>;
    return deps.config.read(req.file, req.scope, req.workspacePath);
  });

  ipcMain.handle(IPC_CHANNELS['settings:save'], async (_event, raw: unknown) => {
    const req = parseRequest('settings:save', raw) as z.infer<typeof settingsSaveRequestSchema>;
    return deps.config.save(
      req.file,
      req.scope,
      {
        ...(req.raw !== undefined ? { raw: req.raw } : {}),
        ...(req.parsed !== undefined ? { parsed: req.parsed } : {}),
      },
      req.workspacePath,
    );
  });

  ipcMain.handle(IPC_CHANNELS['settings:kernel-status'], async () =>
    deps.config.kernelStatus(deps.kernelBinary),
  );

  // ---- Profile（Agent Dir 隔离，README 8.8.3，M7 第八步）----

  ipcMain.handle(IPC_CHANNELS['profile:list'], async () => {
    const profiles = deps.profiles.list();
    return { profiles, activeId: deps.profiles.activeId() };
  });

  ipcMain.handle(IPC_CHANNELS['profile:create'], async (_event, raw: unknown) => {
    const req = parseRequest('profile:create', raw) as z.infer<typeof profileCreateRequestSchema>;
    return { profile: deps.profiles.create(req.name) };
  });

  ipcMain.handle(IPC_CHANNELS['profile:switch'], async (_event, raw: unknown) => {
    const req = parseRequest('profile:switch', raw) as z.infer<typeof profileSwitchRequestSchema>;
    const agentDir = deps.profiles.switch(req.id);
    return { activeId: req.id, agentDir, requiresRestart: true };
  });

  ipcMain.handle(IPC_CHANNELS['profile:delete'], async (_event, raw: unknown) => {
    const req = parseRequest('profile:delete', raw) as z.infer<typeof profileDeleteRequestSchema>;
    deps.profiles.delete(req.id);
    return { deleted: req.id };
  });

  // ---- Extension 兼容性标注（README 8.5.2，M7 第九步）----

  ipcMain.handle(IPC_CHANNELS['extensions:list'], async (_event, raw: unknown) => {
    const req = parseRequest('extensions:list', raw) as z.infer<typeof extensionsListRequestSchema>;
    return deps.extensions.list(req.workspacePath);
  });

  // ---- 文件树（README 8.9 / M8 第一步）----

  ipcMain.handle(IPC_CHANNELS['workspace:tree'], async (_event, raw: unknown) => {
    const req = parseRequest('workspace:tree', raw) as z.infer<typeof workspaceTreeRequestSchema>;
    return deps.fileTree.listDir({
      path: req.path,
      ...(req.root !== undefined ? { root: req.root } : {}),
    });
  });

  ipcMain.handle(IPC_CHANNELS['workspace:search'], async (_event, raw: unknown) => {
    const req = parseRequest('workspace:search', raw) as z.infer<
      typeof workspaceSearchRequestSchema
    >;
    return deps.fileTree.search({
      root: req.root,
      query: req.query,
      ...(req.maxResults !== undefined ? { maxResults: req.maxResults } : {}),
    });
  });

  // ---- Diff（README 8.9 / M8 第二步）----

  ipcMain.handle(IPC_CHANNELS['diff:compute'], async (_event, raw: unknown) => {
    const req = parseRequest('diff:compute', raw) as z.infer<typeof diffComputeRequestSchema>;
    return deps.diff.compute(req);
  });

  ipcMain.handle(IPC_CHANNELS['diff:file'], async (_event, raw: unknown) => {
    const req = parseRequest('diff:file', raw) as z.infer<typeof diffFileRequestSchema>;
    return deps.diff.file(req);
  });

  ipcMain.handle(IPC_CHANNELS['diff:apply-hunk'], async (_event, raw: unknown) => {
    const req = parseRequest('diff:apply-hunk', raw) as z.infer<typeof diffApplyHunkRequestSchema>;
    return deps.diff.applyHunk({
      file: req.file,
      patch: req.patch,
      direction: req.direction,
      ...(req.workspacePath !== undefined ? { workspacePath: req.workspacePath } : {}),
    });
  });

  // ---- Provider / Model / 密钥（README 8.6）----

  ipcMain.handle(IPC_CHANNELS['provider:list'], async () => ({
    providers: deps.providers.list(),
  }));

  ipcMain.handle(IPC_CHANNELS['provider:save'], async (_event, raw: unknown) => {
    const req = parseRequest('provider:save', raw) as z.infer<typeof providerSaveRequestSchema>;
    deps.providers.save(req.config, req.apiKey);
    return { name: req.config.name };
  });

  ipcMain.handle(IPC_CHANNELS['provider:delete'], async (_event, raw: unknown) => {
    const req = parseRequest('provider:delete', raw) as z.infer<typeof providerDeleteRequestSchema>;
    deps.providers.delete(req.name);
  });

  ipcMain.handle(IPC_CHANNELS['provider:presets'], async () => ({
    presets: deps.providers.presets(),
  }));

  ipcMain.handle(IPC_CHANNELS['provider:discover-models'], async (_event, raw: unknown) => {
    const req = parseRequest('provider:discover-models', raw) as z.infer<
      typeof providerDiscoverModelsRequestSchema
    >;
    return { models: await deps.providers.discoverModels(req) };
  });

  ipcMain.handle(IPC_CHANNELS['provider:test'], async (_event, raw: unknown) => {
    const req = parseRequest('provider:test', raw) as z.infer<typeof providerTestRequestSchema>;
    return deps.providers.testProvider(req.name, req.model);
  });

  ipcMain.handle(IPC_CHANNELS['secrets:status'], async () => deps.providers.secretsStatus());

  ipcMain.handle(IPC_CHANNELS['auth:status'], async () => ({
    providers: await deps.providers.authStatus(),
  }));

  ipcMain.handle(IPC_CHANNELS['auth:launch-login'], async (_event, raw: unknown) => {
    parseRequest('auth:launch-login', raw) as z.infer<typeof authLaunchLoginRequestSchema>;
    return deps.providers.launchLogin();
  });

  ipcMain.handle(IPC_CHANNELS['workspace:pick-directory'], async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const pick: Electron.OpenDialogOptions = {
      title: '选择工作区目录',
      properties: ['openDirectory', 'createDirectory'],
    };
    const result = win ? await dialog.showOpenDialog(win, pick) : await dialog.showOpenDialog(pick);
    if (result.canceled || result.filePaths.length === 0) return { path: null };
    return { path: result.filePaths[0] };
  });

  ipcMain.handle(IPC_CHANNELS['workspace:pick-file'], async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const pick: Electron.OpenDialogOptions = {
      title: '选择文件',
      properties: ['openFile'],
    };
    const result = win ? await dialog.showOpenDialog(win, pick) : await dialog.showOpenDialog(pick);
    if (result.canceled || result.filePaths.length === 0) return { path: null };
    return { path: result.filePaths[0] };
  });

  // ── M8: PTY 终端面板（README 9.6） ────────────────────────────────
  ipcMain.handle(IPC_CHANNELS['pty:create'], async (_event, raw: unknown) => {
    const req = parseRequest('pty:create', raw) as z.infer<typeof ptyCreateRequestSchema>;
    return deps.pty.create(req.cwd, req.cols, req.rows);
  });

  ipcMain.handle(IPC_CHANNELS['pty:write'], (_event, raw: unknown) => {
    const req = parseRequest('pty:write', raw) as z.infer<typeof ptyWriteRequestSchema>;
    deps.pty.write(req.ptyId, req.data);
  });

  ipcMain.handle(IPC_CHANNELS['pty:resize'], (_event, raw: unknown) => {
    const req = parseRequest('pty:resize', raw) as z.infer<typeof ptyResizeRequestSchema>;
    deps.pty.resize(req.ptyId, req.cols, req.rows);
  });

  ipcMain.handle(IPC_CHANNELS['pty:kill'], (_event, raw: unknown) => {
    const req = parseRequest('pty:kill', raw) as z.infer<typeof ptyKillRequestSchema>;
    deps.pty.kill(req.ptyId);
  });

  // ── M8: 会话树 / fork（README 9.4.1） ────────────────────────────────
  ipcMain.handle(IPC_CHANNELS['session:get-tree'], async (_event, raw: unknown) => {
    const { sessionId } = parseRequest('session:get-tree', raw) as z.infer<
      typeof sessionGetTreeRequestSchema
    >;
    const nodes = await deps.sessionManager.getTree(sessionId);
    return { nodes };
  });

  ipcMain.handle(IPC_CHANNELS['session:fork'], async (_event, raw: unknown) => {
    const req = parseRequest('session:fork', raw) as z.infer<typeof sessionForkRequestSchema>;
    return deps.sessionManager.fork(req.sessionId, req.fromMessageId);
  });

  ipcMain.handle(IPC_CHANNELS['session:navigate-tree'], async (_event, raw: unknown) => {
    const req = parseRequest('session:navigate-tree', raw) as z.infer<
      typeof sessionNavigateTreeRequestSchema
    >;
    await deps.sessionManager.navigateTree(req.sessionId, req.nodeId);
  });

  // ── M8: 上下文用量（README 9.4.1 token 徽标） ────────────────────────
  ipcMain.handle(IPC_CHANNELS['session:context-usage'], (_event, raw: unknown) => {
    const { sessionId } = parseRequest('session:context-usage', raw) as z.infer<
      typeof sessionContextUsageRequestSchema
    >;
    return deps.sessionManager.getContextUsage(sessionId);
  });

  // ── M9: 首次启动引导页（README 9.11 / 15） ──────────────────────────
  ipcMain.handle(IPC_CHANNELS['app:onboarding-status'], async () => {
    const state = deps.onboarding.state();
    const kernel = deps.kernelManager.resolveActive();
    return {
      completed: state.completed,
      kernelVersion: kernel.version,
      providerCount: deps.providers.list().length,
    };
  });

  ipcMain.handle(IPC_CHANNELS['app:onboarding-complete'], async (_event, raw: unknown) => {
    const req = parseRequest('app:onboarding-complete', raw) as z.infer<
      typeof onboardingCompleteRequestSchema
    >;
    if (req.provider && req.apiKey) {
      deps.providers.save({ name: req.provider, authMethod: 'api-key' }, req.apiKey);
    }
    if (req.kernel) {
      await deps.kernelManager.update(req.kernel);
      deps.metrics.record('kernel.updated');
    }
    deps.onboarding.complete();
  });

  // ── M9: 自动更新（README 12.3） ──────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS['app:update-status'], () => deps.updater.statusSnapshot());

  ipcMain.handle(IPC_CHANNELS['app:update-check'], () => deps.updater.check());

  ipcMain.handle(IPC_CHANNELS['app:update-install'], async () => {
    const status = deps.updater.statusSnapshot();
    if (status.state === 'downloaded') deps.updater.install();
  });

  ipcMain.handle(IPC_CHANNELS['app:open-logs'], () => {
    shell.openPath(deps.diagnostic.logDir());
  });

  // ── M9: 日志 / 诊断报告（README 13.3） ──────────────────────────────
  ipcMain.handle(IPC_CHANNELS['app:diagnostic-info'], () => deps.diagnostic.info());

  ipcMain.handle(IPC_CHANNELS['app:diagnostic-export'], async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const defaultName = `agentdesk-diagnostic-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.zip`;
    const options: Electron.SaveDialogOptions = {
      title: '导出诊断报告',
      defaultPath: defaultName,
      filters: [{ name: 'ZIP 压缩包', extensions: ['zip'] }],
    };
    const result = win
      ? await dialog.showSaveDialog(win, options)
      : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) {
      return { path: null, cancelled: true };
    }
    const path = await deps.diagnostic.exportTo(result.filePath);
    return { path, cancelled: false };
  });

  // ── M9: 内核独立升级（README 12.3 / 16.5） ──────────────────────────
  ipcMain.handle(IPC_CHANNELS['kernel:status'], () => deps.kernelManager.status());

  ipcMain.handle(IPC_CHANNELS['kernel:update'], async (_event, raw: unknown) => {
    const req = parseRequest('kernel:update', raw) as z.infer<typeof kernelUpdateRequestSchema>;
    const status = await deps.kernelManager.update(
      req.version !== undefined ? req.version : undefined,
    );
    deps.metrics.record('kernel.updated');
    return status;
  });

  ipcMain.handle(IPC_CHANNELS['kernel:rollback'], () => deps.kernelManager.rollback());
}
