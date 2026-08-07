import type { ApprovalDecisionKind } from '@agentdesk/ipc';
import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n';
import { useUiStore } from '../stores/ui-store';

const RISK_KEYS = {
  high: 'approval.riskHigh',
  medium: 'approval.riskMedium',
  low: 'approval.riskLow',
} as const;

/** 审批卡片（README 8.7.3）：工具 + 摘要 + 风险徽标 + 四按钮 + 快捷键。 */
export function ApprovalModal(): React.JSX.Element | null {
  const approvals = useUiStore((s) => s.approvals);
  const resolveApproval = useUiStore((s) => s.resolveApproval);
  const [confirmText, setConfirmText] = useState('');
  const [showReason, setShowReason] = useState(false);
  const [reason, setReason] = useState('');
  const req = approvals[0];

  const respondRef = useRef<(decision: ApprovalDecisionKind) => void>(() => {});
  respondRef.current = (decision: ApprovalDecisionKind): void => {
    if (!req) return;
    const high = req.risk === 'high';
    const confirmed = !high || confirmText.trim() === 'confirm';
    if ((decision === 'allow-once' || decision === 'always') && !confirmed) {
      setConfirmText('');
      return;
    }
    if (decision === 'deny-with-reason') {
      if (!reason.trim()) {
        setShowReason(true);
        return;
      }
      resolveApproval(req.id, decision, reason.trim());
      resetInputs();
      return;
    }
    resolveApproval(req.id, decision);
    resetInputs();
  };

  function resetInputs(): void {
    setConfirmText('');
    setShowReason(false);
    setReason('');
  }

  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (e.key === 'Enter' && !e.repeat) respondRef.current('allow-once');
      else if (k === 'a') respondRef.current('always');
      else if (k === 'd') respondRef.current('deny');
      else if (k === 'r') setShowReason((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [req]);

  if (!req) return null;
  const high = req.risk === 'high';
  const confirmed = !high || confirmText.trim() === 'confirm';

  return (
    <div
      className="modal-overlay approval-overlay"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="approval-title"
    >
      <div className="approval-card">
        <div className="approval-head">
          <span id="approval-title" className="approval-title">
            {t('approval.title')}
          </span>
          <span className={`risk-badge risk-${req.risk}`}>{t(RISK_KEYS[req.risk])}</span>
        </div>
        <div className="approval-tool">
          <span className="approval-tool-name">{req.tool}</span>
          {approvals.length > 1 ? (
            <span className="approval-queue">
              {t('approval.pending')} · {approvals.length}
            </span>
          ) : null}
        </div>
        <pre className="approval-summary">{req.argsSummary}</pre>
        <div className="approval-cwd" title={req.cwd}>
          {req.cwd}
        </div>
        {high ? <div className="approval-highrisk-hint">{t('approval.highRiskHint')}</div> : null}
        {high && !confirmed ? (
          <input
            className="approval-confirm-input"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={t('approval.confirmText')}
          />
        ) : null}
        {showReason ? (
          <input
            className="approval-reason-input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('approval.reasonPlaceholder')}
          />
        ) : null}
        <div className="approval-actions">
          <button
            type="button"
            className="btn approval-allow"
            disabled={!confirmed}
            onClick={() => respondRef.current('allow-once')}
            title="Enter"
          >
            {t('approval.allowOnce')}
          </button>
          <button
            type="button"
            className="btn approval-allow"
            disabled={!confirmed}
            onClick={() => respondRef.current('always')}
            title="A"
          >
            {t('approval.always')}
          </button>
          <button
            type="button"
            className="btn approval-deny"
            onClick={() => respondRef.current('deny')}
            title="D"
          >
            {t('approval.deny')}
          </button>
          <button
            type="button"
            className="btn approval-deny"
            onClick={() => respondRef.current('deny-with-reason')}
            title="R"
          >
            {t('approval.denyReason')}
          </button>
        </div>
      </div>
    </div>
  );
}
