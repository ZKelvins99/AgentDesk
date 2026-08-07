import { join } from 'node:path';
import { BrowserWindow, Menu, shell } from 'electron';

export function createMainWindow(): BrowserWindow {
  // 自绘标题栏（README 9.1）：去掉系统边框与默认菜单，避免与 .titlebar 双层重叠
  Menu.setApplicationMenu(null);

  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 620,
    show: false,
    title: 'AgentDesk',
    frame: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    backgroundColor: '#212121',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  win.once('ready-to-show', () => {
    win.show();
  });

  // 外链一律交给系统浏览器，禁止在应用内新开窗口
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  const isDev = Boolean(process.env.ELECTRON_RENDERER_URL);
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  // 开发模式自动打开 DevTools，便于排查启动黑屏 / 渲染崩溃
  if (isDev || process.env.AGENTDESK_DEVTOOLS === '1') {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  return win;
}
