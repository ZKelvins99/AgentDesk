/**
 * 命令面板（README 9 / M8，⌘P / Ctrl+P）。
 * 快速访问所有命令，按 ↑↓ 导航，Enter 执行。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSessionStore } from '../stores/session-store';
import { useUiStore } from '../stores/ui-store';
import { shortcut } from '../utils/shortcut';
import { Icon } from './Icon';

interface Command {
  id: string;
  label: string;
  shortcut?: string;
  action: () => void;
}

interface CommandPaletteProps {
  onClose: () => void;
}

export function CommandPalette({ onClose }: CommandPaletteProps): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const uiStore = useUiStore();
  const sessionStore = useSessionStore();

  /** 全部可用命令 */
  const commands = useMemo<Command[]>(
    () => [
      {
        id: 'session.new',
        label: '新建对话',
        shortcut: '⌘N',
        action: () => {
          void sessionStore.createSession();
        },
      },
      {
        id: 'sidebar.toggle',
        label: '切换侧边栏',
        shortcut: '⌘B',
        action: () => {
          uiStore.toggleSidebar();
        },
      },
      {
        id: 'filetree.toggle',
        label: '切换文件树',
        shortcut: '⌘⇧E',
        action: () => {
          uiStore.toggleFileTree();
        },
      },
      {
        id: 'terminal.toggle',
        label: '切换终端面板',
        shortcut: '⌘`',
        action: () => {
          uiStore.toggleTerminal();
        },
      },
      {
        id: 'session.tree',
        label: '打开会话树',
        shortcut: '⌘⇧T',
        action: () => {
          uiStore.openSessionTree();
        },
      },
      {
        id: 'settings.open',
        label: '打开设置',
        shortcut: '⌘,',
        action: () => {
          uiStore.openSettingsPanel();
        },
      },
      {
        id: 'model.picker',
        label: '切换模型',
        shortcut: '⌘⇧M',
        action: () => {
          uiStore.openModelPicker();
        },
      },
      {
        id: 'mcp.settings',
        label: 'MCP 服务器管理',
        action: () => {
          uiStore.openMcpSettings();
        },
      },
      {
        id: 'skill.settings',
        label: 'Skill 管理',
        action: () => {
          uiStore.openSkillSettings();
        },
      },
      {
        id: 'package.settings',
        label: 'Pi Package 管理',
        action: () => {
          uiStore.openPackageSettings();
        },
      },
      {
        id: 'provider.settings',
        label: '供应商 / 模型配置',
        action: () => {
          uiStore.openProviderSettings();
        },
      },
      {
        id: 'session.abort',
        label: '中止当前回合',
        shortcut: 'Esc',
        action: () => {
          const { activeSessionId, abort } = sessionStore;
          if (activeSessionId) void abort();
        },
      },
      {
        id: 'approval.cycle',
        label: '切换审批模式',
        shortcut: '⌘⇧A',
        action: () => {
          uiStore.cycleApprovalMode();
        },
      },
      {
        id: 'thinking.toggle',
        label: '切换思考块显示',
        shortcut: '⌘/',
        action: () => {
          uiStore.toggleHideThinking();
        },
      },
      {
        id: 'audit.open',
        label: '查看审批日志',
        action: () => {
          uiStore.openAudit();
        },
      },
    ],
    [sessionStore, uiStore],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const execute = (cmd: Command) => {
    cmd.action();
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = filtered[cursor];
      if (cmd) execute(cmd);
    }
  };

  return (
    <div
      className="command-palette-overlay"
      role="dialog"
      aria-label="命令面板"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="command-palette-panel">
        <div className="command-palette-input-wrap">
          <span className="command-palette-icon">
            <Icon name="command" size={15} />
          </span>
          <input
            ref={inputRef}
            className="command-palette-input"
            type="text"
            placeholder="输入命令…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            onKeyDown={onKeyDown}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        {filtered.length > 0 && (
          <div className="command-palette-list" role="listbox">
            {filtered.map((cmd, i) => (
              <div
                key={cmd.id}
                role="option"
                aria-selected={i === cursor}
                className="command-palette-item"
                data-active={i === cursor || undefined}
                onClick={() => execute(cmd)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') execute(cmd);
                }}
                tabIndex={i === cursor ? 0 : -1}
              >
                <span className="command-palette-label">{cmd.label}</span>
                {cmd.shortcut && (
                  <kbd className="command-palette-shortcut">{shortcut(cmd.shortcut)}</kbd>
                )}
              </div>
            ))}
          </div>
        )}
        {filtered.length === 0 && <div className="command-palette-empty">无匹配命令</div>}
      </div>
    </div>
  );
}
