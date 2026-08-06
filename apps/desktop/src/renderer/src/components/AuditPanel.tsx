import type { ApprovalAuditEntry, ApprovalRule } from '@agentdesk/ipc';
import { useCallback, useEffect, useState } from 'react';
import { t } from '../i18n';
import { useUiStore } from '../stores/ui-store';

/** 审批审计面板（README 8.7.3）：查看 / 导出 / 清空 + 规则管理。 */
export function AuditPanel(): React.JSX.Element | null {
  const open = useUiStore((s) => s.auditOpen);
  const closeAudit = useUiStore((s) => s.closeAudit);
  const [entries, setEntries] = useState<ApprovalAuditEntry[]>([]);
  const [rules, setRules] = useState<ApprovalRule[]>([]);
  const [tool, setTool] = useState('');
  const [bashPrefix, setBashPrefix] = useState('');
  const [pathPrefix, setPathPrefix] = useState('');
  const [decision, setDecision] = useState<'allow' | 'deny'>('allow');

  const load = useCallback(async (): Promise<void> => {
    const [a, r] = await Promise.all([
      window.agentdesk.approval.auditList({}),
      window.agentdesk.approval.rulesList({}),
    ]);
    setEntries(a.entries);
    setRules(r.rules);
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  if (!open) return null;

  const doExport = async (): Promise<void> => {
    const { content } = await window.agentdesk.approval.auditExport({ format: 'md' });
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'agentdesk-approval-audit.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  const doClear = async (): Promise<void> => {
    if (!window.confirm(`${t('approval.auditClear')}?`)) return;
    await window.agentdesk.approval.auditClear({});
    await load();
  };

  const addRule = async (): Promise<void> => {
    await window.agentdesk.approval.rulesSave({
      rule: {
        scope: 'global',
        matcher: {
          ...(tool.trim() ? { tool: tool.trim() } : {}),
          ...(bashPrefix.trim() ? { bashPrefix: bashPrefix.trim() } : {}),
          ...(pathPrefix.trim() ? { pathPrefix: pathPrefix.trim() } : {}),
        },
        decision,
      },
    });
    setTool('');
    setBashPrefix('');
    setPathPrefix('');
    await load();
  };

  const deleteRule = async (id: string): Promise<void> => {
    await window.agentdesk.approval.rulesDelete({ id });
    await load();
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="audit-panel">
        <div className="audit-head">
          <h2>{t('approval.audit')}</h2>
          <div className="audit-actions">
            <button type="button" className="btn" onClick={() => void doExport()}>
              {t('approval.auditExport')}
            </button>
            <button type="button" className="btn" onClick={() => void doClear()}>
              {t('approval.auditClear')}
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={closeAudit}
              aria-label={t('titlebar.close')}
            >
              ✕
            </button>
          </div>
        </div>

        <h3>{t('approval.rules')}</h3>
        <div className="rule-list">
          {rules.length === 0 ? (
            <div className="audit-empty">{t('approval.auditEmpty')}</div>
          ) : (
            rules.map((r) => (
              <div key={r.id} className="rule-row">
                <span className="rule-matcher">
                  {r.matcher.tool ?? r.matcher.bashPrefix ?? r.matcher.pathPrefix ?? r.id}
                </span>
                <span className={`rule-decision rule-${r.decision}`}>{r.decision}</span>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => void deleteRule(r.id)}
                  aria-label={t('approval.ruleDelete')}
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
        <div className="rule-form">
          <input
            placeholder={t('approval.ruleTool')}
            value={tool}
            onChange={(e) => setTool(e.target.value)}
          />
          <input
            placeholder={t('approval.ruleBashPrefix')}
            value={bashPrefix}
            onChange={(e) => setBashPrefix(e.target.value)}
          />
          <input
            placeholder={t('approval.rulePathPrefix')}
            value={pathPrefix}
            onChange={(e) => setPathPrefix(e.target.value)}
          />
          <select
            value={decision}
            onChange={(e) => setDecision(e.target.value as 'allow' | 'deny')}
          >
            <option value="allow">allow</option>
            <option value="deny">deny</option>
          </select>
          <button type="button" className="btn" onClick={() => void addRule()}>
            {t('approval.ruleAdd')}
          </button>
        </div>

        <h3>{t('approval.audit')}</h3>
        <div className="audit-list">
          {entries.length === 0 ? (
            <div className="audit-empty">{t('approval.auditEmpty')}</div>
          ) : (
            entries.map((e) => (
              <div key={e.id} className="audit-row">
                <span className="audit-at">{new Date(e.at).toLocaleString()}</span>
                <span className="audit-tool">{e.tool}</span>
                <span className={`risk-badge risk-${e.risk ?? 'low'}`}>{e.risk ?? '-'}</span>
                <span className="audit-decision">{e.decision}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
