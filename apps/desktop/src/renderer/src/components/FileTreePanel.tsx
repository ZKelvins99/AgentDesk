import type { FileTreeEntry } from '@agentdesk/ipc';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useUiStore } from '../stores/ui-store';

/** 文件树（README 8.9 / M8）：懒加载、尊重 .gitignore、rg 文件名搜索。 */
export function FileTreePanel({ root }: { root: string }): React.JSX.Element | null {
  const [entries, setEntries] = useState<Record<string, FileTreeEntry[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [matches, setMatches] = useState<Array<{ path: string }> | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openDiff = useUiStore((s) => s.openDiff);

  const loadDir = useCallback(
    async (dir: string): Promise<void> => {
      if (entries[dir] !== undefined || loading[dir]) return;
      setLoading((s) => ({ ...s, [dir]: true }));
      setError('');
      try {
        const res = await window.agentdesk.fileSystem.listDir({ path: dir, root });
        setEntries((s) => ({ ...s, [dir]: res.entries }));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading((s) => ({ ...s, [dir]: false }));
      }
    },
    [entries, loading, root],
  );

  useEffect(() => {
    setEntries({});
    setExpanded(new Set([root]));
    setMatches(null);
    void loadDir(root);
  }, [root, loadDir]);

  useEffect(
    () => () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    },
    [],
  );

  const toggle = (dir: string): void => {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(dir)) {
        next.delete(dir);
      } else {
        next.add(dir);
        void loadDir(dir);
      }
      return next;
    });
  };

  const onSearchChange = (value: string): void => {
    setQuery(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = value.trim();
    if (!q) {
      setMatches(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimer.current = setTimeout(() => {
      void window.agentdesk.fileSystem
        .search({ root, query: q })
        .then((res) => setMatches(res.matches))
        .catch((err) => setError(err instanceof Error ? err.message : String(err)))
        .finally(() => setSearching(false));
    }, 250);
  };

  if (!root) return null;

  const renderEntry = (entry: FileTreeEntry, depth: number): React.JSX.Element => {
    const isDir = entry.kind === 'dir';
    const open = isDir && expanded.has(entry.path);
    const children = isDir ? (entries[entry.path] ?? []) : [];
    const isLoading = isDir && loading[entry.path] === true;
    return (
      <div key={entry.path}>
        <button
          type="button"
          className="file-tree-row"
          style={{ paddingLeft: `${8 + depth * 14}px` }}
          data-kind={entry.kind}
          data-hidden={entry.hidden || undefined}
          onClick={() => {
            if (isDir) toggle(entry.path);
            else openDiff(entry.path);
          }}
          title={entry.path}
        >
          <span className="file-tree-caret">{isDir ? (open ? '▾' : '▸') : ''}</span>
          <span className="file-tree-icon">{isDir ? '📁' : '📄'}</span>
          <span className="file-tree-name">{entry.name}</span>
          {entry.size !== null ? (
            <span className="file-tree-size">{formatSize(entry.size)}</span>
          ) : null}
        </button>
        {isDir && open ? (
          <div>
            {isLoading ? (
              <div
                className="file-tree-row file-tree-loading"
                style={{ paddingLeft: `${22 + depth * 14}px` }}
              >
                加载中…
              </div>
            ) : null}
            {children.map((child) => renderEntry(child, depth + 1))}
            {!isLoading && children.length === 0 ? (
              <div
                className="file-tree-row file-tree-empty"
                style={{ paddingLeft: `${22 + depth * 14}px` }}
              >
                （空）
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <aside className="file-tree-panel">
      <div className="file-tree-header">
        <span className="file-tree-title" title={root}>
          {rootName(root)}
        </span>
        <input
          className="file-tree-search"
          placeholder="搜索文件名…"
          value={query}
          spellCheck={false}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
      {error ? <div className="file-tree-error">{error}</div> : null}
      <div className="file-tree-body">
        {query.trim() ? (
          searching ? (
            <div className="file-tree-empty">搜索中…</div>
          ) : matches && matches.length === 0 ? (
            <div className="file-tree-empty">无匹配文件</div>
          ) : (
            (matches ?? []).map((m) => (
              <div key={m.path} className="file-tree-row" title={m.path}>
                <span className="file-tree-icon">📄</span>
                <span className="file-tree-name">{rootName(m.path)}</span>
                <span className="file-tree-size">{relativeTo(root, m.path)}</span>
              </div>
            ))
          )
        ) : (
          renderEntry(
            { name: rootName(root), path: root, kind: 'dir', size: null, hidden: false },
            0,
          )
        )}
      </div>
    </aside>
  );
}

function rootName(p: string): string {
  const base = p.split(/[\\/]/).filter(Boolean).pop();
  return base || p;
}

function relativeTo(root: string, p: string): string {
  const rel = p.startsWith(root) ? p.slice(root.length).replace(/^[\\/]/, '') : p;
  return rel || rootName(p);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
