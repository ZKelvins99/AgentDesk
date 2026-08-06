import { IPC_CHANNELS, invokeRequestSchemas } from '@agentdesk/ipc';
import { AgentDeskError } from '@agentdesk/shared';
import { app, BrowserWindow, ipcMain } from 'electron';
import type { z } from 'zod';

/** 边界数据必须过 zod 校验后才进入 handler（README 16.1）。 */
function parseRequest(channel: keyof typeof invokeRequestSchemas, raw: unknown): unknown {
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

export function registerIpcHandlers(): void {
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
}
