import type {
  AuthProviderStatus,
  ProviderConfigInput,
  ProviderPreset,
  ProviderView,
  SecretsStatusResponse,
} from '@agentdesk/ipc';
import { create } from 'zustand';

const FAVORITES_KEY = 'agentdesk-model-favorites';
const RECENT_KEY = 'agentdesk-model-recent';

function readList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeList(key: string, list: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(list.slice(0, 50)));
  } catch {
    // 忽略 localStorage 不可用
  }
}

interface ProviderStore {
  providers: ProviderView[];
  presets: ProviderPreset[];
  secretsStatus: SecretsStatusResponse | null;
  authStatus: AuthProviderStatus[] | null;
  favorites: string[];
  recentModels: string[];
  loadProviders: () => Promise<void>;
  saveProvider: (config: ProviderConfigInput, apiKey?: string) => Promise<void>;
  deleteProvider: (name: string) => Promise<void>;
  refreshSecrets: () => Promise<void>;
  refreshAuth: () => Promise<void>;
  launchLogin: () => Promise<void>;
  toggleFavorite: (modelId: string) => void;
  markRecent: (modelId: string) => void;
  isFavorite: (modelId: string) => boolean;
}

export const useProviderStore = create<ProviderStore>()((set, get) => ({
  providers: [],
  presets: [],
  secretsStatus: null,
  authStatus: null,
  favorites: readList(FAVORITES_KEY),
  recentModels: readList(RECENT_KEY),

  loadProviders: async () => {
    const [list, presets] = await Promise.all([
      window.agentdesk.provider.list(),
      window.agentdesk.provider.presets(),
    ]);
    set({ providers: list.providers, presets: presets.presets });
  },

  saveProvider: async (config, apiKey) => {
    await window.agentdesk.provider.save(apiKey !== undefined ? { config, apiKey } : { config });
    await get().loadProviders();
  },

  deleteProvider: async (name) => {
    await window.agentdesk.provider.delete({ name });
    await get().loadProviders();
  },

  refreshSecrets: async () => {
    const status = await window.agentdesk.secrets.status();
    set({ secretsStatus: status });
  },

  refreshAuth: async () => {
    const { providers } = await window.agentdesk.auth.status();
    set({ authStatus: providers });
  },

  launchLogin: async () => {
    await window.agentdesk.auth.launchLogin();
  },

  toggleFavorite: (modelId) => {
    const favorites = get().favorites.includes(modelId)
      ? get().favorites.filter((f) => f !== modelId)
      : [modelId, ...get().favorites];
    writeList(FAVORITES_KEY, favorites);
    set({ favorites });
  },

  markRecent: (modelId) => {
    const recentModels = [modelId, ...get().recentModels.filter((r) => r !== modelId)];
    writeList(RECENT_KEY, recentModels);
    set({ recentModels });
  },

  isFavorite: (modelId) => get().favorites.includes(modelId),
}));
