import type { SkillView } from '@agentdesk/ipc';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import CodeMirror from '@uiw/react-codemirror';
import { useCallback, useEffect, useRef, useState } from 'react';
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
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardName, setWizardName] = useState('');
  const [wizardDesc, setWizardDesc] = useState('');
  const [wizardTemplate, setWizardTemplate] = useState<'script' | 'docs' | 'api'>('docs');
  const [wizardScope, setWizardScope] = useState<'global' | 'project'>('global');
  const [wizardError, setWizardError] = useState('');
  const [editing, setEditing] = useState<SkillView | null>(null);
  const [editorContent, setEditorContent] = useState('');
  const [editorValidation, setEditorValidation] = useState<{
    errors: string[];
    warnings: string[];
    infos: string[];
  }>({ errors: [], warnings: [], infos: [] });
  const [editorError, setEditorError] = useState('');
  const [editorSaving, setEditorSaving] = useState(false);
  const validateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    return () => {
      if (validateTimer.current) clearTimeout(validateTimer.current);
    };
  }, []);

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

  const startWizard = (): void => {
    setWizardName('');
    setWizardDesc('');
    setWizardTemplate('docs');
    setWizardScope('global');
    setWizardError('');
    setWizardOpen(true);
  };

  const createSkill = async (): Promise<void> => {
    setWizardError('');
    try {
      const r = await window.agentdesk.skills.create({
        name: wizardName.trim(),
        description: wizardDesc.trim(),
        template: wizardTemplate,
        scope: wizardScope,
        ...(wizardScope === 'project' && workspacePath ? { workspacePath } : {}),
      });
      setWizardOpen(false);
      await load();
      setExpanded((s) => new Set(s).add(r.skill.id));
    } catch (err) {
      setWizardError(err instanceof Error ? err.message : String(err));
    }
  };

  const startEdit = async (view: SkillView): Promise<void> => {
    setEditorError('');
    setEditorValidation({ errors: [], warnings: [], infos: [] });
    try {
      const r = await window.agentdesk.skills.read({
        id: view.id,
        ...(workspacePath ? { workspacePath } : {}),
      });
      const dirName =
        view.kind === 'dir' ? (view.dir.split(/[\\/]/).pop() ?? undefined) : undefined;
      setEditing(view);
      setEditorContent(r.content);
      setEditorValidation(
        await window.agentdesk.skills.validate({
          content: r.content,
          ...(dirName !== undefined ? { dirName } : {}),
        }),
      );
    } catch (err) {
      setEditorError(err instanceof Error ? err.message : String(err));
    }
  };

  const onEditorChange = (value: string): void => {
    setEditorContent(value);
    if (validateTimer.current) clearTimeout(validateTimer.current);
    validateTimer.current = setTimeout(() => {
      void (async () => {
        try {
          const dirName =
            editing?.kind === 'dir' ? (editing.dir.split(/[\\/]/).pop() ?? undefined) : undefined;
          setEditorValidation(
            await window.agentdesk.skills.validate({
              content: value,
              ...(dirName !== undefined ? { dirName } : {}),
            }),
          );
        } catch {
          // 实时校验失败不阻塞编辑
        }
      })();
    }, 250);
  };

  const saveEdit = async (): Promise<void> => {
    if (!editing) return;
    setEditorSaving(true);
    setEditorError('');
    try {
      const r = await window.agentdesk.skills.update({
        id: editing.id,
        content: editorContent,
        ...(workspacePath ? { workspacePath } : {}),
      });
      setDetails((s) => ({ ...s, [editing.id]: editorContent }));
      setSkills((s) => s.map((v) => (v.id === editing.id ? r.skill : v)));
      setEditing(null);
      await load();
    } catch (err) {
      setEditorError(err instanceof Error ? err.message : String(err));
    } finally {
      setEditorSaving(false);
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
          <button type="button" className="btn" onClick={startWizard}>
            + 新建
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
                  <button type="button" className="link-btn" onClick={() => void startEdit(view)}>
                    编辑
                  </button>
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
                      {view.infos.length > 0 ? (
                        <div className="skill-infos">
                          {view.infos.map((i) => (
                            <div key={i}>ℹ {i}</div>
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

      {wizardOpen ? (
        <div className="modal-overlay">
          <div className="modal-card skill-wizard">
            <div className="provider-settings-header">
              <h3 className="model-picker-title">新建 Skill</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => setWizardOpen(false)}
                aria-label="close"
              >
                ×
              </button>
            </div>
            <label className="mcp-field">
              <span>name（小写字母/数字/连字符，≤64）</span>
              <input
                value={wizardName}
                onChange={(e) => setWizardName(e.target.value)}
                spellCheck={false}
              />
            </label>
            <label className="mcp-field">
              <span>description（必填，≤1024，具体描述何时使用）</span>
              <textarea value={wizardDesc} onChange={(e) => setWizardDesc(e.target.value)} />
            </label>
            <label className="mcp-field">
              <span>模板</span>
              <select
                value={wizardTemplate}
                onChange={(e) => setWizardTemplate(e.target.value as 'script' | 'docs' | 'api')}
              >
                <option value="docs">文档型（references/）</option>
                <option value="script">脚本型（scripts/）</option>
                <option value="api">API 型（references/）</option>
              </select>
            </label>
            <label className="mcp-field">
              <span>作用域</span>
              <select
                value={wizardScope}
                onChange={(e) => setWizardScope(e.target.value as 'global' | 'project')}
              >
                <option value="global">全局（~/.pi/agent/skills）</option>
                <option value="project" disabled={!workspacePath}>
                  项目（.pi/skills）
                </option>
              </select>
            </label>
            {wizardError ? <div className="skill-error">{wizardError}</div> : null}
            <div className="mcp-editor-actions">
              <button type="button" className="primary-btn" onClick={() => void createSkill()}>
                创建
              </button>
              <button type="button" className="btn" onClick={() => setWizardOpen(false)}>
                取消
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editing ? (
        <div className="modal-overlay">
          <div className="modal-card skill-editor">
            <div className="provider-settings-header">
              <h3 className="model-picker-title">编辑 {editing.name ?? editing.id}</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => setEditing(null)}
                aria-label="close"
              >
                ×
              </button>
            </div>
            <CodeMirror
              value={editorContent}
              height="320px"
              theme={oneDark}
              extensions={[markdown()]}
              onChange={onEditorChange}
              basicSetup={{ lineNumbers: true, foldGutter: true }}
            />
            <div className="skill-validation">
              {editorValidation.errors.length === 0 &&
              editorValidation.warnings.length === 0 &&
              editorValidation.infos.length === 0 ? (
                <div className="skill-validation-ok">✓ frontmatter 合规</div>
              ) : null}
              {editorValidation.errors.map((e) => (
                <div key={e} className="skill-validation-error">
                  ✗ {e}
                </div>
              ))}
              {editorValidation.warnings.map((w) => (
                <div key={w} className="skill-validation-warning">
                  ⚠ {w}
                </div>
              ))}
              {editorValidation.infos.map((i) => (
                <div key={i} className="skill-validation-info">
                  ℹ {i}
                </div>
              ))}
            </div>
            {editorError ? <div className="skill-error">{editorError}</div> : null}
            <div className="mcp-editor-actions">
              <button
                type="button"
                className="primary-btn"
                onClick={() => void saveEdit()}
                disabled={editorSaving}
              >
                {editorSaving ? '保存中…' : '保存'}
              </button>
              <button type="button" className="btn" onClick={() => setEditing(null)}>
                取消
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
