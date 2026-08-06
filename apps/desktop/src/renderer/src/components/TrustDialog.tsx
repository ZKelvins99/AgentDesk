import { t } from '../i18n';
import { useWorkspaceStore } from '../stores/workspace-store';

/** 首次打开项目时的信任对话框（README 8.9 / 11.2 诚实告知）。 */
export function TrustDialog(): React.JSX.Element | null {
  const pending = useWorkspaceStore((s) => s.pendingTrust);
  const trustDecision = useWorkspaceStore((s) => s.trustDecision);
  const cancelTrust = useWorkspaceStore((s) => s.cancelTrust);
  if (!pending) return null;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={t('trust.title')}>
      <div className="modal-card trust-dialog">
        <div className="trust-title">{t('trust.title')}</div>
        <div className="trust-path">{pending.path}</div>
        <p className="trust-body">{t('trust.body')}</p>
        <div className="trust-actions">
          <button type="button" className="trust-option" onClick={() => void trustDecision('once')}>
            {t('trust.once')}
          </button>
          <button
            type="button"
            className="trust-option trust-primary"
            onClick={() => void trustDecision('always')}
          >
            {t('trust.always')}
          </button>
          <button
            type="button"
            className="trust-option"
            onClick={() => void trustDecision('alwaysParent')}
          >
            {t('trust.alwaysParent')}
          </button>
          <button
            type="button"
            className="trust-option trust-danger"
            onClick={() => void trustDecision('never')}
          >
            {t('trust.never')}
          </button>
          <button type="button" className="trust-cancel" onClick={cancelTrust}>
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
