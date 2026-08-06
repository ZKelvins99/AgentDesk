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
  const [installOpen, setInstallOpen] = useState(false);
  const [installScope, setInstallScope] = useState<'global' | 'project'>('global');
  const [gitUrl, setGitUrl] = useState('');
  const [gitRef, setGitRef] = useState('');
  const [zipPath, setZipPath] = useState('');
  const [dirPath, setDirPath] = useState('');
  const [recommended, setRecommended] = useState<
    Array<{ id: string; name: string; url: string; description: string }>
  >([]);
  const [harnesses, setHarnesses] = useState<
    Array<{
      id: 'claude' | 'codex';
      name: string;
      path: string;
      exists: boolean;
      imported: boolean;
    }>
  >([]);
  const [installResult, setInstallResult] = useState('');
  const [installing, setInstalling] = useState(false);
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

  const openInstall = async (): Promise<void> => {
    setInstallOpen(true);
    setInstallResult('');
    setGitUrl('');
    setGitRef('');
    setZipPath('');
    setDirPath('');
    try {
      const [r, h] = await Promise.all([
        window.agentdesk.skills.recommended(),
        window.agentdesk.skills.harnessStatus(),
      ]);
      setRecommended(r.sources);
      setHarnesses(h.harnesses);
    } catch {
      setRecommended([]);
      setHarnesses([]);
    }
  };

  const pickZip = async (): Promise<void> => {
    const r = await window.agentdesk.workspace.pickFile();
    if (r.path) setZipPath(r.path);
  };

  const pickDir = async (): Promise<void> => {
    const r = await window.agentdesk.workspace.pickDirectory();
    if (r.path) setDirPath(r.path);
  };

  const doInstall = async (
    source:
      | { type: 'git'; url: string; ref?: string }
      | { type: 'zip'; path: string }
      | { type: 'dir'; path: string },
  ): Promise<void> => {
    setInstalling(true);
    setInstallResult('');
    try {
      const r = await window.agentdesk.skills.install({
        source,
        scope: installScope,
        ...(installScope === 'project' && workspacePath ? { workspacePath } : {}),
      });
      setInstallResult(
        `安装 ${r.installed.length} 个${
          r.skipped.length > 0
            ? `，跳过 ${r.skipped.length} 个（${r.skipped
                .map((s) => `${s.name}: ${s.reason}`)
                .join('；')}）`
            : ''
        }`,
      );
      await load();
    } catch (err) {
      setInstallResult(`安装失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setInstalling(false);
    }
  };

  const doImportHarness = async (harness: 'claude' | 'codex'): Promise<void> => {
    setInstalling(true);
    setInstallResult('');
    try {
      const r = await window.agentdesk.skills.importHarness({ harness });
      setInstallResult(
        r.added.length > 0
          ? `已加入 settings.skills[]：${r.added.join(', ')}`
          : '已在 settings.skills[] 中',
      );
      const h = await window.agentdesk.skills.harnessStatus();
      setHarnesses(h.harnesses);
      await load();
    } catch (err) {
      setInstallResult(`导入失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setInstalling(false);
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
          <button type="button" className="btn" onClick={() => void openInstall()}>
            + 安装
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

      {installOpen ? (
        <div className="modal-overlay">
          <div className="modal-card skill-install">
            <div className="provider-settings-header">
              <h3 className="model-picker-title">安装 Skill</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => setInstallOpen(false)}
                aria-label="close"
              >
                ×
              </button>
            </div>
            <label className="mcp-field">
              <span>作用域</span>
              <select
                value={installScope}
                onChange={(e) => setInstallScope(e.target.value as 'global' | 'project')}
              >
                <option value="global">全局（~/.pi/agent/skills）</option>
                <option value="project" disabled={!workspacePath}>
                  项目（.pi/skills）
                </option>
              </select>
            </label>

            <div className="skill-install-source">
              <div className="skill-group-label">Git 仓库</div>
              <div className="skill-install-row">
                <input
                  className="skill-install-input"
                  placeholder="https://github.com/user/skills-repo"
                  value={gitUrl}
                  onChange={(e) => setGitUrl(e.target.value)}
                  spellCheck={false}
                />
                <input
                  className="skill-install-input skill-install-ref"
                  placeholder="ref（可选）"
                  value={gitRef}
                  onChange={(e) => setGitRef(e.target.value)}
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="primary-btn"
                  onClick={() =>
                    void doInstall({
                      type: 'git',
                      url: gitUrl.trim(),
                      ...(gitRef.trim() ? { ref: gitRef.trim() } : {}),
                    })
                  }
                  disabled={installing || !gitUrl.trim()}
                >
                  安装
                </button>
              </div>
            </div>

            <div className="skill-install-source">
              <div className="skill-group-label">本地 zip</div>
              <div className="skill-install-row">
                <input
                  className="skill-install-input"
                  placeholder="未选择文件"
                  value={zipPath}
                  readOnly
                />
                <button type="button" className="btn" onClick={() => void pickZip()}>
                  选择 zip
                </button>
                <button
                  type="button"
                  className="primary-btn"
                  onClick={() => void doInstall({ type: 'zip', path: zipPath })}
                  disabled={installing || !zipPath}
                >
                  安装
                </button>
              </div>
            </div>

            <div className="skill-install-source">
              <div className="skill-group-label">本地目录</div>
              <div className="skill-install-row">
                <input
                  className="skill-install-input"
                  placeholder="未选择目录"
                  value={dirPath}
                  readOnly
                />
                <button type="button" className="btn" onClick={() => void pickDir()}>
                  选择目录
                </button>
                <button
                  type="button"
                  className="primary-btn"
                  onClick={() => void doInstall({ type: 'dir', path: dirPath })}
                  disabled={installing || !dirPath}
                >
                  安装
                </button>
              </div>
            </div>

            {recommended.length > 0 ? (
              <div className="skill-install-source">
                <div className="skill-group-label">推荐源（一键安装）</div>
                {recommended.map((src) => (
                  <div className="skill-install-row" key={src.id}>
                    <div className="skill-recommended">
                      <div className="skill-name">{src.name}</div>
                      <div className="skill-desc">{src.description}</div>
                    </div>
                    <button
                      type="button"
                      className="primary-btn"
                      onClick={() => void doInstall({ type: 'git', url: src.url })}
                      disabled={installing}
                    >
                      安装
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            {harnesses.length > 0 ? (
              <div className="skill-install-source">
                <div className="skill-group-label">导入其他 harness（加入 settings.skills[]）</div>
                {harnesses.map((h) => (
                  <div className="skill-install-row" key={h.id}>
                    <div className="skill-recommended">
                      <div className="skill-name">{h.name}</div>
                      <div className="skill-desc">
                        {h.path} · {h.exists ? (h.imported ? '已导入' : '未导入') : '目录不存在'}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="primary-btn"
                      onClick={() => void doImportHarness(h.id)}
                      disabled={installing || !h.exists || h.imported}
                    >
                      {h.imported ? '已导入' : '导入'}
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            {installResult ? (
              <div
                className={
                  installResult.startsWith('安装失败') ? 'skill-error' : 'skill-install-ok'
                }
              >
                {installResult}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
