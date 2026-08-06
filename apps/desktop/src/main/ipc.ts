import {
  type InvokeChannel,
  IPC_CHANNELS,
  invokeRequestSchemas,
  type sessionAbortRequestSchema,
  type sessionAttachRequestSchema,
  type sessionCreateRequestSchema,
  type sessionSendRequestSchema,
  type sessionSetModelRequestSchema,
} from '@agentdesk/ipc';
import { AgentDeskError } from '@agentdesk/shared';
import { app, BrowserWindow, ipcMain } from 'electron';
import type { z } from 'zod';
import type { SessionManager } from './session/session-manager';

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
    return deps.sessionManager.attach(req.sessionId);
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
}
