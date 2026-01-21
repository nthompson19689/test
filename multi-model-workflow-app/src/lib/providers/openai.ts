/**
 * OpenAI Provider Adapter
 * Supports Chat Completions and DALL-E Image Generation
 */

import OpenAI from 'openai';
import type {
  TextGenerationParams,
  TextGenerationResult,
  ImageGenerationParams,
  ImageGenerationResult,
} from '@/types';
import { BaseProvider, ProviderError } from './base';

export class OpenAIProvider extends BaseProvider {
  private client: OpenAI;

  constructor(apiKey: string) {
    super(apiKey, 'openai');
    this.validateApiKey();
    this.client = new OpenAI({ apiKey });
  }

  async generateText(params: TextGenerationParams): Promise<TextGenerationResult> {
    try {
      const messages = params.messages.map((msg) => {
        // Handle vision models with images
        if (msg.images && msg.images.length > 0) {
          const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
            { type: 'text', text: msg.content },
          ];

          for (const image of msg.images) {
            content.push({
              type: 'image_url',
              image_url: {
                url: image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}`,
              },
            });
          }

          return {
            role: msg.role as 'user' | 'assistant' | 'system',
            content,
          };
        }

        return {
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content,
        };
      });

      const response = await this.client.chat.completions.create({
        model: params.model,
        messages: messages as OpenAI.ChatCompletionMessageParam[],
        temperature: params.temperature ?? 0.7,
        max_tokens: params.maxTokens,
      });

      const choice = response.choices[0];
      const text = choice?.message?.content || '';

      return {
        text,
        usage: response.usage
          ? {
              inputTokens: response.usage.prompt_tokens,
              outputTokens: response.usage.completion_tokens,
            }
          : undefined,
        raw: response,
      };
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        throw new ProviderError(
          error.message,
          'openai',
          error.status,
          error
        );
      }
      throw error;
    }
  }

  async *streamText(params: TextGenerationParams): AsyncGenerator<string, TextGenerationResult> {
    try {
      const messages = params.messages.map((msg) => ({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content,
      }));

      const stream = await this.client.chat.completions.create({
        model: params.model,
        messages,
        temperature: params.temperature ?? 0.7,
        max_tokens: params.maxTokens,
        stream: true,
      });

      let fullText = '';
      let usage: { inputTokens: number; outputTokens: number } | undefined;

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || '';
        if (delta) {
          fullText += delta;
          yield delta;
        }

        // Capture usage from final chunk if available
        if (chunk.usage) {
          usage = {
            inputTokens: chunk.usage.prompt_tokens,
            outputTokens: chunk.usage.completion_tokens,
          };
        }
      }

      return {
        text: fullText,
        usage,
        raw: { streamed: true },
      };
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        throw new ProviderError(
          error.message,
          'openai',
          error.status,
          error
        );
      }
      throw error;
    }
  }

  async generateImage(params: ImageGenerationParams): Promise<ImageGenerationResult> {
    try {
      const response = await this.client.images.generate({
        model: 'dall-e-3',
        prompt: params.prompt,
        n: 1,
        size: params.size || '1024x1024',
        quality: params.quality || 'standard',
        style: params.style || 'natural',
        response_format: 'url',
      });

      const imageData = response.data[0];

      return {
        imageUrl: imageData?.url,
        revisedPrompt: imageData?.revised_prompt,
        raw: response,
      };
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        throw new ProviderError(
          error.message,
          'openai',
          error.status,
          error
        );
      }
      throw error;
    }
  }
}
