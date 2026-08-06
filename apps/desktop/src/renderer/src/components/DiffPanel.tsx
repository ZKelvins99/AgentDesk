import type { DiffHunk, FileDiffResult } from '@agentdesk/ipc';
import { MergeView, unifiedMergeView } from '@codemirror/merge';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView } from '@codemirror/view';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

type DiffMode = 'unified' | 'split';

/** Diff 面板（README 8.9 / M8 第二步）：CodeMirror merge unified/split + 逐块接受/回滚（反向 patch + 审计）。 */
export function DiffPanel({
  root,
  file,
  onClose,
}: {
  root: string;
  file: string;
  onClose: () => void;
}): React.JSX.Element {
  const [diff, setDiff] = useState<FileDiffResult | null>(null);
  const [mode, setMode] = useState<DiffMode>('split');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<{ destroy: () => void } | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setError('');
    setMessage('');
    try {
      const res = await window.agentdesk.diff.file({ root, file });
      setDiff(res);
    } catch (err) {
      setDiff(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [root, file]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    viewRef.current?.destroy();
    viewRef.current = null;
    if (!diff || !hostRef.current) return;
    const host = hostRef.current;
    host.innerHTML = '';
    if (mode === 'split') {
      const view = new MergeView({
        a: { doc: diff.original, extensions: [EditorView.editable.of(false), oneDark] },
        b: { doc: diff.modified, extensions: [EditorView.editable.of(false), oneDark] },
        parent: host,
        orientation: 'a-b',
      });
      viewRef.current = view;
    } else {
      const view = new EditorView({
        doc: diff.modified,
        extensions: [oneDark, unifiedMergeView({ original: diff.original, mergeControls: false })],
        parent: host,
      });
      viewRef.current = view;
    }
    return () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, [diff, mode]);

  const applyHunk = async (hunk: DiffHunk, direction: 'accept' | 'revert'): Promise<void> => {
    const key = `${direction}:${hunk.id}`;
    setBusy(key);
    setError('');
    setMessage('');
    try {
      const res = await window.agentdesk.diff.applyHunk({
        file,
        patch: hunk.patch,
        direction,
        ...(root ? { workspacePath: root } : {}),
      });
      if (res.ok) {
        setMessage(res.message);
        await load();
      } else {
        setError(res.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy('');
    }
  };

  return (
    <aside className="diff-panel">
      <div className="diff-panel-header">
        <span className="diff-panel-title" title={file}>
          {fileNameOf(file)}
        </span>
        <div className="diff-mode-tabs">
          {(['split', 'unified'] as const).map((m) => (
            <button
              type="button"
              key={m}
              className={`diff-mode-tab ${mode === m ? 'active' : ''}`}
              onClick={() => setMode(m)}
            >
              {m === 'split' ? 'split' : 'unified'}
            </button>
          ))}
        </div>
        <button type="button" className="link-btn" onClick={() => void load()}>
          刷新
        </button>
        <button type="button" className="modal-close" onClick={onClose} aria-label="close">
          <Icon name="close" size={14} />
        </button>
      </div>

      {diff && !diff.gitAvailable ? (
        <div className="diff-note">git 不可用，基线为空（整个文件视为新增）。</div>
      ) : null}
      {diff?.gitAvailable && !diff.tracked ? (
        <div className="diff-note">未跟踪文件（git 基线为空）。</div>
      ) : null}
      {error ? <div className="diff-error">{error}</div> : null}
      {message ? <div className="diff-ok">{message}</div> : null}

      <div ref={hostRef} className="diff-merge-host" />

      {diff && diff.hunks.length === 0 ? (
        <div className="diff-empty">文件与基线一致，无改动。</div>
      ) : null}

      {diff && diff.hunks.length > 0 ? (
        <div className="diff-hunks">
          {diff.hunks.map((hunk) => (
            <div key={hunk.id} className="diff-hunk">
              <div className="diff-hunk-meta">
                <code>
                  @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
                </code>
                <span className="diff-hunk-actions">
                  <button
                    type="button"
                    className="btn"
                    disabled={busy !== ''}
                    onClick={() => void applyHunk(hunk, 'accept')}
                  >
                    {busy === `accept:${hunk.id}` ? '应用中…' : '接受此更改'}
                  </button>
                  <button
                    type="button"
                    className="btn danger-btn"
                    disabled={busy !== ''}
                    onClick={() => void applyHunk(hunk, 'revert')}
                  >
                    {busy === `revert:${hunk.id}` ? '撤销中…' : '撤销'}
                  </button>
                </span>
              </div>
              <div className="diff-hunk-lines">
                {previewLines(hunk).map(({ key, line }) => (
                  <div
                    key={key}
                    className={`diff-line diff-line-${line.prefix === ' ' ? 'ctx' : line.prefix}`}
                  >
                    <span className="diff-line-prefix">{line.prefix}</span>
                    <span className="diff-line-text">{line.text || ' '}</span>
                  </div>
                ))}
                {hunk.lines.length > 12 ? (
                  <div className="diff-line-ctx">… 共 {hunk.lines.length} 行 …</div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </aside>
  );
}

function fileNameOf(p: string): string {
  return p.split(/[\\/]/).filter(Boolean).pop() ?? p;
}

/** 预览行：按行号生成稳定 key（避免用数组下标）。 */
function previewLines(hunk: DiffHunk): Array<{ key: string; line: DiffHunk['lines'][number] }> {
  const out: Array<{ key: string; line: DiffHunk['lines'][number] }> = [];
  let oldLine = hunk.oldStart;
  let newLine = hunk.newStart;
  for (const line of hunk.lines.slice(0, 12)) {
    const num = line.prefix === '+' ? newLine : oldLine;
    if (line.prefix === '+') newLine += 1;
    else oldLine += 1;
    out.push({ key: `${hunk.id}-${num}-${line.prefix}`, line });
  }
  return out;
}
