import { useCallback, useEffect, useState } from 'react';

export default function App(): React.JSX.Element {
  const [version, setVersion] = useState('…');
  const [pong, setPong] = useState<string | null>(null);

  useEffect(() => {
    void window.agentdesk.getVersion().then((v) => setVersion(v.version));
  }, []);

  const handlePing = useCallback(() => {
    void window.agentdesk.ping(`t${Date.now()}`).then((r) => setPong(r.pong));
  }, []);

  return (
    <div className="app">
      <header className="titlebar">
        <span className="titlebar-title">AgentDesk</span>
        <div className="titlebar-actions">
          <button type="button" onClick={() => void window.agentdesk.window.minimize()}>
            最小化
          </button>
          <button type="button" onClick={() => void window.agentdesk.window.maximize()}>
            最大化
          </button>
          <button type="button" onClick={() => void window.agentdesk.window.close()}>
            关闭
          </button>
        </div>
      </header>
      <main className="content">
        <h1>AgentDesk</h1>
        <p>Electron v{version} · M0 地基骨架</p>
        <button type="button" onClick={handlePing}>
          IPC 连通性测试
        </button>
        {pong ? <p className="pong">收到：{pong}</p> : null}
      </main>
    </div>
  );
}
