import { defaultGeminiProvider } from './gemini.js';
import { defaultProvider as defaultOpenAIProvider } from './openai.js';
import type { ImageProvider } from './types.js';

export const PROVIDER_NAMES = ['openai', 'gemini'] as const;
export type ProviderName = (typeof PROVIDER_NAMES)[number];

export function createProvider(name: ProviderName): Promise<ImageProvider> {
	return name === 'gemini' ? defaultGeminiProvider() : defaultOpenAIProvider();
}
