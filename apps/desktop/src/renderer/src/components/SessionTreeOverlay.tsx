/**
 * 会话树浮层（README 9.4.1 / M8）。
 * 全屏覆盖，展示当前会话的分支树，支持 fork 与节点导航。
 * 通过 ⌘⇧T / Ctrl+⇧T 触发（README 9.8）。
 */
import type { SessionTreeNode } from '@agentdesk/ipc';
import { useCallback, useEffect, useState } from 'react';
import { useSessionStore } from '../stores/session-store';
import { Icon } from './Icon';

interface SessionTreeOverlayProps {
  sessionId: string;
  onClose: () => void;
}

export function SessionTreeOverlay({
  sessionId,
  onClose,
}: SessionTreeOverlayProps): React.JSX.Element {
  const [nodes, setNodes] = useState<SessionTreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const attachSession = useSessionStore((s) => s.attachSession);
  const setActive = useSessionStore((s) => s.setActive);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await window.agentdesk.session_tree.getTree({ sessionId });
      setNodes(res.nodes);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleNavigate = async (nodeId: string) => {
    try {
      await window.agentdesk.session_tree.navigateTree({ sessionId, nodeId });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleFork = async (nodeId: string) => {
    // 以节点 ID 作为 fromMessageId（节点即消息锡点）
    try {
      const res = await window.agentdesk.session_tree.fork({ sessionId, fromMessageId: nodeId });
      // 在 store 里 attach 并激活新会话
      setActive(res.newSessionId);
      await attachSession(res.newSessionId);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  /** 简单构建缩进树结构 */
  const renderNode = (node: SessionTreeNode, depth: number): React.JSX.Element => (
    <div key={node.id} className="tree-node" style={{ paddingLeft: `${8 + depth * 20}px` }}>
      <div className="tree-node-row" data-active={node.isActive || undefined}>
        <span className="tree-node-icon">{node.isActive ? '▶' : '○'}</span>
        <span className="tree-node-label" title={node.id}>
          {node.label}
        </span>
        <span className="tree-node-count">{node.messageCount} 条</span>
        <div className="tree-node-actions">
          <button
            type="button"
            className="tree-node-btn"
            onClick={() => void handleNavigate(node.id)}
            title="切换到此节点"
          >
            跳转
          </button>
          <button
            type="button"
            className="tree-node-btn"
            onClick={() => void handleFork(node.id)}
            title="从此节点 fork 新对话"
          >
            Fork
          </button>
        </div>
      </div>
      {/* 子节点 */}
      {nodes.filter((n) => n.parentId === node.id).map((child) => renderNode(child, depth + 1))}
    </div>
  );

  const roots = nodes.filter((n) => n.parentId === null);

  return (
    <div
      className="session-tree-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="会话树"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) onClose();
      }}
    >
      <div className="session-tree-panel">
        <div className="session-tree-header">
          <span className="session-tree-title">会话树</span>
          <button
            type="button"
            className="session-tree-refresh"
            onClick={() => void load()}
            title="刷新"
          >
            ↺
          </button>
          <button type="button" className="session-tree-close" onClick={onClose} aria-label="关闭">
            <Icon name="close" size={14} />
          </button>
        </div>
        <div className="session-tree-body">
          {loading && <div className="session-tree-loading">加载中…</div>}
          {!loading && error && <div className="session-tree-error">{error}</div>}
          {!loading && !error && nodes.length === 0 && (
            <div className="session-tree-empty">当前会话暂无分支树（pi 版本可能不支持）。</div>
          )}
          {!loading && !error && nodes.length > 0 && (
            <div className="session-tree-nodes">{roots.map((r) => renderNode(r, 0))}</div>
          )}
        </div>
      </div>
    </div>
  );
}
