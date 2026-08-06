/// <reference types="vite/client" />
import type {
  AgentDeskEvent,
  AuthProviderStatus,
  ProviderPreset,
  ProviderView,
  SecretsStatusResponse,
  SessionState,
} from '@agentdesk/ipc';
import type { SessionSummary, WorkspaceRecord } from './types';

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
        attach(req: { sessionId: string; sinceSeq?: number }): Promise<{
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
        getModels(req: { sessionId: string }): Promise<{
          models: Array<{
            id: string;
            name: string | null;
            provider: string | null;
            api: string | null;
            reasoning: boolean;
            input: string[];
            contextWindow: number | null;
            maxTokens: number | null;
            cost: {
              input?: number;
              output?: number;
              cacheRead?: number;
              cacheWrite?: number;
            } | null;
          }>;
        }>;
        setThinkingLevel(req: { sessionId: string; level: string }): Promise<void>;
        list(req?: {
          search?: string;
          archived?: boolean;
          limit?: number;
          offset?: number;
        }): Promise<{ sessions: SessionSummary[] }>;
        rename(req: { sessionId: string; title: string }): Promise<void>;
        archive(req: { sessionId: string }): Promise<void>;
        delete(req: { sessionId: string }): Promise<void>;
        export(req: {
          sessionId: string;
          format: 'md' | 'json';
        }): Promise<{ path: string; format: 'md' | 'json' }>;
      };
      provider: {
        list(): Promise<{ providers: ProviderView[] }>;
        save(req: { config: unknown; apiKey?: string }): Promise<{ name: string }>;
        delete(req: { name: string }): Promise<void>;
        presets(): Promise<{ presets: ProviderPreset[] }>;
        discoverModels(req: {
          baseUrl: string;
          api?: string;
          apiKey?: string;
          headers?: Record<string, string>;
        }): Promise<{ models: Array<{ id: string; name: string | null }> }>;
        test(req: { name: string; model?: string }): Promise<{
          ok: boolean;
          status: number | null;
          latencyMs: number | null;
          snippet: string | null;
          error: string | null;
        }>;
      };
      secrets: {
        status(): Promise<SecretsStatusResponse>;
      };
      auth: {
        status(): Promise<{ providers: AuthProviderStatus[] }>;
        launchLogin(req?: { provider?: string }): Promise<{ launched: boolean; terminal: string }>;
      };
      workspace: {
        add(req: { path: string }): Promise<{ workspace: WorkspaceRecord; needsTrust: boolean }>;
        remove(req: { workspaceId: string }): Promise<void>;
        list(): Promise<{ workspaces: WorkspaceRecord[] }>;
        open(req: { workspaceId: string }): Promise<{ workspace: WorkspaceRecord }>;
        trust(req: {
          workspaceId: string;
          decision: 'once' | 'always' | 'alwaysParent' | 'never';
        }): Promise<void>;
        pickDirectory(): Promise<{ path: string | null }>;
      };
      onSessionEvent(
        cb: (payload: { sessionId: string; seq: number; ev: AgentDeskEvent }) => void,
      ): () => void;
    };
  }
}

export type { SessionSummary, WorkspaceRecord };
