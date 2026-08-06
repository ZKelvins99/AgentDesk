import Database from 'better-sqlite3';
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import { MIGRATIONS } from './migrations';
import * as schema from './schema';

export type AppDb = BetterSQLite3Database<typeof schema>;

export interface AppDatabase {
  sqlite: Database.Database;
  db: AppDb;
  close: () => void;
}

/** 打开（或创建）数据库：WAL + 外键 + 幂等迁移。 */
export function openDatabase(dbPath: string): AppDatabase {
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  applyMigrations(sqlite);
  const db = drizzle(sqlite, { schema });
  return {
    sqlite,
    db,
    close: () => {
      sqlite.close();
    },
  };
}

function applyMigrations(sqlite: Database.Database): void {
  sqlite.exec(
    'CREATE TABLE IF NOT EXISTS migrations (id TEXT PRIMARY KEY, appliedAt INTEGER NOT NULL)',
  );
  const rows = sqlite.prepare('SELECT id FROM migrations').all() as Array<{ id: string }>;
  const applied = new Set(rows.map((r) => r.id));
  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue;
    sqlite.transaction(() => {
      for (const stmt of m.sql) sqlite.exec(stmt);
      sqlite.prepare('INSERT INTO migrations (id, appliedAt) VALUES (?, ?)').run(m.id, Date.now());
    })();
  }
}
