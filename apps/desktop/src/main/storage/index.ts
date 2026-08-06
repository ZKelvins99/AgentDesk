export { type AppDatabase, type AppDb, openDatabase } from './db';
export { MIGRATIONS, type Migration } from './migrations';
export * as schema from './schema';
export {
  normalizeWorkspacePath,
  type SessionListQuery,
  type SessionPatch,
  type SessionRecord,
  SessionStore,
  type StoredEvent,
  type TrustDecision,
  type WorkspaceRecord,
  type WorkspaceTrust,
  workspaceNameOf,
} from './session-store';
export { WorkspaceManager, type WorkspaceManagerOptions } from './workspace-manager';
