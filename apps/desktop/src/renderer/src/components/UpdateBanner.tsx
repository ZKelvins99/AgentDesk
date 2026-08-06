import { useEffect, useState } from 'react';
import type { UpdateStatus } from '@agentdesk/ipc';
import { t } from '../i18n';

/**
 * 更新状态横幅（README 12.3）：
 * 有更新 → 侧栏提示；已下载且无会话运行 → 可立即重启安装；有会话 → 标记待安装不自动重启。
 */
export function UpdateBanner(): React.JSX.Element | null {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void window.agentdesk.update.status().then(setStatus);
    return window.agentdesk.update.onUpdateEvent(setStatus);
  }, []);

  if (!status) return null;
  const { state } = status;

  const text =
    state === 'available'
      ? t('update.available', { version: status.version ?? '' })
      : state === 'downloading'
        ? t('update.downloading', {
            version: status.version ?? '',
            percent: Math.round((status.progress ?? 0) * 100),
          })
        : state === 'downloaded'
          ? status.pendingRestart
            ? t('update.pendingRestart')
            : t('update.downloaded')
          : state === 'checking'
            ? t('update.checking')
            : state === 'error'
              ? t('update.error', { err: status.message ?? '' })
              : state === 'not-supported'
                ? t('update.notSupported', { err: status.message ?? '' })
                : null;

  const showInstall = state === 'downloaded' && !status.pendingRestart;
  const showCheck = state === 'idle' || state === 'error' || state === 'not-supported';

  if (!text) return null;

  return (
    <div className="update-banner" role="status">
      <span className="update-text">{text}</span>
      {showCheck ? (
        <button
          type="button"
          className="btn-link"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void window.agentdesk.update.check().then(setStatus).finally(() => setBusy(false));
          }}
        >
          {t('update.check')}
        </button>
      ) : null}
      {showInstall ? (
        <button
          type="button"
          className="btn-primary update-install"
          onClick={() => void window.agentdesk.update.install()}
        >
          {t('update.install')}
        </button>
      ) : null}
    </div>
  );
}
