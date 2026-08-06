/// <reference types="vite/client" />

interface Window {
  agentdesk: {
    ping(nonce?: string): Promise<{ pong: string }>;
    getVersion(): Promise<{ version: string }>;
    window: {
      minimize(): Promise<void>;
      maximize(): Promise<void>;
      close(): Promise<void>;
    };
  };
}
