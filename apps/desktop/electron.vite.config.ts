import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

// 工作区包导出的是 TS 源码（exports 指向 src/index.ts），运行时无法 require，
// 必须打进产物而不是 externalize（README 14.3 依赖方向单向）。
const bundleWorkspaceDeps = {
  exclude: [
    '@agentdesk/ipc',
    '@agentdesk/shared',
    '@agentdesk/pi-protocol',
    '@agentdesk/mock-provider',
  ],
};

export default defineConfig({
  main: {
    build: {
      externalizeDeps: bundleWorkspaceDeps,
    },
  },
  preload: {
    // sandbox 化 preload 同样不能 require 工作区包，必须内联
    build: {
      externalizeDeps: bundleWorkspaceDeps,
    },
  },
  renderer: {
    plugins: [react()],
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
      },
    },
  },
});
