import { callAnthropicVisionAPI } from './anthropic';
import { callGoogleVisionAPI } from './google';
import { callOpenRouterVisionAPI } from './openrouter';

export type AIProviderCallFn = (
  apiKey: string,
  model: string,
  imageBase64: string,
  mimeType: string,
  prompt: string,
  signal?: AbortSignal
) => Promise<string>;

export const AI_PROVIDER_CALLS: Record<string, AIProviderCallFn> = {
  anthropic: callAnthropicVisionAPI,
  google: callGoogleVisionAPI,
  openrouter: callOpenRouterVisionAPI,
};
