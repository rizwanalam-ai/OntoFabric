import { Router } from 'express';
import { z } from 'zod';

import { getConfiguredAiProviders, getAiModel, getAiProvider } from '../services/aiService.js';
import { saveActiveProvider, saveProviderSettings } from '../services/aiSettingsStore.js';

const router = Router();
const providerSchema = z.enum(['openai', 'gemini', 'deepseek']);
const settingsSchema = z.object({
  provider: providerSchema,
  apiKey: z.string().trim().max(500).optional(),
  model: z.string().trim().min(1).max(160)
}).strict();

router.get('/providers', (_request, response) => {
  response.json({
    activeProvider: getAiProvider(),
    activeModel: getAiModel(),
    providers: getConfiguredAiProviders()
  });
});

router.put('/providers/:provider', (request, response) => {
  const provider = providerSchema.safeParse(request.params.provider);
  const parsed = settingsSchema.safeParse({ ...request.body, provider: request.params.provider });
  if (!provider.success || !parsed.success) {
    const details = !provider.success ? provider.error.flatten() : !parsed.success ? parsed.error.flatten() : undefined;
    response.status(400).json({ error: 'Invalid AI provider settings.', details });
    return;
  }
  saveProviderSettings(provider.data, { apiKey: parsed.data.apiKey, model: parsed.data.model });
  saveActiveProvider(provider.data);
  response.json({ activeProvider: getAiProvider(), activeModel: getAiModel(), providers: getConfiguredAiProviders() });
});

export default router;