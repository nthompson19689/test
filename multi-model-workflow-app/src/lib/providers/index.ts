/**
 * Provider Factory and Exports
 */

import type { Provider, ProviderAdapter } from '@/types';
import { OpenAIProvider } from './openai';
import { AnthropicProvider } from './anthropic';
import { GoogleProvider } from './google';
import { PerplexityProvider } from './perplexity';
import { ProviderError } from './base';

export { OpenAIProvider } from './openai';
export { AnthropicProvider } from './anthropic';
export { GoogleProvider } from './google';
export { PerplexityProvider } from './perplexity';
export { BaseProvider, ProviderError } from './base';

/**
 * Create a provider adapter instance
 */
export function createProvider(provider: Provider, apiKey: string): ProviderAdapter {
  switch (provider) {
    case 'openai':
      return new OpenAIProvider(apiKey);
    case 'anthropic':
      return new AnthropicProvider(apiKey);
    case 'google':
      return new GoogleProvider(apiKey);
    case 'perplexity':
      return new PerplexityProvider(apiKey);
    default:
      throw new ProviderError(`Unknown provider: ${provider}`, provider as Provider);
  }
}

/**
 * Check if a provider supports image generation
 */
export function supportsImageGeneration(provider: Provider): boolean {
  return provider === 'openai';
}

/**
 * Check if a provider supports streaming
 */
export function supportsStreaming(provider: Provider): boolean {
  return ['openai', 'anthropic', 'google', 'perplexity'].includes(provider);
}

/**
 * Get default model for a provider
 */
export function getDefaultModel(provider: Provider): string {
  switch (provider) {
    case 'openai':
      return 'gpt-4o';
    case 'anthropic':
      return 'claude-3-5-sonnet-20241022';
    case 'google':
      return 'gemini-1.5-pro';
    case 'perplexity':
      return 'llama-3.1-sonar-large-128k-online';
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
