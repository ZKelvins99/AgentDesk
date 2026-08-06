import type { ExtensionRuntimeNote, ExtensionView } from '@agentdesk/ipc';
import { useCallback, useEffect, useState } from 'react';
import { Icon } from './Icon';

const SOURCE_LABEL: Record<ExtensionView['source'], string> = {
  global: '全局目录',
  project: '项目目录',
  configured: 'settings.extensions[]',
};

const LEVEL_LABEL: Record<ExtensionView['level'], string> = {
  FULL: 'FULL 正常',
  PARTIAL: 'PARTIAL 部分兼容',
  DEGRADED: 'DEGRADED 降级',
  TUI_ONLY: 'TUI_ONLY 仅终端',
};

/** Extension 兼容性标注面板（README 8.5.2）：静态扫描 + 运行时捕获，不阻止加载。 */
export function ExtensionCompatPanel({
  workspacePath,
  onClose,
}: {
  workspacePath: string;
  onClose: () => void;
}): React.JSX.Element {
  const [extensions, setExtensions] = useState<ExtensionView[]>([]);
  const [runtimeNotes, setRuntimeNotes] = useState<ExtensionRuntimeNote[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError('');
    try {
      const res = await window.agentdesk.extensions.list(workspacePath ? { workspacePath } : {});
      setExtensions(res.extensions);
      setRuntimeNotes(res.runtimeNotes);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [workspacePath]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="modal-overlay">
      <div className="modal-card skill-settings ext-compat-card">
        <div className="provider-settings-header">
          <h2 className="model-picker-title">Extension 兼容性</h2>
          <button type="button" className="link-btn" onClick={() => void load()}>
            刷新
          </button>
          <button type="button" className="modal-close" onClick={onClose} aria-label="close">
            <Icon name="close" size={14} />
          </button>
        </div>

        {error ? <div className="skill-error">{error}</div> : null}

        {runtimeNotes.length > 0 ? (
          <div className="ext-runtime-notes">
            <div className="skill-group-label">运行时捕获（无法映射的请求 / extension 错误）</div>
            {runtimeNotes.map((note) => (
              <div key={`${note.at}-${note.kind}-${note.detail}`} className="ext-runtime-note">
                {note.detail}
              </div>
            ))}
          </div>
        ) : null}

        {loading ? (
          <div className="skill-empty">扫描中…</div>
        ) : extensions.length === 0 ? (
          <div className="skill-empty">
            未发现扩展。扩展位于 ~/.pi/agent/extensions、项目 .pi/extensions 或
            settings.extensions[]。
          </div>
        ) : (
          <div className="ext-list">
            {extensions.map((ext) => (
              <div key={ext.path} className="ext-row">
                <div className="ext-row-head">
                  <span className={`ext-level-chip ext-level-${ext.level.toLowerCase()}`}>
                    {LEVEL_LABEL[ext.level]}
                  </span>
                  <span className="ext-name">{ext.name}</span>
                  <span className="chip package-source-chip">{SOURCE_LABEL[ext.source]}</span>
                </div>
                <div className="ext-path">{ext.path}</div>
                {ext.issues.length > 0 ? (
                  <ul className="ext-issues">
                    {ext.issues.map((issue) => (
                      <li key={`${issue.api}-${issue.line}`}>
                        <code>{issue.api}</code>
                        {issue.line ? ` @ 第 ${issue.line} 行` : ''}
                        {issue.snippet ? ` — ${issue.snippet}` : ''}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="ext-issues-ok">未发现受限 API 调用（FULL）。</div>
                )}
                {ext.runtimeNotes.length > 0 ? (
                  <div className="ext-runtime-notes">
                    {ext.runtimeNotes.map((note) => (
                      <div
                        key={`${note.at}-${note.kind}-${note.detail}`}
                        className="ext-runtime-note"
                      >
                        {note.detail}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}

        <div className="settings-note">
          兼容性标注不阻止加载（README 8.5.2）：静态扫描为 best-effort 词法分析，运行时捕获会补充
          无法映射的请求。PARTIAL 映射到桌面状态栏/侧栏可能样式受限；DEGRADED
          渲染降级为纯文本/JSON； TUI_ONLY 仅在终端有意义。
        </div>
      </div>
    </div>
  );
}
