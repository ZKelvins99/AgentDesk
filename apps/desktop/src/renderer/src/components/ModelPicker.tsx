import type { PiModelView } from '@agentdesk/ipc';
import { useEffect, useMemo, useState } from 'react';
import { t } from '../i18n';
import { useProviderStore } from '../stores/provider-store';
import { useSessionStore } from '../stores/session-store';
import { useUiStore } from '../stores/ui-store';

const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;

function formatContext(n: number | null): string | null {
  if (!n) return null;
  if (n >= 1_000_000) return t('model.picker.context', { n: `${(n / 1_000_000).toFixed(1)}M` });
  if (n >= 1_000) return t('model.picker.context', { n: `${Math.round(n / 1_000)}K` });
  return t('model.picker.context', { n: String(n) });
}

/** 模型选择器（README 8.6.4）：搜索 / 收藏 / 最近使用 / 能力标签 + 思考强度。 */
export function ModelPicker(): React.JSX.Element | null {
  const open = useUiStore((s) => s.modelPickerOpen);
  const close = useUiStore((s) => s.closeModelPicker);
  const openProviderSettings = useUiStore((s) => s.openProviderSettings);
  const activeId = useSessionStore((s) => s.activeSessionId);
  const sessions = useSessionStore((s) => s.sessions);
  const setSessionModel = useSessionStore((s) => s.setSessionModel);
  const setSessionThinking = useSessionStore((s) => s.setSessionThinking);
  const favorites = useProviderStore((s) => s.favorites);
  const recentModels = useProviderStore((s) => s.recentModels);
  const toggleFavorite = useProviderStore((s) => s.toggleFavorite);
  const markRecent = useProviderStore((s) => s.markRecent);

  const [models, setModels] = useState<PiModelView[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setBusy(true);
    setError(null);
    setModels([]);
    if (!activeId) {
      setBusy(false);
      return;
    }
    window.agentdesk.session
      .getModels({ sessionId: activeId })
      .then((r) => setModels(r.models))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false));
  }, [open, activeId]);

  const session = activeId ? sessions[activeId] : undefined;
  const currentModel = session?.model ?? null;
  const currentThinking = session?.thinkingLevel ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? models.filter(
          (m) =>
            m.id.toLowerCase().includes(q) ||
            (m.name ?? '').toLowerCase().includes(q) ||
            (m.provider ?? '').toLowerCase().includes(q),
        )
      : models;
    const fav = list.filter((m) => favorites.includes(m.id));
    const recent = list.filter((m) => recentModels.includes(m.id) && !favorites.includes(m.id));
    const rest = list.filter((m) => !favorites.includes(m.id) && !recentModels.includes(m.id));
    return [...fav, ...recent, ...rest];
  }, [models, query, favorites, recentModels]);

  if (!open) return null;

  const pick = async (m: PiModelView): Promise<void> => {
    if (!activeId) return;
    try {
      await window.agentdesk.session.setModel({ sessionId: activeId, model: m.id });
      setSessionModel(activeId, m.id);
      markRecent(m.id);
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const setThinking = async (level: string): Promise<void> => {
    if (!activeId) return;
    try {
      await window.agentdesk.session.setThinkingLevel({ sessionId: activeId, level });
      setSessionThinking(activeId, level);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t('model.picker.title')}
    >
      <div className="modal-card model-picker">
        <div className="model-picker-header">
          <div className="model-picker-title">{t('model.picker.title')}</div>
          <label className="thinking-select">
            <span>{t('model.picker.thinking')}</span>
            <select
              value={currentThinking ?? ''}
              disabled={busy}
              onChange={(e) => void setThinking(e.target.value)}
            >
              {THINKING_LEVELS.map((lvl) => (
                <option key={lvl} value={lvl}>
                  {t(`model.thinking.${lvl}`)}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="modal-close" onClick={close} aria-label="close">
            ✕
          </button>
        </div>
        <input
          className="model-search"
          placeholder={t('model.picker.search')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="model-list">
          {busy ? <div className="model-empty">{t('session.creating')}</div> : null}
          {!busy && filtered.length === 0 ? (
            <div className="model-empty">
              {t('model.picker.noModels')}
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  close();
                  openProviderSettings();
                }}
              >
                {t('model.picker.manageProviders')}
              </button>
            </div>
          ) : null}
          {filtered.map((m) => {
            const tags: string[] = [];
            if (m.reasoning) tags.push(t('model.picker.reasoning'));
            if (m.input.includes('image')) tags.push(t('model.picker.image'));
            const ctx = formatContext(m.contextWindow);
            if (ctx) tags.push(ctx);
            return (
              <button
                type="button"
                key={m.id}
                className="model-row"
                data-active={m.id === currentModel}
                onClick={() => void pick(m)}
              >
                <span className="model-row-main">
                  <span className="model-row-id">{m.name ?? m.id}</span>
                  {m.provider ? <span className="model-row-provider">{m.provider}</span> : null}
                </span>
                <span className="model-row-tags">
                  {tags.map((tag) => (
                    <span key={tag} className="model-tag">
                      {tag}
                    </span>
                  ))}
                </span>
                <button
                  type="button"
                  className="model-star"
                  aria-label={
                    favorites.includes(m.id)
                      ? t('model.picker.favorited')
                      : t('model.picker.favorite')
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(m.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation();
                      toggleFavorite(m.id);
                    }
                  }}
                >
                  {favorites.includes(m.id) ? '★' : '☆'}
                </button>
              </button>
            );
          })}
        </div>
        {error ? <div className="provider-error">{error}</div> : null}
        <div className="model-picker-footer">
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              close();
              openProviderSettings();
            }}
          >
            {t('model.picker.manageProviders')}
          </button>
        </div>
      </div>
    </div>
  );
}
