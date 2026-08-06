import {
  type authLaunchLoginRequestSchema,
  type InvokeChannel,
  IPC_CHANNELS,
  invokeRequestSchemas,
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
  type sessionSetModelRequestSchema,
  type sessionSetThinkingLevelRequestSchema,
  type workspaceAddRequestSchema,
  type workspaceOpenRequestSchema,
  type workspaceRemoveRequestSchema,
  type workspaceTrustRequestSchema,
} from '@agentdesk/ipc';
import { AgentDeskError } from '@agentdesk/shared';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import type { z } from 'zod';
import type { ProviderManager } from './providers';
import type { SessionManager } from './session/session-manager';
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
