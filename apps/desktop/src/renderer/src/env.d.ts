/// <reference types="vite/client" />
import type { AgentDeskEvent, SessionState } from '@agentdesk/ipc';

declare global {
  interface Window {
    agentdesk: {
      ping(nonce?: string): Promise<{ pong: string }>;
      getVersion(): Promise<{ version: string }>;
      platform: string;
      window: {
        minimize(): Promise<void>;
        maximize(): Promise<void>;
        close(): Promise<void>;
      };
      session: {
        create(req: {
          workspacePath?: string;
          model?: string;
          thinkingLevel?: string;
        }): Promise<{ sessionId: string; workspacePath: string }>;
        attach(req: { sessionId: string }): Promise<{
          sessionId: string;
          workspacePath: string;
          history: AgentDeskEvent[];
          state: SessionState;
          seq: number;
        }>;
        send(req: {
          sessionId: string;
          text: string;
        }): Promise<{ accepted: boolean; mode: 'normal' | 'steer' | 'followUp' }>;
        abort(req: { sessionId: string }): Promise<void>;
        setModel(req: { sessionId: string; model: string }): Promise<void>;
      };
      onSessionEvent(
        cb: (payload: { sessionId: string; seq: number; ev: AgentDeskEvent }) => void,
      ): () => void;
    };
  }
}
