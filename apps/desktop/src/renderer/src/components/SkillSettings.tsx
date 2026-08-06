import type { SkillView } from '@agentdesk/ipc';
import { useCallback, useEffect, useState } from 'react';
import { useSessionStore } from '../stores/session-store';
import { useUiStore } from '../stores/ui-store';

const STATUS_LABEL: Record<SkillView['status'], string> = {
  active: '启用',
  disabled: '停用',
  invalid: '无效',
  shadowed: '重名让位',
};

function statusClass(status: SkillView['status']): string {
  switch (status) {
    case 'active':
      return 'skill-status-active';
    case 'disabled':
      return 'skill-status-disabled';
    case 'invalid':
      return 'skill-status-invalid';
    case 'shadowed':
      return 'skill-status-shadowed';
  }
}

/** Skill 管理（M7 第一步）：浏览 / 详情 / 启停（README 8.4.1）。 */
export function SkillSettings(): React.JSX.Element | null {
  const open = useUiStore((s) => s.skillSettingsOpen);
  const close = useUiStore((s) => s.closeSkillSettings);
  const activeId = useSessionStore((s) => s.activeSessionId);
  const sessions = useSessionStore((s) => s.sessions);
  const [skills, setSkills] = useState<SkillView[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [details, setDetails] = useState<Record<string, string>>({});
  const [detailsError, setDetailsError] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  const workspacePath = activeId ? (sessions[activeId]?.workspacePath ?? '') : '';

  const load = useCallback(async (): Promise<void> => {
    setError('');
    try {
      const res = await window.agentdesk.skills.list(workspacePath ? { workspacePath } : {});
      setSkills(res.skills);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [workspacePath]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  if (!open) return null;

  const toggleExpand = async (id: string): Promise<void> => {
    const next = new Set(expanded);
    if (next.has(id)) {
      next.delete(id);
      setExpanded(next);
      return;
    }
    next.add(id);
    setExpanded(next);
    if (!details[id] && !detailsError[id]) {
      try {
        const r = await window.agentdesk.skills.read({
          id,
          ...(workspacePath ? { workspacePath } : {}),
        });
        setDetails((s) => ({ ...s, [id]: r.content }));
      } catch (err) {
        setDetailsError((s) => ({
          ...s,
          [id]: err instanceof Error ? err.message : String(err),
        }));
      }
    }
  };

  const toggleEnabled = async (view: SkillView): Promise<void> => {
    setError('');
    try {
      const r = await window.agentdesk.skills.setEnabled({
        id: view.id,
        enabled: view.status !== 'active',
        ...(workspacePath ? { workspacePath } : {}),
      });
      setSkills((s) => s.map((v) => (v.id === view.id ? r.skill : v)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const groups: Array<{ label: string; items: SkillView[] }> = [
    {
      label: '全局（~/.pi/agent/skills 与 ~/.agents/skills）',
      items: skills.filter((s) => s.source === 'global'),
    },
    {
      label: workspacePath
        ? `项目（${workspacePath}/.pi/skills 与 .agents/skills）`
        : '项目（打开工作区会话后可浏览）',
      items: skills.filter((s) => s.source === 'project'),
    },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="modal-overlay">
      <div className="modal-card skill-settings">
        <div className="provider-settings-header">
          <h2 className="model-picker-title">Skill 管理</h2>
          <button type="button" className="link-btn" onClick={() => void load()}>
            刷新
          </button>
          <button type="button" className="modal-close" onClick={close} aria-label="close">
            ×
          </button>
        </div>

        {error ? <div className="skill-error">{error}</div> : null}

        {skills.length === 0 ? (
          <div className="skill-empty">
            还没有发现 Skill。将带 SKILL.md 的目录放到 ~/.pi/agent/skills 或项目 .pi/skills 后刷新。
          </div>
        ) : (
          groups.map((group) => (
            <div className="skill-group" key={group.label}>
              <div className="skill-group-label">{group.label}</div>
              {group.items.map((view) => (
                <div className="skill-row" key={view.id}>
                  <button
                    type="button"
                    className="skill-row-main"
                    onClick={() => void toggleExpand(view.id)}
                    title={view.description ?? ''}
                  >
                    <span className={`skill-status ${statusClass(view.status)}`}>
                      {STATUS_LABEL[view.status]}
                    </span>
                    <span className="skill-name">{view.name ?? '(未命名)'}</span>
                    <span className="chip">{view.kind === 'dir' ? '目录' : '文件'}</span>
                    <span className="skill-desc">{view.description ?? '无描述'}</span>
                  </button>
                  {view.status === 'active' || view.status === 'disabled' ? (
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => void toggleEnabled(view)}
                    >
                      {view.status === 'active' ? '停用' : '启用'}
                    </button>
                  ) : null}
                  {expanded.has(view.id) ? (
                    <div className="skill-detail">
                      <div className="skill-meta">
                        <div>id：{view.id}</div>
                        <div>路径：{view.path}</div>
                        {view.license ? <div>license：{view.license}</div> : null}
                        {view.compatibility ? <div>compatibility：{view.compatibility}</div> : null}
                        {view.disableModelInvocation ? (
                          <div>disable-model-invocation：true</div>
                        ) : null}
                        {view.allowedTools && view.allowedTools.length > 0 ? (
                          <div>allowed-tools：{view.allowedTools.join(', ')}</div>
                        ) : null}
                        <div>文件：{view.files.join(', ')}</div>
                      </div>
                      {view.errors.length > 0 ? (
                        <div className="skill-errors">
                          {view.errors.map((e) => (
                            <div key={e}>✗ {e}</div>
                          ))}
                        </div>
                      ) : null}
                      {view.warnings.length > 0 ? (
                        <div className="skill-warnings">
                          {view.warnings.map((w) => (
                            <div key={w}>⚠ {w}</div>
                          ))}
                        </div>
                      ) : null}
                      {detailsError[view.id] ? (
                        <div className="skill-error">{detailsError[view.id]}</div>
                      ) : (
                        <pre className="skill-detail-md">{details[view.id] ?? '读取中…'}</pre>
                      )}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
