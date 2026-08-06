import type { AgentDeskEvent } from '@agentdesk/ipc';
import { create } from 'zustand';
import {
  addUserMessage,
  applyEvent,
  createSessionUiState,
  markUserMessageSent,
  type SessionUiState,
} from '../features/session/message-model';
import type { SessionSummary } from '../types';

export type SendMode = 'normal' | 'steer' | 'followUp';

export interface SessionEventPayload {
  sessionId: string;
  seq: number;
  ev: AgentDeskEvent;
}

interface SessionStore {
  sessions: Record<string, SessionUiState>;
  summaries: SessionSummary[];
  activeSessionId: string | null;
  isCreating: boolean;
  isRestoring: boolean;
  createError: string | null;
  createSession: (workspacePath?: string) => Promise<string>;
  attachSession: (sessionId: string, sinceSeq?: number) => Promise<void>;
  loadSessions: () => Promise<void>;
  restore: () => Promise<void>;
  setActive: (sessionId: string) => void;
  renameSession: (sessionId: string, title: string) => Promise<void>;
  archiveSession: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  exportSession: (sessionId: string, format: 'md' | 'json') => Promise<string | null>;
  send: (text: string) => Promise<SendMode | null>;
  abort: () => Promise<void>;
  applyEvents: (payloads: SessionEventPayload[]) => void;
}

let restoreStarted = false;

export const useSessionStore = create<SessionStore>()((set, get) => ({
  sessions: {},
  summaries: [],
  activeSessionId: null,
  isCreating: false,
  isRestoring: false,
  createError: null,

  createSession: async (workspacePath) => {
    set({ isCreating: true, createError: null });
    try {
      const req = workspacePath ? { workspacePath } : {};
      const { sessionId, workspacePath: resolvedPath } = await window.agentdesk.session.create(req);
      set((s) => ({
        sessions: {
          ...s.sessions,
          [sessionId]: createSessionUiState(sessionId, resolvedPath),
        },
        activeSessionId: sessionId,
        isCreating: false,
      }));
      await get().loadSessions();
      await get().attachSession(sessionId);
      return sessionId;
    } catch (err) {
      set({ isCreating: false, createError: (err as Error).message });
      throw err;
    }
  },

  attachSession: async (sessionId, sinceSeq = 0) => {
    const snap = await window.agentdesk.session.attach({ sessionId, sinceSeq });
    set((s) => {
      const existing = s.sessions[sessionId];
      let state = existing ?? createSessionUiState(sessionId, snap.workspacePath);
      for (const ev of snap.history) {
        state = applyEvent(state, ev);
      }
      state = { ...state, appliedSeq: snap.seq, seq: snap.seq };
      return {
        sessions: { ...s.sessions, [sessionId]: state },
        activeSessionId: s.activeSessionId ?? sessionId,
      };
    });
  },

  loadSessions: async () => {
    const { sessions } = await window.agentdesk.session.list({ archived: false, limit: 100 });
    set({ summaries: sessions });
  },

  restore: async () => {
    if (restoreStarted) return;
    restoreStarted = true;
    set({ isRestoring: true });
    try {
      await get().loadSessions();
      const latest = get().summaries[0];
      if (latest) {
        set({ activeSessionId: latest.id });
        await get().attachSession(latest.id, 0);
      } else {
        await get().createSession();
      }
    } finally {
      set({ isRestoring: false });
    }
  },

  setActive: (sessionId) => set({ activeSessionId: sessionId }),

  renameSession: async (sessionId, title) => {
    await window.agentdesk.session.rename({ sessionId, title });
    await get().loadSessions();
  },

  archiveSession: async (sessionId) => {
    await window.agentdesk.session.archive({ sessionId });
    set((s) => {
      const sessions = { ...s.sessions };
      delete sessions[sessionId];
      return {
        sessions,
        activeSessionId: s.activeSessionId === sessionId ? null : s.activeSessionId,
      };
    });
    await get().loadSessions();
  },

  deleteSession: async (sessionId) => {
    await window.agentdesk.session.delete({ sessionId });
    set((s) => {
      const sessions = { ...s.sessions };
      delete sessions[sessionId];
      return {
        sessions,
        activeSessionId: s.activeSessionId === sessionId ? null : s.activeSessionId,
      };
    });
    await get().loadSessions();
  },

  exportSession: async (sessionId, format) => {
    const { path } = await window.agentdesk.session.export({ sessionId, format });
    return path;
  },

  send: async (text) => {
    const sessionId = get().activeSessionId;
    const trimmed = text.trim();
    if (!sessionId || !trimmed) return null;
    const userMsg = addUserMessage(get().sessions[sessionId] as SessionUiState, trimmed);
    const msgId = userMsg.messages[userMsg.messages.length - 1]?.id;
    set((s) => ({ sessions: { ...s.sessions, [sessionId]: userMsg } }));
    try {
      const res = await window.agentdesk.session.send({ sessionId, text: trimmed });
      if (msgId) {
        set((s) => {
          const cur = s.sessions[sessionId];
          if (!cur) return s;
          return {
            sessions: {
              ...s.sessions,
              [sessionId]: markUserMessageSent(cur, msgId),
            },
          };
        });
      }
      return res.mode;
    } catch (err) {
      set((s) => {
        const cur = s.sessions[sessionId];
        if (!cur) return s;
        const withSent = msgId ? markUserMessageSent(cur, msgId) : cur;
        const errMsg: SessionUiState = applyEvent(withSent, {
          k: 'error',
          scope: 'provider',
          message: (err as Error).message,
        });
        return { sessions: { ...s.sessions, [sessionId]: errMsg } };
      });
      return null;
    }
  },

  abort: async () => {
    const sessionId = get().activeSessionId;
    if (!sessionId) return;
    try {
      await window.agentdesk.session.abort({ sessionId });
    } catch {
      // 停止失败不阻塞 UI
    }
  },

  applyEvents: (payloads) => {
    if (payloads.length === 0) return;
    set((s) => {
      const sessions = { ...s.sessions };
      let changed = false;
      for (const p of payloads) {
        const cur = sessions[p.sessionId];
        if (!cur || p.seq <= cur.appliedSeq) continue;
        const next = applyEvent(cur, p.ev);
        sessions[p.sessionId] = {
          ...next,
          seq: p.seq,
          appliedSeq: p.seq,
          lastEventAt: Date.now(),
        };
        changed = true;
      }
      if (changed) {
        const summaries = s.summaries.map((sum) => {
          const live = sessions[sum.id];
          return live ? { ...sum, seq: live.seq } : sum;
        });
        return { sessions, summaries };
      }
      return s;
    });
  },
}));
