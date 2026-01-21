/**
 * Base provider interface and utilities
 */

import type {
  ProviderAdapter,
  TextGenerationParams,
  TextGenerationResult,
  ImageGenerationParams,
  ImageGenerationResult,
  Provider,
} from '@/types';

export abstract class BaseProvider implements ProviderAdapter {
  protected apiKey: string;
  protected provider: Provider;

  constructor(apiKey: string, provider: Provider) {
    this.apiKey = apiKey;
    this.provider = provider;
  }

  abstract generateText(params: TextGenerationParams): Promise<TextGenerationResult>;

  // Optional image generation - not all providers support it
  generateImage?(params: ImageGenerationParams): Promise<ImageGenerationResult>;

  // Optional streaming - not all providers support it
  async *streamText?(params: TextGenerationParams): AsyncGenerator<string, TextGenerationResult> {
    // Default implementation falls back to non-streaming
    const result = await this.generateText(params);
    yield result.text;
    return result;
  }

  /**
   * Validate that an API key exists
   */
  protected validateApiKey(): void {
    if (!this.apiKey) {
      throw new Error(`API key is required for ${this.provider}`);
    }
  }

  /**
   * Build messages with image support
   */
  protected buildMessagesWithImages(
    params: TextGenerationParams
  ): Array<{ role: string; content: unknown }> {
    const messages = params.messages.map((msg) => {
      if (msg.images && msg.images.length > 0) {
        // Provider-specific image handling is done in subclasses
        return {
          role: msg.role,
          content: msg.content,
          images: msg.images,
        };
      }
      return {
        role: msg.role,
        content: msg.content,
      };
    });
    return messages;
  }
}

/**
 * Error class for provider errors
 */
export class ProviderError extends Error {
  public provider: Provider;
  public statusCode?: number;
  public raw?: unknown;

  constructor(
    message: string,
    provider: Provider,
    statusCode?: number,
    raw?: unknown
  ) {
    super(message);
    this.name = 'ProviderError';
    this.provider = provider;
    this.statusCode = statusCode;
    this.raw = raw;
  }
}
