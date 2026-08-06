import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AgentDeskEvent } from '@agentdesk/ipc';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from './db';
import { MIGRATIONS } from './migrations';
import { normalizeWorkspacePath, SessionStore } from './session-store';

function tmpRoot(): string {
  return mkdtempSync(path.join(tmpdir(), 'agentdesk-store-'));
}

describe('SessionStore（README 8.8：workspace / 会话 / 事件缓存 / 导出）', () => {
  let root: string;
  let dbPath: string;
  let store: SessionStore;

  beforeEach(() => {
    root = tmpRoot();
    dbPath = path.join(root, 'agentdesk.db');
    store = new SessionStore(openDatabase(dbPath), path.join(root, 'exports'));
  });

  afterEach(() => {
    store.close();
    rmSync(root, { recursive: true, force: true });
  });

  it('迁移幂等：重复打开不报错，migrations 表记录全部迁移', () => {
    const db = openDatabase(dbPath);
    const rows = db.sqlite.prepare('SELECT id FROM migrations ORDER BY id').all() as Array<{
      id: string;
    }>;
    expect(rows.map((r) => r.id)).toEqual(MIGRATIONS.map((m) => m.id));
    db.close();
    // 再次打开（同一文件）不抛错
    const db2 = openDatabase(dbPath);
    db2.close();
  });

  it('workspace：upsert / 列表按最近打开排序 / 移除后会话 workspaceId 置空', () => {
    const a = store.upsertWorkspace(path.join(root, 'proj-a'));
    store.upsertWorkspace(path.join(root, 'proj-b'));
    expect(a.needsTrust).toBe(true);
    expect(a.workspace.trust).toBe('unknown');

    // 再次 upsert 同路径：复用且更新 lastOpenedAt
    store.upsertWorkspace(path.join(root, 'proj-a'));
    const list = store.listWorkspaces();
    expect(list).toHaveLength(2);
    expect(list[0]?.path).toBe(normalizeWorkspacePath(path.join(root, 'proj-a')));

    const sid = 's1';
    store.createSession({ id: sid, workspaceId: a.workspace.id, title: '会话A' });
    store.removeWorkspace(a.workspace.id);
    const rec = store.getSession(sid);
    expect(rec?.workspaceId).toBeNull();
  });

  it('会话：创建 / 更新 / 搜索 / 归档 / 删除', () => {
    store.upsertWorkspace(path.join(root, 'proj'));
    const ws = store.getWorkspaceByPath(path.join(root, 'proj'));
    expect(ws).not.toBeNull();
    const wsId = ws?.id ?? '';
    expect(wsId).not.toBe('');
    store.createSession({ id: 's1', workspaceId: wsId, title: 'Alpha 会话', model: 'mock-model' });
    store.createSession({ id: 's2', workspaceId: wsId, title: 'Beta 会话' });
    store.updateSession('s1', { messageCount: 3, status: 'streaming' });

    const found = store.listSessions({ search: 'alpha' });
    expect(found).toHaveLength(1);
    expect(found[0]?.id).toBe('s1');
    expect(found[0]?.messageCount).toBe(3);
    expect(found[0]?.workspacePath).toBe(normalizeWorkspacePath(path.join(root, 'proj')));

    store.archiveSession('s2');
    expect(store.listSessions({ archived: true }).map((s) => s.id)).toEqual(['s2']);
    expect(store.listSessions({ archived: false }).map((s) => s.id)).toEqual(['s1']);

    store.renameSession('s1', '改名');
    expect(store.getSession('s1')?.title).toBe('改名');

    store.deleteSession('s1');
    expect(store.getSession('s1')).toBeNull();
    expect(existsSync(dbPath)).toBe(true);
  });

  it('事件缓存：批量写入去重、getEventsSince 断点重传、latestSeq', () => {
    const sid = 's1';
    store.createSession({ id: sid, title: 't' });
    const ev1: AgentDeskEvent = { k: 'msg.start', msgId: 'm1', role: 'assistant' };
    const ev2: AgentDeskEvent = {
      k: 'msg.delta',
      msgId: 'm1',
      part: { t: 'text', v: '你好' },
    };
    store.appendEvents(
      sid,
      [
        { seq: 1, ev: ev1 },
        { seq: 2, ev: ev2 },
      ],
      { messageCount: 1, status: 'streaming' },
    );
    // 重复 seq 被忽略
    store.appendEvents(sid, [{ seq: 2, ev: ev2 }], { messageCount: 1 });
    expect(store.latestSeq(sid)).toBe(2);

    const tail = store.getEventsSince(sid, 1);
    expect(tail.map((e) => e.seq)).toEqual([2]);
    expect(tail[0]?.ev).toEqual(ev2);

    const all = store.getEventsSince(sid, 0);
    expect(all).toHaveLength(2);
    expect(store.getSession(sid)?.messageCount).toBe(1);
  });

  it('导出：md 含助手文本，json 含完整事件流', () => {
    const sid = 's1';
    store.createSession({ id: sid, title: '导出测试', model: 'mock-model' });
    store.appendEvents(
      sid,
      [
        { seq: 1, ev: { k: 'msg.start', msgId: 'm1', role: 'assistant' } },
        { seq: 2, ev: { k: 'msg.delta', msgId: 'm1', part: { t: 'text', v: '这是导出内容' } } },
        { seq: 3, ev: { k: 'msg.end', msgId: 'm1' } },
      ],
      { messageCount: 1 },
    );

    const mdPath = store.exportSession(sid, 'md');
    const md = readFileSync(mdPath, 'utf8');
    expect(md).toContain('# 导出测试');
    expect(md).toContain('这是导出内容');

    const jsonPath = store.exportSession(sid, 'json');
    const json = JSON.parse(readFileSync(jsonPath, 'utf8')) as {
      events: Array<{ seq: number }>;
    };
    expect(json.events).toHaveLength(3);
    expect(json.events[2]?.seq).toBe(3);
  });

  it('resetOnceTrust：本次信任在重启后回到 unknown（README 8.9）', () => {
    const ws = store.upsertWorkspace(path.join(root, 'proj')).workspace;
    store.setWorkspaceTrust(ws.id, 'once');
    expect(store.getWorkspace(ws.id)?.trust).toBe('once');
    store.resetOnceTrust();
    expect(store.getWorkspace(ws.id)?.trust).toBe('unknown');
    store.setWorkspaceTrust(ws.id, 'always');
    store.resetOnceTrust();
    expect(store.getWorkspace(ws.id)?.trust).toBe('always');
  });
});
