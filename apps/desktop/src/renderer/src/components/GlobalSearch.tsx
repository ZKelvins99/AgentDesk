/**
 * 全局搜索（README 9 / M8，⌘K / Ctrl+K）。
 * 搜索会话标题/文件名，混合结果分组，按 ↑↓ 导航，Enter 选中。
 */
import { useEffect, useRef, useState } from 'react';
import { useSessionStore } from '../stores/session-store';
import { useUiStore } from '../stores/ui-store';
import { useWorkspaceStore } from '../stores/workspace-store';
import { Icon } from './Icon';

type ResultKind = 'session' | 'file';

interface SearchResult {
  kind: ResultKind;
  id: string;
  label: string;
  sub?: string;
}

interface GlobalSearchProps {
  onClose: () => void;
}

export function GlobalSearch({ onClose }: GlobalSearchProps): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [cursor, setCursor] = useState(0);
  const [fileResults, setFileResults] = useState<SearchResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const summaries = useSessionStore((s) => s.summaries);
  const setActive = useSessionStore((s) => s.setActive);
  const attachSession = useSessionStore((s) => s.attachSession);
  const activeWorkspace = useWorkspaceStore((s) => s.workspaces[0]);
  const openDiff = useUiStore((s) => s.openDiff);

  /** 聚焦输入 */
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  /** 搜索逻辑 */
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const q = query.trim().toLowerCase();

    // 会话搜索（本地，即时）
    const sessionMatches: SearchResult[] = q
      ? summaries
          .filter(
            (s) => s.title.toLowerCase().includes(q) || (s.model ?? '').toLowerCase().includes(q),
          )
          .slice(0, 8)
          .map((s) => ({
            kind: 'session' as ResultKind,
            id: s.id,
            label: s.title,
            ...(s.model != null ? { sub: s.model } : {}),
          }))
      : summaries.slice(0, 5).map((s) => ({
          kind: 'session' as ResultKind,
          id: s.id,
          label: s.title,
          ...(s.model != null ? { sub: s.model } : {}),
        }));

    setResults([...sessionMatches, ...fileResults]);
    setCursor(0);

    // 文件搜索（防抖 300ms，只在有 workspace 时）
    if (q.length >= 2 && activeWorkspace) {
      timerRef.current = setTimeout(() => {
        void window.agentdesk.fileSystem
          .search({ root: activeWorkspace.path, query: q })
          .then((res) => {
            const fr: SearchResult[] = res.matches.slice(0, 6).map((m) => ({
              kind: 'file' as ResultKind,
              id: m.path,
              label: m.path.split(/[\\/]/).pop() ?? m.path,
              sub: m.path,
            }));
            setFileResults(fr);
            setResults([...sessionMatches, ...fr]);
          })
          .catch(() => {
            /* 忽略搜索错误 */
          });
      }, 300);
    } else {
      setFileResults([]);
    }
  }, [query, summaries, activeWorkspace, fileResults]);

  const select = async (result: SearchResult) => {
    if (result.kind === 'session') {
      setActive(result.id);
      await attachSession(result.id);
    } else {
      openDiff(result.id);
    }
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = results[cursor];
      if (r) void select(r);
    }
  };

  return (
    <div
      className="global-search-overlay"
      role="dialog"
      aria-label="全局搜索"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) onClose();
      }}
    >
      <div className="global-search-panel">
        <div className="global-search-input-wrap">
          <span className="global-search-icon">
            <Icon name="search" size={15} />
          </span>
          <input
            ref={inputRef}
            className="global-search-input"
            type="text"
            placeholder="搜索会话、文件…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button
              type="button"
              className="global-search-clear"
              onClick={() => setQuery('')}
              aria-label="清除"
            >
              <Icon name="close" size={12} />
            </button>
          )}
        </div>
        {results.length > 0 && (
          <div className="global-search-results" role="listbox">
            {results.map((r, i) => (
              <div
                key={r.id}
                role="option"
                aria-selected={i === cursor}
                className="global-search-result"
                data-active={i === cursor || undefined}
                onClick={() => void select(r)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') void select(r);
                }}
                onMouseEnter={() => setCursor(i)}
                tabIndex={i === cursor ? 0 : -1}
              >
                <span className="global-search-result-icon">
                  <Icon name={r.kind === 'session' ? 'message' : 'file'} size={14} />
                </span>
                <span className="global-search-result-label">{r.label}</span>
                {r.sub && <span className="global-search-result-sub">{r.sub}</span>}
              </div>
            ))}
          </div>
        )}
        {results.length === 0 && query.trim() && (
          <div className="global-search-empty">无匹配结果</div>
        )}
      </div>
    </div>
  );
}
