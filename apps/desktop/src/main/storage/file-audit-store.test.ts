import { describe, expect, it } from 'vitest';
import { openDatabase } from './db';
import { FileAuditStore } from './file-audit-store';

describe('FileAuditStore（README 8.9 审计）', () => {
  it('record/list：落库、倒序、workspacePath 可空', () => {
    const db = openDatabase(':memory:');
    const store = new FileAuditStore(db);
    store.record({ path: '/a.txt', action: 'revert', patchJson: 'p1' });
    store.record({ path: '/b.txt', workspacePath: '/ws', action: 'accept', patchJson: 'p2' });
    const list = store.list();
    expect(list).toHaveLength(2);
    expect(list.find((e) => e.path === '/b.txt')).toMatchObject({
      workspacePath: '/ws',
      action: 'accept',
      patchJson: 'p2',
    });
    expect(list.find((e) => e.path === '/a.txt')).toMatchObject({
      workspacePath: null,
      action: 'revert',
    });
    expect(typeof list[0]?.at).toBe('number');
    db.close();
  });
});
