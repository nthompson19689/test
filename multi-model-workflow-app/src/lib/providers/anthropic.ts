/**
 * Anthropic Claude Provider Adapter
 * Supports text generation with vision capabilities
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  TextGenerationParams,
  TextGenerationResult,
  ImageGenerationParams,
  ImageGenerationResult,
} from '@/types';
import { BaseProvider, ProviderError } from './base';

export class AnthropicProvider extends BaseProvider {
  private client: Anthropic;

  constructor(apiKey: string) {
    super(apiKey, 'anthropic');
    this.validateApiKey();
    this.client = new Anthropic({ apiKey });
  }

  async generateText(params: TextGenerationParams): Promise<TextGenerationResult> {
    try {
      // Extract system message if present
      const systemMessage = params.messages.find((m) => m.role === 'system');
      const nonSystemMessages = params.messages.filter((m) => m.role !== 'system');

      const messages = nonSystemMessages.map((msg) => {
        // Handle vision with images
        if (msg.images && msg.images.length > 0) {
          const content: Anthropic.ContentBlockParam[] = [];

          // Add images first
          for (const image of msg.images) {
            // Determine if it's a URL or base64
            if (image.startsWith('http://') || image.startsWith('https://')) {
              content.push({
                type: 'image',
                source: {
                  type: 'url',
                  url: image,
                },
              });
            } else {
              // Assume base64
              content.push({
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: image.replace(/^data:image\/\w+;base64,/, ''),
                },
              });
            }
          }

          // Add text content
          content.push({
            type: 'text',
            text: msg.content,
          });

          return {
            role: msg.role as 'user' | 'assistant',
            content,
          };
        }

        return {
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        };
      });

      const response = await this.client.messages.create({
        model: params.model,
        max_tokens: params.maxTokens || 4096,
        system: systemMessage?.content,
        messages,
      });

      // Extract text from content blocks
      let text = '';
      for (const block of response.content) {
        if (block.type === 'text') {
          text += block.text;
        }
      }

      return {
        text,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
        raw: response,
      };
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        throw new ProviderError(
          error.message,
          'anthropic',
          error.status,
          error
        );
      }
      throw error;
    }
  }

  async *streamText(params: TextGenerationParams): AsyncGenerator<string, TextGenerationResult> {
    try {
      const systemMessage = params.messages.find((m) => m.role === 'system');
      const nonSystemMessages = params.messages.filter((m) => m.role !== 'system');

      const messages = nonSystemMessages.map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      }));

      const stream = this.client.messages.stream({
        model: params.model,
        max_tokens: params.maxTokens || 4096,
        system: systemMessage?.content,
        messages,
      });

      let fullText = '';
      let inputTokens = 0;
      let outputTokens = 0;

      for await (const event of stream) {
        if (event.type === 'content_block_delta') {
          const delta = event.delta;
          if ('text' in delta) {
            fullText += delta.text;
            yield delta.text;
          }
        } else if (event.type === 'message_delta') {
          if (event.usage) {
            outputTokens = event.usage.output_tokens;
          }
        } else if (event.type === 'message_start') {
          if (event.message.usage) {
            inputTokens = event.message.usage.input_tokens;
          }
        }
      }

      return {
        text: fullText,
        usage: {
          inputTokens,
          outputTokens,
        },
        raw: { streamed: true },
      };
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        throw new ProviderError(
          error.message,
          'anthropic',
          error.status,
          error
        );
      }
      throw error;
    }
  }

  // Anthropic doesn't support image generation
  generateImage(_params: ImageGenerationParams): Promise<ImageGenerationResult> {
    throw new ProviderError(
      'Image generation is not supported by Anthropic',
      'anthropic'
    );
  }
}
