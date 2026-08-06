/**
 * 一键预设（README 8.6.3）：自动填 baseUrl + api + compat + 占位 key。
 */
import type { ProviderConfigInput } from './types';

export interface ProviderPreset {
  id: string;
  label: string;
  description: string;
  config: ProviderConfigInput;
}

const LOCAL_COMPAT = { supportsDeveloperRole: false, supportsReasoningEffort: false };

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'ollama',
    label: 'Ollama',
    description: '本地 Ollama（http://localhost:11434），无需密钥',
    config: {
      name: 'ollama',
      baseUrl: 'http://localhost:11434/v1',
      api: 'openai-completions',
      authMethod: 'none',
      authHeader: true,
      compat: LOCAL_COMPAT,
      models: [],
    },
  },
  {
    id: 'lm-studio',
    label: 'LM Studio',
    description: '本地 LM Studio（http://localhost:1234）',
    config: {
      name: 'lm-studio',
      baseUrl: 'http://localhost:1234/v1',
      api: 'openai-completions',
      authMethod: 'none',
      authHeader: true,
      compat: LOCAL_COMPAT,
      models: [],
    },
  },
  {
    id: 'vllm',
    label: 'vLLM',
    description: '本地 vLLM（http://localhost:8000）',
    config: {
      name: 'vllm',
      baseUrl: 'http://localhost:8000/v1',
      api: 'openai-completions',
      authMethod: 'none',
      authHeader: true,
      compat: LOCAL_COMPAT,
      models: [],
    },
  },
  {
    id: 'sglang',
    label: 'SGLang',
    description: '本地 SGLang（http://localhost:30000）',
    config: {
      name: 'sglang',
      baseUrl: 'http://localhost:30000/v1',
      api: 'openai-completions',
      authMethod: 'none',
      authHeader: true,
      compat: LOCAL_COMPAT,
      models: [],
    },
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    description: 'OpenRouter 聚合网关（https://openrouter.ai/api/v1）',
    config: {
      name: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      api: 'openai-completions',
      authMethod: 'api-key',
      authHeader: true,
      models: [],
    },
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    description: 'DeepSeek（https://api.deepseek.com/v1）',
    config: {
      name: 'deepseek',
      baseUrl: 'https://api.deepseek.com/v1',
      api: 'openai-completions',
      authMethod: 'api-key',
      authHeader: true,
      models: [],
    },
  },
  {
    id: 'siliconflow',
    label: '硅基流动 (SiliconFlow)',
    description: '硅基流动（https://api.siliconflow.cn/v1）',
    config: {
      name: 'siliconflow',
      baseUrl: 'https://api.siliconflow.cn/v1',
      api: 'openai-completions',
      authMethod: 'api-key',
      authHeader: true,
      models: [],
    },
  },
];
