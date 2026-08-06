/**
 * 内置 Provider 目录（README 4.6，共 38 个）。
 * 只提供默认 baseUrl / api / 认证方式提示；用户可覆盖任意字段。
 * baseUrl 为 null 表示需要用户填写（如 Azure / Vertex / 自托管网关）。
 */
import type { ProviderApi, ProviderAuthMethod } from './types';

export interface BuiltinProvider {
  name: string;
  label: string;
  api: ProviderApi | null;
  baseUrl: string | null;
  authMethod: ProviderAuthMethod;
}

/** README 4.6 内置目录（顺序即 pi 文档顺序） */
export const BUILTIN_PROVIDERS: BuiltinProvider[] = [
  {
    name: 'anthropic',
    label: 'Anthropic',
    api: 'anthropic-messages',
    baseUrl: 'https://api.anthropic.com',
    authMethod: 'api-key',
  },
  {
    name: 'openai',
    label: 'OpenAI',
    api: 'openai-completions',
    baseUrl: 'https://api.openai.com/v1',
    authMethod: 'api-key',
  },
  {
    name: 'openai-codex',
    label: 'OpenAI Codex',
    api: 'openai-completions',
    baseUrl: 'https://api.openai.com/v1',
    authMethod: 'api-key',
  },
  {
    name: 'azure-openai-responses',
    label: 'Azure OpenAI',
    api: 'openai-completions',
    baseUrl: null,
    authMethod: 'api-key',
  },
  {
    name: 'google',
    label: 'Google Gemini',
    api: 'google-generative-ai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    authMethod: 'api-key',
  },
  {
    name: 'google-vertex',
    label: 'Google Vertex AI',
    api: 'google-generative-ai',
    baseUrl: null,
    authMethod: 'api-key',
  },
  {
    name: 'amazon-bedrock',
    label: 'Amazon Bedrock',
    api: 'openai-completions',
    baseUrl: null,
    authMethod: 'api-key',
  },
  {
    name: 'deepseek',
    label: 'DeepSeek',
    api: 'openai-completions',
    baseUrl: 'https://api.deepseek.com/v1',
    authMethod: 'api-key',
  },
  {
    name: 'xai',
    label: 'xAI (Grok)',
    api: 'openai-completions',
    baseUrl: 'https://api.x.ai/v1',
    authMethod: 'api-key',
  },
  {
    name: 'groq',
    label: 'Groq',
    api: 'openai-completions',
    baseUrl: 'https://api.groq.com/openai/v1',
    authMethod: 'api-key',
  },
  {
    name: 'cerebras',
    label: 'Cerebras',
    api: 'openai-completions',
    baseUrl: 'https://api.cerebras.ai/v1',
    authMethod: 'api-key',
  },
  {
    name: 'mistral',
    label: 'Mistral',
    api: 'openai-completions',
    baseUrl: 'https://api.mistral.ai/v1',
    authMethod: 'api-key',
  },
  {
    name: 'openrouter',
    label: 'OpenRouter',
    api: 'openai-completions',
    baseUrl: 'https://openrouter.ai/api/v1',
    authMethod: 'api-key',
  },
  {
    name: 'vercel-ai-gateway',
    label: 'Vercel AI Gateway',
    api: 'openai-completions',
    baseUrl: 'https://ai-gateway.vercel.sh/v1',
    authMethod: 'api-key',
  },
  {
    name: 'github-copilot',
    label: 'GitHub Copilot',
    api: 'openai-completions',
    baseUrl: 'https://api.githubcopilot.com/v1',
    authMethod: 'api-key',
  },
  {
    name: 'huggingface',
    label: 'Hugging Face',
    api: 'openai-completions',
    baseUrl: 'https://router.huggingface.co/v1',
    authMethod: 'api-key',
  },
  {
    name: 'fireworks',
    label: 'Fireworks AI',
    api: 'openai-completions',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    authMethod: 'api-key',
  },
  {
    name: 'together',
    label: 'Together AI',
    api: 'openai-completions',
    baseUrl: 'https://api.together.xyz/v1',
    authMethod: 'api-key',
  },
  {
    name: 'nvidia',
    label: 'NVIDIA NIM',
    api: 'openai-completions',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    authMethod: 'api-key',
  },
  {
    name: 'zai',
    label: 'Z.ai',
    api: 'openai-completions',
    baseUrl: 'https://api.z.ai/api/paas/v4',
    authMethod: 'api-key',
  },
  {
    name: 'zai-coding-cn',
    label: 'Z.ai Coding (CN)',
    api: 'openai-completions',
    baseUrl: null,
    authMethod: 'api-key',
  },
  {
    name: 'minimax',
    label: 'MiniMax',
    api: 'openai-completions',
    baseUrl: 'https://api.minimaxi.com/v1',
    authMethod: 'api-key',
  },
  {
    name: 'minimax-cn',
    label: 'MiniMax (CN)',
    api: 'openai-completions',
    baseUrl: 'https://api.minimax.chat/v1',
    authMethod: 'api-key',
  },
  {
    name: 'moonshotai',
    label: 'Moonshot AI',
    api: 'openai-completions',
    baseUrl: 'https://api.moonshot.cn/v1',
    authMethod: 'api-key',
  },
  {
    name: 'moonshotai-cn',
    label: 'Moonshot AI (CN)',
    api: 'openai-completions',
    baseUrl: 'https://api.moonshot.cn/v1',
    authMethod: 'api-key',
  },
  {
    name: 'kimi-coding',
    label: 'Kimi Coding',
    api: 'openai-completions',
    baseUrl: 'https://api.moonshot.cn/v1',
    authMethod: 'api-key',
  },
  {
    name: 'qwen-token-plan',
    label: 'Qwen (Token Plan)',
    api: 'openai-completions',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    authMethod: 'api-key',
  },
  {
    name: 'qwen-token-plan-cn',
    label: 'Qwen (Token Plan CN)',
    api: 'openai-completions',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    authMethod: 'api-key',
  },
  {
    name: 'xiaomi',
    label: 'Xiaomi',
    api: 'openai-completions',
    baseUrl: null,
    authMethod: 'api-key',
  },
  {
    name: 'xiaomi-token-plan-cn',
    label: 'Xiaomi Token Plan (CN)',
    api: 'openai-completions',
    baseUrl: null,
    authMethod: 'api-key',
  },
  {
    name: 'xiaomi-token-plan-ams',
    label: 'Xiaomi Token Plan (AMS)',
    api: 'openai-completions',
    baseUrl: null,
    authMethod: 'api-key',
  },
  {
    name: 'xiaomi-token-plan-sgp',
    label: 'Xiaomi Token Plan (SGP)',
    api: 'openai-completions',
    baseUrl: null,
    authMethod: 'api-key',
  },
  {
    name: 'ant-ling',
    label: 'Ant Ling',
    api: 'openai-completions',
    baseUrl: null,
    authMethod: 'api-key',
  },
  {
    name: 'radius',
    label: 'Radius (OAuth)',
    api: 'openai-completions',
    baseUrl: null,
    authMethod: 'oauth',
  },
  {
    name: 'opencode',
    label: 'OpenCode',
    api: 'openai-completions',
    baseUrl: null,
    authMethod: 'api-key',
  },
  {
    name: 'opencode-go',
    label: 'OpenCode Go',
    api: 'openai-completions',
    baseUrl: null,
    authMethod: 'api-key',
  },
  {
    name: 'cloudflare-workers-ai',
    label: 'Cloudflare Workers AI',
    api: 'openai-completions',
    baseUrl: null,
    authMethod: 'api-key',
  },
  {
    name: 'cloudflare-ai-gateway',
    label: 'Cloudflare AI Gateway',
    api: 'openai-completions',
    baseUrl: null,
    authMethod: 'api-key',
  },
];

export function builtinProvider(name: string): BuiltinProvider | undefined {
  return BUILTIN_PROVIDERS.find((p) => p.name === name);
}

export function isBuiltinProvider(name: string): boolean {
  return builtinProvider(name) !== undefined;
}
