/**
 * 终端面板（README 9.6 / M8）。
 * xterm.js + node-pty：多标签，ABI 失败时降级为"终端不可用"提示（README R5）。
 */
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal } from '@xterm/xterm';
import { Icon } from './Icon';
import '@xterm/xterm/css/xterm.css';
import { useCallback, useEffect, useRef, useState } from 'react';

interface TerminalTab {
  id: string;
  title: string;
  ptyId: string;
  /** false = PTY 进程已退出，等待关闭 */
  alive: boolean;
}

interface TerminalPanelProps {
  /** workspace 路径（新建终端的 cwd） */
  cwd: string;
  onClose?: () => void;
}

/** 每个 tab 对应一个 xterm Terminal 实例（存在 Map 里，不随 React 生命周期销毁） */
const terminalMap = new Map<string, { terminal: Terminal; fitAddon: FitAddon }>();

let tabCounter = 0;

export function TerminalPanel({ cwd, onClose }: TerminalPanelProps): React.JSX.Element {
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const resizeObserver = useRef<ResizeObserver | null>(null);

  /** 创建新终端 tab */
  const createTab = useCallback(async () => {
    const res = await window.agentdesk.pty.create({ cwd, cols: 80, rows: 24 });
    if (!res.available) {
      setUnavailable(true);
      return;
    }
    const id = `tab-${++tabCounter}`;
    const tab: TerminalTab = { id, title: `终端 ${tabCounter}`, ptyId: res.ptyId, alive: true };
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(id);
  }, [cwd]);

  /** 首次挂载创建一个默认 tab */
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在首次挂载执行一次
  useEffect(() => {
    void createTab();
  }, []);

  /** 订阅 pty 输出事件 */
  useEffect(() => {
    const unsub = window.agentdesk.onPtyEvent((ev) => {
      const tab = tabs.find((t) => t.ptyId === ev.ptyId);
      if (tab) {
        terminalMap.get(tab.id)?.terminal.write(ev.data);
      }
    });
    return unsub;
  }, [tabs]);

  /** 当 activeTab 变化时，attach xterm 到容器 */
  useEffect(() => {
    if (!activeTabId || !containerRef.current) return;
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab) return;

    // 先清空容器再挂载（用 removeChild 避免 innerHTML）
    while (containerRef.current.firstChild) {
      containerRef.current.removeChild(containerRef.current.firstChild);
    }

    let entry = terminalMap.get(activeTabId);
    if (!entry) {
      // 首次挂载：创建 xterm 实例
      const terminal = new Terminal({
        cursorBlink: true,
        fontFamily: 'ui-monospace, "Cascadia Code", "JetBrains Mono", Menlo, Consolas, monospace',
        fontSize: 13,
        lineHeight: 1.2,
        theme: {
          background: '#0d0d0f',
          foreground: '#ececf1',
          cursor: '#4d9fff',
          black: '#0d0d0f',
          brightBlack: '#6e6e78',
          white: '#ececf1',
          brightWhite: '#ffffff',
        },
      });
      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.loadAddon(new WebLinksAddon());
      entry = { terminal, fitAddon };
      terminalMap.set(activeTabId, entry);

      // 输入 → pty
      terminal.onData((data) => {
        void window.agentdesk.pty.write({ ptyId: tab.ptyId, data });
      });
    }

    entry.terminal.open(containerRef.current);
    entry.fitAddon.fit();
    // 同步 pty 大小
    const { cols, rows } = entry.terminal;
    void window.agentdesk.pty.resize({ ptyId: tab.ptyId, cols, rows });
    entry.terminal.focus();
  }, [activeTabId, tabs]);

  /** ResizeObserver 自适应 */
  useEffect(() => {
    if (!containerRef.current) return;
    resizeObserver.current = new ResizeObserver(() => {
      if (!activeTabId) return;
      const entry = terminalMap.get(activeTabId);
      if (!entry) return;
      entry.fitAddon.fit();
      const { cols, rows } = entry.terminal;
      const tab = tabs.find((t) => t.id === activeTabId);
      if (tab) void window.agentdesk.pty.resize({ ptyId: tab.ptyId, cols, rows });
    });
    resizeObserver.current.observe(containerRef.current);
    return () => resizeObserver.current?.disconnect();
  }, [activeTabId, tabs]);

  /** 关闭 tab */
  const closeTab = (tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId);
    if (tab) void window.agentdesk.pty.kill({ ptyId: tab.ptyId });
    terminalMap.get(tabId)?.terminal.dispose();
    terminalMap.delete(tabId);
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== tabId);
      if (activeTabId === tabId && next.length > 0) {
        setActiveTabId(next[next.length - 1]?.id ?? null);
      } else if (next.length === 0) {
        onClose?.();
      }
      return next;
    });
  };

  if (unavailable) {
    return (
      <div className="terminal-panel terminal-unavailable">
        <Icon name="alert" size={18} className="terminal-unavailable-icon" />
        <span>终端不可用：node-pty 未能加载（ABI 不匹配）。</span>
        <button type="button" className="terminal-close-btn" onClick={onClose}>
          关闭
        </button>
      </div>
    );
  }

  return (
    <div className="terminal-panel">
      {/* 标签栏 */}
      <div className="terminal-tabbar">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className="terminal-tab"
            data-active={tab.id === activeTabId || undefined}
            onClick={() => setActiveTabId(tab.id)}
            title={tab.title}
          >
            <span className="terminal-tab-title">{tab.title}</span>
            <button
              type="button"
              className="terminal-tab-close"
              aria-label={`关闭 ${tab.title}`}
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
            >
              <Icon name="close" size={12} />
            </button>
          </button>
        ))}
        <button
          type="button"
          className="terminal-tab-new"
          aria-label="新建终端"
          onClick={() => void createTab()}
          title="新建终端"
        >
          +
        </button>
        <div className="terminal-tabbar-spacer" />
        <button
          type="button"
          className="terminal-panel-close"
          aria-label="关闭终端面板"
          onClick={onClose}
        >
          <Icon name="close" size={14} />
        </button>
      </div>
      {/* xterm 容器 */}
      <div ref={containerRef} className="terminal-xterm-container" />
    </div>
  );
}
