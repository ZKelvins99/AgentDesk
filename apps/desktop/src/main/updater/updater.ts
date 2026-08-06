/**
 * UpdateManager（README 12.3）：electron-updater 自动更新。
 * - 启动后 30s + 每 6h 检查一次。
 * - 下载完成后不强制重启，侧栏提示；有会话运行时绝不自动重启。
 */
import { autoUpdater } from 'electron-updater';
import { app } from 'electron';
import type { UpdateStatus } from '@agentdesk/ipc';
import { getLogger } from '../logging/logger';

export interface UpdateManagerOptions {
  emit: (status: UpdateStatus) => void;
  hasActiveSessions: () => boolean;
  checkDelayMs?: number;
  checkIntervalMs?: number;
  /** 覆盖发布 feed（测试用）。 */
  feedUrl?: string;
  autoDownload?: boolean;
}

const DEFAULT_CHECK_DELAY_MS = 30_000;
const DEFAULT_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export class UpdateManager {
  private readonly emitStatus: (status: UpdateStatus) => void;
  private readonly hasActiveSessions: () => boolean;
  private readonly logger = getLogger('updater');
  private readonly checkDelayMs: number;
  private readonly checkIntervalMs: number;
  private status: UpdateStatus = { state: 'idle', currentVersion: app.getVersion() };
  private timer: ReturnType<typeof setTimeout> | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private initialized = false;

  constructor(options: UpdateManagerOptions) {
    this.emitStatus = options.emit;
    this.hasActiveSessions = options.hasActiveSessions;
    this.checkDelayMs = options.checkDelayMs ?? DEFAULT_CHECK_DELAY_MS;
    this.checkIntervalMs = options.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS;
    if (options.feedUrl) {
      autoUpdater.setFeedURL({ provider: 'generic', url: options.feedUrl });
    }
    autoUpdater.autoDownload = options.autoDownload ?? true;
    autoUpdater.autoInstallOnAppQuit = true;
    this.wireEvents();
  }

  /** 启动定时检查：30s 后首检，之后每 6h。 */
  init(): void {
    if (this.initialized) return;
    this.initialized = true;
    this.timer = setTimeout(() => {
      void this.check();
      this.interval = setInterval(() => void this.check(), this.checkIntervalMs);
      this.interval.unref();
    }, this.checkDelayMs);
    this.timer.unref();
  }

  statusSnapshot(): UpdateStatus {
    return { ...this.status };
  }

  async check(): Promise<UpdateStatus> {
    if (!this.initialized) this.init();
    if (autoUpdater.isUpdaterActive()) return this.statusSnapshot();
    this.setStatus({ state: 'checking' });
    try {
      const result = await autoUpdater.checkForUpdates();
      if (result?.updateInfo) {
        this.setStatus({ state: 'available', version: result.updateInfo.version });
      } else {
        this.setStatus({ state: 'idle' });
      }
    } catch (err) {
      // 未打包（dev）环境 electron-updater 抛 "application is not packed"
      const msg = err instanceof Error ? err.message : String(err);
      this.setStatus({ state: 'not-supported', message: msg });
    }
    return this.statusSnapshot();
  }

  async download(): Promise<UpdateStatus> {
    try {
      await autoUpdater.downloadUpdate();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.setStatus({ state: 'error', message: msg });
    }
    return this.statusSnapshot();
  }

  /**
   * 安装/重启。有会话运行中 → 只标记 pendingRestart（README 12.3），
   * 由 UI 提示用户稍后手动安装；无会话则立即退出并安装。
   */
  install(): UpdateStatus {
    if (this.hasActiveSessions()) {
      this.setStatus({ state: 'downloaded', pendingRestart: true });
      return this.statusSnapshot();
    }
    autoUpdater.quitAndInstall();
    return this.statusSnapshot();
  }

  private setStatus(patch: Partial<UpdateStatus>): void {
    this.status = { ...this.status, ...patch };
    this.emitStatus({ ...this.status });
  }

  private wireEvents(): void {
    autoUpdater.on('checking-for-update', () => {
      this.setStatus({ state: 'checking' });
    });
    autoUpdater.on('update-available', (info) => {
      this.setStatus({ state: 'available', version: info.version });
    });
    autoUpdater.on('update-not-available', (info) => {
      this.setStatus({ state: 'idle', currentVersion: info.version ?? app.getVersion() });
    });
    autoUpdater.on('download-progress', (progress) => {
      const p = progress.percent / 100;
      this.setStatus({
        state: 'downloading',
        version: this.status.version,
        progress: Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : undefined,
      });
    });
    autoUpdater.on('update-downloaded', (info) => {
      this.setStatus({ state: 'downloaded', version: info.version });
    });
    autoUpdater.on('error', (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error({ err: msg }, 'auto-update error');
      this.setStatus({ state: 'error', message: msg });
    });
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.interval) clearInterval(this.interval);
    this.timer = null;
    this.interval = null;
  }
}
