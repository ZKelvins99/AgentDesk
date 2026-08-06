import type { AgentDeskEvent } from '@agentdesk/ipc';
import { create } from 'zustand';
import {
  addUserMessage,
  applyEvent,
  createSessionUiState,
  markUserMessageSent,
  type SessionUiState,
} from '../features/session/message-model';

export type SendMode = 'normal' | 'steer' | 'followUp';

export interface SessionEventPayload {
  sessionId: string;
  seq: number;
  ev: AgentDeskEvent;
}

interface SessionStore {
  sessions: Record<string, SessionUiState>;
  activeSessionId: string | null;
  isCreating: boolean;
  createError: string | null;
  createSession: () => Promise<string>;
  attachSession: (sessionId: string) => Promise<void>;
  setActive: (sessionId: string) => void;
  send: (text: string) => Promise<SendMode | null>;
  abort: () => Promise<void>;
  applyEvents: (payloads: SessionEventPayload[]) => void;
}

export const useSessionStore = create<SessionStore>()((set, get) => ({
  sessions: {},
  activeSessionId: null,
  isCreating: false,
  createError: null,

  createSession: async () => {
    set({ isCreating: true, createError: null });
    try {
      const { sessionId, workspacePath } = await window.agentdesk.session.create({});
      set((s) => ({
        sessions: {
          ...s.sessions,
          [sessionId]: createSessionUiState(sessionId, workspacePath),
        },
        activeSessionId: sessionId,
        isCreating: false,
      }));
      await get().attachSession(sessionId);
      return sessionId;
    } catch (err) {
      set({ isCreating: false, createError: (err as Error).message });
      throw err;
    }
  },

  attachSession: async (sessionId) => {
    const snap = await window.agentdesk.session.attach({ sessionId });
    let state = createSessionUiState(sessionId, snap.workspacePath);
    for (const ev of snap.history) {
      state = applyEvent(state, ev);
    }
    state = { ...state, appliedSeq: snap.seq, seq: snap.seq };
    set((s) => ({
      sessions: { ...s.sessions, [sessionId]: state },
      activeSessionId: s.activeSessionId ?? sessionId,
    }));
  },

  setActive: (sessionId) => set({ activeSessionId: sessionId }),

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
      return changed ? { sessions } : s;
    });
  },
}));
