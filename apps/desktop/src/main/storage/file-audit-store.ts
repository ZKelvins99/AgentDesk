import type Database from 'better-sqlite3';
import type { AppDatabase } from './db';

export type FileAuditAction = 'accept' | 'revert';

export interface FileAuditEntry {
  id: number;
  path: string;
  workspacePath: string | null;
  action: FileAuditAction;
  patchJson: string;
  at: number;
}

export interface FileAuditRecord {
  path: string;
  workspacePath?: string;
  action: FileAuditAction;
  patchJson: string;
}

/** 文件变更审计（README 8.9）：Diff 面板逐块接受/回滚落库。 */
export class FileAuditStore {
  private readonly sqlite: Database.Database;

  constructor(database: AppDatabase) {
    this.sqlite = database.sqlite;
  }

  record(entry: FileAuditRecord): void {
    this.sqlite
      .prepare(
        `INSERT INTO file_audit (path, workspacePath, action, patchJson, at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(entry.path, entry.workspacePath ?? null, entry.action, entry.patchJson, Date.now());
  }

  list(limit = 100): FileAuditEntry[] {
    return this.sqlite
      .prepare(`SELECT * FROM file_audit ORDER BY at DESC LIMIT ?`)
      .all(limit) as FileAuditEntry[];
  }
}
