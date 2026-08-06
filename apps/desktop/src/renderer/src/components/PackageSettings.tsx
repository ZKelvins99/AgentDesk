import type { PackageSecurityInspection, PackageView } from '@agentdesk/ipc';
import { useCallback, useEffect, useState } from 'react';
import { useSessionStore } from '../stores/session-store';
import { useUiStore } from '../stores/ui-store';

const SOURCE_LABEL: Record<PackageView['sourceType'], string> = {
  npm: 'npm',
  git: 'git',
  local: '本地',
};

const CONFLICT_LABEL: Record<NonNullable<PackageView['conflict']>, string> = {
  'project-overrides': '项目同名条目覆盖全局',
  'delta-overlay': '项目条目 delta 叠加（autoload:false）',
  'overridden-by-project': '被项目同名条目覆盖',
};

const CATEGORIES = ['extensions', 'skills', 'prompts', 'themes'] as const;
type Category = (typeof CATEGORIES)[number];
const CATEGORY_LABEL: Record<Category, string> = {
  extensions: 'extensions',
  skills: 'skills',
  prompts: 'prompts',
  themes: 'themes',
};

interface FilterDraft {
  categories: Record<Category, { enabled: boolean; patterns: string }>;
  autoload: boolean;
}

function isPackageDisabled(view: PackageView): boolean {
  if (!view.filter) return false;
  return CATEGORIES.every((cat) => {
    const arr = view.filter?.[cat];
    return Array.isArray(arr) && arr.length === 0;
  });
}

function initDraft(view: PackageView): FilterDraft {
  const categories = {} as Record<Category, { enabled: boolean; patterns: string }>;
  for (const cat of CATEGORIES) {
    const arr = view.filter?.[cat];
    const enabled = arr === undefined || arr.length > 0;
    categories[cat] = {
      enabled,
      patterns: arr && arr.length > 0 ? arr.join('\n') : '',
    };
  }
  return { categories, autoload: view.filter?.autoload === false };
}

/** Pi Package 管理（M7 第五步，README 8.5.1）：列表/安装/卸载/更新/资源级启停/作用域。 */
export function PackageSettings(): React.JSX.Element | null {
  const open = useUiStore((s) => s.packageSettingsOpen);
  const close = useUiStore((s) => s.closePackageSettings);
  const activeId = useSessionStore((s) => s.activeSessionId);
  const sessions = useSessionStore((s) => s.sessions);
  const workspacePath = activeId ? (sessions[activeId]?.workspacePath ?? '') : '';

  const [packages, setPackages] = useState<PackageView[]>([]);
  const [scopeTab, setScopeTab] = useState<'global' | 'project'>('global');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, FilterDraft>>({});
  const [error, setError] = useState('');
  const [actionLog, setActionLog] = useState('');
  const [busyId, setBusyId] = useState('');

  const [installOpen, setInstallOpen] = useState(false);
  const [installScope, setInstallScope] = useState<'global' | 'project'>('global');
  const [installType, setInstallType] = useState<'npm' | 'git' | 'local'>('npm');
  const [npmName, setNpmName] = useState('');
  const [npmVersion, setNpmVersion] = useState('');
  const [gitUrl, setGitUrl] = useState('');
  const [gitRef, setGitRef] = useState('');
  const [localPath, setLocalPath] = useState('');
  const [installLog, setInstallLog] = useState('');
  const [installing, setInstalling] = useState(false);
  const [inspection, setInspection] = useState<PackageSecurityInspection | null>(null);
  const [inspectionError, setInspectionError] = useState('');
  const [inspecting, setInspecting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setError('');
    try {
      const res = await window.agentdesk.packages.list(workspacePath ? { workspacePath } : {});
      setPackages(res.packages);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [workspacePath]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  if (!open) return null;

  const toggleExpand = (view: PackageView): void => {
    const next = new Set(expanded);
    if (next.has(view.id)) {
      next.delete(view.id);
      setExpanded(next);
      return;
    }
    next.add(view.id);
    setExpanded(next);
    setDrafts((s) => ({ ...s, [view.id]: initDraft(view) }));
  };

  const runAction = async (
    label: string,
    fn: () => Promise<{ log: string; note?: string }>,
    id?: string,
  ): Promise<void> => {
    setError('');
    setActionLog('');
    setBusyId(id ?? label);
    try {
      const r = await fn();
      setActionLog(`${label}：${r.note ? `${r.note}\n` : ''}${r.log}`);
      await load();
    } catch (err) {
      setActionLog(`${label}失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusyId('');
    }
  };

  const doToggleEnabled = (view: PackageView): void => {
    const disabled = isPackageDisabled(view);
    void runAction(
      disabled ? '启用' : '停用',
      async () => {
        const r = await window.agentdesk.packages.setFilter({
          source: view.source,
          scope: view.scope,
          filter: disabled ? {} : { extensions: [], skills: [], prompts: [], themes: [] },
          ...(workspacePath ? { workspacePath } : {}),
        });
        setDrafts((s) => ({ ...s, [r.package.id]: initDraft(r.package) }));
        return { log: r.package.id };
      },
      view.id,
    );
  };

  const saveFilter = (view: PackageView): void => {
    const draft = drafts[view.id];
    if (!draft) return;
    void runAction(
      '保存过滤',
      async () => {
        const filter: {
          extensions?: string[];
          skills?: string[];
          prompts?: string[];
          themes?: string[];
          autoload?: boolean;
        } = {};
        for (const cat of CATEGORIES) {
          const d = draft.categories[cat];
          if (!d.enabled) {
            filter[cat] = [];
          } else {
            const patterns = d.patterns
              .split('\n')
              .map((s) => s.trim())
              .filter(Boolean);
            if (patterns.length > 0) filter[cat] = patterns;
          }
        }
        if (draft.autoload) filter.autoload = false;
        const r = await window.agentdesk.packages.setFilter({
          source: view.source,
          scope: view.scope,
          filter,
          ...(workspacePath ? { workspacePath } : {}),
        });
        setDrafts((s) => ({ ...s, [r.package.id]: initDraft(r.package) }));
        return { log: '已写入 settings.packages[] 对象形式过滤' };
      },
      view.id,
    );
  };

  const updateCategory = (
    id: string,
    cat: Category,
    patch: Partial<{ enabled: boolean; patterns: string }>,
  ): void => {
    setDrafts((s) => {
      const current = s[id];
      if (!current) return s;
      return {
        ...s,
        [id]: {
          ...current,
          categories: {
            ...current.categories,
            [cat]: { ...current.categories[cat], ...patch },
          },
        },
      };
    });
  };

  const updateAutoload = (id: string, autoload: boolean): void => {
    setDrafts((s) => {
      const current = s[id];
      if (!current) return s;
      return { ...s, [id]: { ...current, autoload } };
    });
  };

  const sourceOf = ():
    | { type: 'npm'; name: string; version?: string }
    | { type: 'git'; url: string; ref?: string }
    | { type: 'local'; path: string } => {
    if (installType === 'npm') {
      return {
        type: 'npm',
        name: npmName.trim(),
        ...(npmVersion.trim() ? { version: npmVersion.trim() } : {}),
      };
    }
    if (installType === 'git') {
      return {
        type: 'git',
        url: gitUrl.trim(),
        ...(gitRef.trim() ? { ref: gitRef.trim() } : {}),
      };
    }
    return { type: 'local', path: localPath };
  };

  const sourceValid = (): boolean => {
    if (installType === 'npm') return npmName.trim().length > 0;
    if (installType === 'git') return gitUrl.trim().length > 0;
    return localPath.length > 0;
  };

  const resetReview = (): void => {
    setInspection(null);
    setInspectionError('');
    setConfirmed(false);
  };

  const doInspect = (): void => {
    const source = sourceOf();
    if (!sourceValid()) return;
    setInspecting(true);
    setInspectionError('');
    setInspection(null);
    setConfirmed(false);
    void window.agentdesk.packages
      .inspect({ source })
      .then((r) => setInspection(r.inspection))
      .catch((err) =>
        setInspectionError(`审查失败：${err instanceof Error ? err.message : String(err)}`),
      )
      .finally(() => setInspecting(false));
  };

  const doInstall = (): void => {
    const source = sourceOf();
    setInstalling(true);
    setInstallLog('');
    setError('');
    void window.agentdesk.packages
      .install({
        source,
        scope: installScope,
        ...(installScope === 'project' && workspacePath ? { workspacePath } : {}),
      })
      .then((r) => {
        setInstallLog(r.ok ? `✓ ${r.command}\n${r.log}` : `✗ ${r.command}\n${r.log}`);
        if (r.ok) {
          setInstallOpen(false);
          resetReview();
          void load();
        }
      })
      .catch((err) =>
        setInstallLog(`安装失败：${err instanceof Error ? err.message : String(err)}`),
      )
      .finally(() => setInstalling(false));
  };

  const pickLocalDir = async (): Promise<void> => {
    const r = await window.agentdesk.workspace.pickDirectory();
    if (r.path) setLocalPath(r.path);
  };

  const visible = packages.filter((p) => p.scope === scopeTab);
  const groups: Array<{ scope: 'global' | 'project'; label: string; items: PackageView[] }> = [
    {
      scope: 'global',
      label: '全局（~/.pi/agent/settings.json）',
      items: packages.filter((p) => p.scope === 'global'),
    },
    {
      scope: 'project',
      label: workspacePath
        ? `项目（${workspacePath}/.pi/settings.json）`
        : '项目（打开工作区会话后可管理）',
      items: packages.filter((p) => p.scope === 'project'),
    },
  ];

  return (
    <div className="modal-overlay">
      <div className="modal-card skill-settings package-settings">
        <div className="provider-settings-header">
          <h2 className="model-picker-title">插件（Pi Package）</h2>
          <button type="button" className="link-btn" onClick={() => void load()}>
            刷新
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setInstallOpen(true);
              setInstallLog('');
              setNpmName('');
              setNpmVersion('');
              setGitUrl('');
              setGitRef('');
              setLocalPath('');
              resetReview();
            }}
          >
            + 安装
          </button>
          <button
            type="button"
            className="btn"
            disabled={busyId === 'batch-update'}
            onClick={() =>
              void runAction(
                '批量更新扩展',
                async () =>
                  window.agentdesk.packages.update({
                    extensions: true,
                    scope: scopeTab,
                    ...(scopeTab === 'project' && workspacePath ? { workspacePath } : {}),
                  }),
                'batch-update',
              )
            }
          >
            更新扩展
          </button>
          <button type="button" className="modal-close" onClick={close} aria-label="close">
            ×
          </button>
        </div>

        <div className="package-scope-tabs">
          {groups.map((g) => (
            <button
              type="button"
              key={g.label}
              className={`package-scope-tab ${scopeTab === g.scope ? 'active' : ''}`}
              onClick={() => {
                setScopeTab(g.scope);
                setActionLog('');
              }}
            >
              {g.label}
            </button>
          ))}
        </div>

        {error ? <div className="skill-error">{error}</div> : null}
        {actionLog ? (
          <div className={actionLog.includes('失败') ? 'skill-error' : 'skill-install-ok'}>
            <pre className="package-log">{actionLog}</pre>
          </div>
        ) : null}

        {visible.length === 0 ? (
          <div className="skill-empty">
            {scopeTab === 'project' && !workspacePath
              ? '打开工作区会话后可管理项目作用域的包。'
              : '还没有 Package。点击「+ 安装」安装 npm / git / 本地插件，或直接编辑 settings.packages[]。'}
          </div>
        ) : (
          visible.map((view) => (
            <div className="skill-row" key={view.id}>
              <button type="button" className="skill-row-main" onClick={() => toggleExpand(view)}>
                <span
                  className={`skill-status ${
                    isPackageDisabled(view) ? 'skill-status-disabled' : 'skill-status-active'
                  }`}
                >
                  {isPackageDisabled(view) ? '停用' : '启用'}
                </span>
                <span className="chip package-source-chip">{SOURCE_LABEL[view.sourceType]}</span>
                <span className="skill-name">{view.name}</span>
                <span className="skill-desc">
                  {view.version ? `v${view.version}` : ''}
                  {view.ref ? `@${view.ref}` : ''}
                  {` · ext ${view.resources.extensions} / skill ${view.resources.skills} / prompt ${view.resources.prompts} / theme ${view.resources.themes}`}
                  {view.conflict ? ` · ${CONFLICT_LABEL[view.conflict]}` : ''}
                  {!view.installed ? ' · 未安装' : ''}
                </span>
                <span className="skill-detail-arrow">{expanded.has(view.id) ? '▾' : '▸'}</span>
              </button>

              {expanded.has(view.id) ? (
                <div className="skill-detail">
                  <div className="skill-meta">
                    <div>source：{view.source}</div>
                    <div>安装路径：{view.installPath ?? '未安装（不在磁盘上）'}</div>
                    <div>
                      资源：extensions {view.resources.extensions} / skills {view.resources.skills}{' '}
                      / prompts {view.resources.prompts} / themes {view.resources.themes}
                    </div>
                    {view.conflict ? (
                      <div className="package-conflict">{CONFLICT_LABEL[view.conflict]}</div>
                    ) : null}
                  </div>

                  <div className="package-filter">
                    <div className="skill-group-label">
                      资源级启停（settings.packages[] 对象过滤，[]=全不加载）
                    </div>
                    {CATEGORIES.map((cat) => {
                      const d = drafts[view.id]?.categories[cat];
                      if (!d) return null;
                      return (
                        <div className="package-category" key={cat}>
                          <label className="package-cat-toggle">
                            <input
                              type="checkbox"
                              checked={d.enabled}
                              onChange={(e) =>
                                updateCategory(view.id, cat, { enabled: e.target.checked })
                              }
                            />
                            {CATEGORY_LABEL[cat]}（{view.resources[cat]}）
                          </label>
                          {d.enabled ? (
                            <textarea
                              className="package-patterns"
                              placeholder={
                                '过滤规则，每行一个；支持 !排除 / +强制包含 / -精确排除；留空=全部加载'
                              }
                              value={d.patterns}
                              spellCheck={false}
                              onChange={(e) =>
                                updateCategory(view.id, cat, { patterns: e.target.value })
                              }
                            />
                          ) : null}
                        </div>
                      );
                    })}
                    <label className="package-cat-toggle">
                      <input
                        type="checkbox"
                        checked={drafts[view.id]?.autoload ?? false}
                        onChange={(e) => updateAutoload(view.id, e.target.checked)}
                      />
                      autoload:false（项目同名包按 delta 叠加，不覆盖全局）
                    </label>
                    <div className="package-actions">
                      <button
                        type="button"
                        className="btn"
                        disabled={busyId === view.id}
                        onClick={() => doToggleEnabled(view)}
                      >
                        {isPackageDisabled(view) ? '启用' : '停用'}
                      </button>
                      <button
                        type="button"
                        className="primary-btn"
                        disabled={busyId === view.id}
                        onClick={() => saveFilter(view)}
                      >
                        保存过滤
                      </button>
                      <button
                        type="button"
                        className="btn"
                        disabled={busyId === view.id}
                        onClick={() =>
                          void runAction(
                            '更新',
                            async () =>
                              window.agentdesk.packages.update({
                                source: view.source,
                                scope: view.scope,
                                ...(workspacePath ? { workspacePath } : {}),
                              }),
                            view.id,
                          )
                        }
                      >
                        更新
                      </button>
                      <button
                        type="button"
                        className="btn danger-btn"
                        disabled={busyId === view.id}
                        onClick={() =>
                          void runAction(
                            '卸载',
                            async () =>
                              window.agentdesk.packages.uninstall({
                                source: view.source,
                                scope: view.scope,
                                ...(workspacePath ? { workspacePath } : {}),
                              }),
                            view.id,
                          )
                        }
                      >
                        卸载
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>

      {installOpen ? (
        <div className="modal-overlay">
          <div className="modal-card skill-settings">
            <div className="provider-settings-header">
              <h2 className="model-picker-title">安装 Pi Package</h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => setInstallOpen(false)}
                aria-label="close"
              >
                ×
              </button>
            </div>

            <div className="skill-group-label">作用域</div>
            <div className="skill-install-row">
              <select
                className="skill-install-input"
                value={installScope}
                onChange={(e) => setInstallScope(e.target.value as 'global' | 'project')}
              >
                <option value="global">全局（~/.pi/agent）</option>
                <option value="project" disabled={!workspacePath}>
                  项目（.pi，需打开工作区会话）
                </option>
              </select>
            </div>

            <div className="skill-group-label">来源类型</div>
            <div className="skill-install-row">
              {(['npm', 'git', 'local'] as const).map((t) => (
                <label className="package-source-type" key={t}>
                  <input
                    type="radio"
                    name="install-type"
                    checked={installType === t}
                    onChange={() => {
                      setInstallType(t);
                      resetReview();
                    }}
                  />
                  {t === 'npm' ? 'npm 包名' : t === 'git' ? 'Git URL' : '本地目录'}
                </label>
              ))}
            </div>

            {installType === 'npm' ? (
              <>
                <div className="skill-group-label">
                  npm 包名（带版本后 pi update 会跳过，需说明）
                </div>
                <div className="skill-install-row">
                  <input
                    className="skill-install-input"
                    placeholder="@scope/pkg"
                    value={npmName}
                    onChange={(e) => {
                      setNpmName(e.target.value);
                      resetReview();
                    }}
                    spellCheck={false}
                  />
                  <input
                    className="skill-install-input skill-install-ref"
                    placeholder="版本（可选）"
                    value={npmVersion}
                    onChange={(e) => {
                      setNpmVersion(e.target.value);
                      resetReview();
                    }}
                    spellCheck={false}
                  />
                </div>
              </>
            ) : null}

            {installType === 'git' ? (
              <>
                <div className="skill-group-label">Git 仓库 URL</div>
                <div className="skill-install-row">
                  <input
                    className="skill-install-input"
                    placeholder="https://github.com/user/repo.git"
                    value={gitUrl}
                    onChange={(e) => {
                      setGitUrl(e.target.value);
                      resetReview();
                    }}
                    spellCheck={false}
                  />
                  <input
                    className="skill-install-input skill-install-ref"
                    placeholder="ref（可选）"
                    value={gitRef}
                    onChange={(e) => {
                      setGitRef(e.target.value);
                      resetReview();
                    }}
                    spellCheck={false}
                  />
                </div>
              </>
            ) : null}

            {installType === 'local' ? (
              <div className="skill-install-source">
                <div className="skill-group-label">本地目录</div>
                <div className="skill-install-row">
                  <input
                    className="skill-install-input"
                    placeholder="未选择目录"
                    value={localPath}
                    readOnly
                  />
                  <button type="button" className="btn" onClick={() => void pickLocalDir()}>
                    选择目录
                  </button>
                </div>
              </div>
            ) : null}

            <div className="skill-install-row package-install-footer">
              <div className="package-warning">
                ⚠ 安装插件 = 执行第三方代码，拥有完整系统权限（pi install 会跑 npm install）。
              </div>
              <button
                type="button"
                className="btn"
                disabled={inspecting || !sourceValid()}
                onClick={doInspect}
              >
                {inspecting ? '审查中…' : '安全审查'}
              </button>
              <button
                type="button"
                className="primary-btn"
                disabled={installing || !confirmed || !inspection}
                onClick={doInstall}
              >
                安装
              </button>
            </div>

            {inspectionError ? <div className="skill-error">{inspectionError}</div> : null}

            {inspection ? (
              <div className="package-review">
                <div className="skill-group-label">
                  安全审查：{inspection.name}
                  {inspection.version ? `@${inspection.version}` : ''}（{inspection.sourceType}，
                  {inspection.fileCount} 个文件）
                </div>
                {inspection.warnings.length > 0 ? (
                  <div className="package-review-warning">
                    {inspection.warnings.map((w) => (
                      <div key={w}>⚠ {w}</div>
                    ))}
                  </div>
                ) : null}
                <div className="package-review-grid">
                  <div>
                    <div className="skill-group-label">文件清单（前 300 个）</div>
                    <pre className="package-file-list">
                      {inspection.files.length > 0 ? inspection.files.join('\n') : '（空）'}
                    </pre>
                  </div>
                  <div>
                    <div className="skill-group-label">dependencies</div>
                    <pre className="package-file-list">
                      {Object.keys(inspection.dependencies).length > 0
                        ? Object.entries(inspection.dependencies)
                            .map(([k, v]) => `${k}@${v}`)
                            .join('\n')
                        : '（无运行时依赖）'}
                    </pre>
                    <div className="skill-group-label">安装脚本</div>
                    <pre className="package-file-list">
                      {Object.keys(inspection.installScripts).length > 0
                        ? Object.entries(inspection.installScripts)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join('\n')
                        : '（无 preinstall/install/postinstall）'}
                    </pre>
                    {inspection.license ? (
                      <div className="skill-group-label">许可证：{inspection.license}</div>
                    ) : null}
                    {inspection.description ? (
                      <div className="skill-group-label">描述：{inspection.description}</div>
                    ) : null}
                  </div>
                </div>
                <label className="package-confirm">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  我理解此包将以我的权限运行任意代码
                </label>
              </div>
            ) : null}

            {installLog ? (
              <div
                className={
                  installLog.startsWith('✗') || installLog.startsWith('安装失败')
                    ? 'skill-error'
                    : 'skill-install-ok'
                }
              >
                <pre className="package-log">{installLog}</pre>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
