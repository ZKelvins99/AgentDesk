import {
  type approvalAuditClearRequestSchema,
  type approvalAuditExportRequestSchema,
  type approvalAuditListRequestSchema,
  type approvalRespondRequestSchema,
  type approvalRuleDeleteRequestSchema,
  type approvalRuleSaveRequestSchema,
  type approvalRulesListRequestSchema,
  type authLaunchLoginRequestSchema,
  type InvokeChannel,
  IPC_CHANNELS,
  invokeRequestSchemas,
  type mcpDeleteRequestSchema,
  type mcpExportRequestSchema,
  type mcpImportRequestSchema,
  type mcpListRequestSchema,
  type mcpLogsRequestSchema,
  type mcpSaveRequestSchema,
  type mcpSnapshotsRequestSchema,
  type mcpTestRequestSchema,
  type mcpToolsRequestSchema,
  type providerDeleteRequestSchema,
  type providerDiscoverModelsRequestSchema,
  type providerSaveRequestSchema,
  type providerTestRequestSchema,
  type sessionAbortRequestSchema,
  type sessionArchiveRequestSchema,
  type sessionAttachRequestSchema,
  type sessionCreateRequestSchema,
  type sessionDeleteRequestSchema,
  type sessionExportRequestSchema,
  type sessionGetModelsRequestSchema,
  type sessionListRequestSchema,
  type sessionRenameRequestSchema,
  type sessionSendRequestSchema,
  type sessionSetApprovalModeRequestSchema,
  type sessionSetModelRequestSchema,
  type sessionSetThinkingLevelRequestSchema,
  type skillsCreateRequestSchema,
  type skillsListRequestSchema,
  type skillsReadRequestSchema,
  type skillsSetEnabledRequestSchema,
  type skillsUpdateRequestSchema,
  type skillsValidateRequestSchema,
  type workspaceAddRequestSchema,
  type workspaceOpenRequestSchema,
  type workspaceRemoveRequestSchema,
  type workspaceTrustRequestSchema,
} from '@agentdesk/ipc';
import { AgentDeskError } from '@agentdesk/shared';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import type { z } from 'zod';
import type { ApprovalEngine, AskResponse, UplinkServer } from './approval';
import type { McpConfigStore } from './mcp/mcp-config';
import type { McpConnectionManager } from './mcp/mcp-manager';
import type { ProviderManager } from './providers';
import type { SessionManager } from './session/session-manager';
import type { SkillManager } from './skills/skill-manager';
import type { WorkspaceManager } from './storage';

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

export interface IpcHandlerDeps {
  sessionManager: SessionManager;
  workspaces: WorkspaceManager;
  providers: ProviderManager;
  approvals: ApprovalEngine;
  mcp: McpConfigStore;
  mcpHost: McpConnectionManager;
  /** M7：Skill 浏览/详情/启停（README 8.4.1）。 */
  skills: SkillManager;
  /** M6：MCP 配置变更后向 Bridge Extension 广播热更新。 */
  uplink: UplinkServer;
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
}
