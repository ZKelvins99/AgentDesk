import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AgentDeskEvent } from '@agentdesk/ipc';
import { AgentDeskError } from '@agentdesk/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PiBridge, PiSidecar } from '../pi';
import { openDatabase } from '../storage/db';
import { SessionStore } from '../storage/session-store';
import { SessionManager } from './session-manager';

/** M3 G3：重启后 attach 从渲染缓存恢复（不依赖 pi 二进制）。 */
describe('SessionManager 缓存恢复（README 8.8.1：秒开 + 断点重传）', () => {
  let root: string;
  let store: SessionStore;
  let manager: SessionManager;
  let bridge: PiBridge;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'agentdesk-cache-'));
    store = new SessionStore(
      openDatabase(path.join(root, 'agentdesk.db')),
      path.join(root, 'exports'),
    );
    const fakePool = new EventEmitter() as EventEmitter & {
      get: (sessionId: string) => PiSidecar | undefined;
    };
    fakePool.get = () => undefined;
    bridge = {
      pool: fakePool,
      createSessionSidecar: () => {
        throw new Error('unit test 不拉起 sidecar');
      },
    } as unknown as PiBridge;

    manager = new SessionManager({
      bridge,
      workspacePath: path.join(root, 'workspace'),
      sessionDir: path.join(root, 'sessions'),
      store,
      trust: 'deny',
      onEvent: () => {},
    });
  });

  afterEach(async () => {
    await manager.shutdownAll(1_000).catch(() => {});
    store.close();
    rmSync(root, { recursive: true, force: true });
  });

  function seedSession(id: string, events: AgentDeskEvent[]): void {
    const ws = store.upsertWorkspace(path.join(root, 'workspace')).workspace;
    store.createSession({ id, workspaceId: ws.id, title: '历史会话', model: 'mock-model' });
    store.appendEvents(
      id,
      events.map((ev, i) => ({ seq: i + 1, ev })),
      { messageCount: 1 },
    );
  }

  it('attach 恢复完整历史与 seq；sinceSeq 只返回增量（断点重传）', () => {
    const events: AgentDeskEvent[] = [
      { k: 'msg.start', msgId: 'm1', role: 'assistant' },
      { k: 'msg.delta', msgId: 'm1', part: { t: 'text', v: '第一段' } },
      { k: 'msg.end', msgId: 'm1' },
      { k: 'msg.start', msgId: 'm2', role: 'assistant' },
      { k: 'msg.delta', msgId: 'm2', part: { t: 'text', v: '第二段' } },
      { k: 'msg.end', msgId: 'm2' },
    ];
    seedSession('s1', events);

    const full = manager.attach('s1', 0);
    expect(full.seq).toBe(6);
    expect(full.history).toHaveLength(6);
    expect(full.state.messageCount).toBe(1);
    expect(full.workspacePath).toBe(path.join(root, 'workspace'));

    const tail = manager.attach('s1', 4);
    expect(tail.history).toHaveLength(2);
    expect(tail.history[0]).toEqual(events[4]);

    const none = manager.attach('s1', 6);
    expect(none.history).toHaveLength(0);
  });

  it('attach 不存在的会话抛 SESSION_NOT_FOUND；list/rename/archive/delete 走 DB', async () => {
    expect(() => manager.attach('nope', 0)).toThrow(AgentDeskError);
    const events: AgentDeskEvent[] = [
      { k: 'msg.start', msgId: 'm1', role: 'assistant' },
      { k: 'msg.end', msgId: 'm1' },
    ];
    seedSession('s1', events);

    const listed = manager.list();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.title).toBe('历史会话');
    expect(listed[0]?.seq).toBe(2);

    manager.rename('s1', '改名');
    expect(manager.list()[0]?.title).toBe('改名');

    manager.archive('s1');
    expect(manager.list()).toHaveLength(0);
    expect(manager.list({ archived: true })).toHaveLength(1);

    const mdPath = manager.export('s1', 'md');
    expect(mdPath).toContain('.md');

    await manager.delete('s1');
    expect(() => manager.attach('s1', 0)).toThrow(AgentDeskError);
  });
});
