import { app, BrowserWindow } from 'electron';
import { registerIpcHandlers } from './ipc';
import { createSessionRuntime } from './session/runtime';
import { createMainWindow } from './windows';

// 单实例锁：避免多开导致 sidecar / SQLite 竞争（README 5.1 单实例）
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  void app.whenReady().then(async () => {
    const runtime = await createSessionRuntime();
    registerIpcHandlers({
      sessionManager: runtime.sessionManager,
      workspaces: runtime.workspaces,
      providers: runtime.providers,
      approvals: runtime.approvals,
      mcp: runtime.mcp,
    });
    createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });

    app.on('before-quit', () => {
      void runtime.dispose();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
