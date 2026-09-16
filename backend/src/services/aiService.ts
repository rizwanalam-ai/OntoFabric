import OpenAI from 'openai';
import { getStoredActiveProvider, getStoredProviderSettings } from './aiSettingsStore.js';

export type AiProvider = 'openai' | 'gemini' | 'deepseek';

type AiCapability = 'chat' | 'embeddings';

type ProviderConfig = {
  label: string;
  baseURL: string;
  defaultChatModel: string;
  defaultEmbeddingModel?: string;
};

const providerConfigs: Record<AiProvider, ProviderConfig> = {
  openai: {
    label: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    defaultChatModel: 'gpt-4o',
    defaultEmbeddingModel: 'text-embedding-3-small'
  },
  gemini: {
    label: 'Google Gemini',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultChatModel: 'gemini-2.5-flash'
  },
  deepseek: {
    label: 'DeepSeek',
    baseURL: 'https://api.deepseek.com',
    defaultChatModel: 'deepseek-chat'
  }
};

const clients = new Map<string, OpenAI>();

const isConfiguredValue = (value: string | undefined): value is string => {
  const normalized = value?.trim();
  return Boolean(normalized && !['your_key', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'DEEPSEEK_API_KEY'].includes(normalized));
};

export const getAiProvider = (capability: AiCapability = 'chat'): AiProvider => {
  const provider = (capability === 'embeddings' ? process.env.AI_EMBEDDING_PROVIDER : getStoredActiveProvider() ?? process.env.AI_PROVIDER)?.trim().toLowerCase() ?? 'openai';
  if (!(provider in providerConfigs)) {
    throw new Error(`Unsupported AI_PROVIDER: ${provider}. Use openai, gemini, or deepseek.`);
  }
  return provider as AiProvider;
};

export const getAiModel = (capability: AiCapability = 'chat'): string => {
  const provider = getAiProvider(capability);
  const storedModel = capability === 'chat' ? getStoredProviderSettings(provider).model : undefined;
  if (capability === 'embeddings') {
    return storedModel
      ?? process.env.AI_EMBEDDING_MODEL
      ?? (provider === 'openai' ? process.env.OPENAI_EMBEDDING_MODEL : undefined)
      ?? providerConfigs[provider].defaultEmbeddingModel
      ?? '';
  }
  return storedModel ?? process.env.AI_MODEL ?? process.env.OPENAI_MODEL ?? providerConfigs[provider].defaultChatModel;
};

export const getAiClient = (capability: AiCapability = 'chat'): OpenAI => {
  const provider = getAiProvider(capability);
  const config = providerConfigs[provider];
  if (capability === 'embeddings' && !config.defaultEmbeddingModel && !process.env.AI_EMBEDDING_MODEL) {
    throw new Error(`${config.label} does not provide an OpenAI-compatible embeddings model. Set AI_EMBEDDING_PROVIDER to a provider with embeddings support.`);
  }
  const apiKey = getStoredProviderSettings(provider).apiKey;
  if (!isConfiguredValue(apiKey)) throw new Error(`${provider} API key is not configured in SQLite.`);
  const baseURL = process.env.AI_BASE_URL ?? process.env[`${provider.toUpperCase()}_BASE_URL`] ?? config.baseURL;
  const cacheKey = `${provider}:${baseURL}:${capability}`;
  const cached = clients.get(cacheKey);
  if (cached) return cached;
  const client = new OpenAI({ apiKey, baseURL });
  clients.set(cacheKey, client);
  return client;
};

export const isAiConfigured = (capability: AiCapability = 'chat'): boolean => {
  const provider = getAiProvider(capability);
  return isConfiguredValue(getStoredProviderSettings(provider).apiKey);
};

export const getConfiguredAiProviders = () => Object.entries(providerConfigs).map(([id, config]) => {
  const provider = id as AiProvider;
  const stored = getStoredProviderSettings(provider);
  const apiKey = stored.apiKey;
  return {
    id,
    label: config.label,
    configured: isConfiguredValue(apiKey),
    apiKeySet: isConfiguredValue(apiKey),
    model: stored.model ?? (provider === getAiProvider() ? getAiModel() : config.defaultChatModel),
    supportsEmbeddings: Boolean(config.defaultEmbeddingModel)
  };
});