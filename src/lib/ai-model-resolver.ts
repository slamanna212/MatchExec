import aiModels from '../../data/ai-models.json';

export function resolveModelId(providerId: string, abstractModel: string): string {
  const providerModels = aiModels[providerId as keyof typeof aiModels];
  return providerModels?.[abstractModel as keyof typeof providerModels] ?? abstractModel;
}
