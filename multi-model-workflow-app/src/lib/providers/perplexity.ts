/**
 * Perplexity Provider Adapter
 * Supports web-grounded text generation with citations
 */

import type {
  TextGenerationParams,
  TextGenerationResult,
  ImageGenerationParams,
  ImageGenerationResult,
} from '@/types';
import { BaseProvider, ProviderError } from './base';

interface PerplexityMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface PerplexityResponse {
  id: string;
  model: string;
  created: number;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  citations?: string[];
}

export class PerplexityProvider extends BaseProvider {
  private baseUrl = 'https://api.perplexity.ai';

  constructor(apiKey: string) {
    super(apiKey, 'perplexity');
    this.validateApiKey();
  }

  async generateText(params: TextGenerationParams): Promise<TextGenerationResult> {
    try {
      const messages: PerplexityMessage[] = params.messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: params.model,
          messages,
          temperature: params.temperature ?? 0.7,
          max_tokens: params.maxTokens,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new ProviderError(
          errorData.error?.message || `Perplexity API error: ${response.status}`,
          'perplexity',
          response.status,
          errorData
        );
      }

      const data: PerplexityResponse = await response.json();
      const choice = data.choices[0];
      const text = choice?.message?.content || '';

      return {
        text,
        usage: data.usage
          ? {
              inputTokens: data.usage.prompt_tokens,
              outputTokens: data.usage.completion_tokens,
            }
          : undefined,
        citations: data.citations,
        raw: data,
      };
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError(
        error instanceof Error ? error.message : 'Unknown error',
        'perplexity',
        undefined,
        error
      );
    }
  }

  async *streamText(params: TextGenerationParams): AsyncGenerator<string, TextGenerationResult> {
    try {
      const messages: PerplexityMessage[] = params.messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: params.model,
          messages,
          temperature: params.temperature ?? 0.7,
          max_tokens: params.maxTokens,
          stream: true,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new ProviderError(
          errorData.error?.message || `Perplexity API error: ${response.status}`,
          'perplexity',
          response.status,
          errorData
        );
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new ProviderError('No response body', 'perplexity');
      }

      const decoder = new TextDecoder();
      let fullText = '';
      let citations: string[] = [];
      let inputTokens = 0;
      let outputTokens = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter((line) => line.startsWith('data: '));

        for (const line of lines) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              fullText += delta;
              yield delta;
            }

            // Capture citations and usage
            if (parsed.citations) {
              citations = parsed.citations;
            }
            if (parsed.usage) {
              inputTokens = parsed.usage.prompt_tokens || 0;
              outputTokens = parsed.usage.completion_tokens || 0;
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }

      return {
        text: fullText,
        usage: {
          inputTokens,
          outputTokens,
        },
        citations: citations.length > 0 ? citations : undefined,
        raw: { streamed: true },
      };
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError(
        error instanceof Error ? error.message : 'Unknown error',
        'perplexity',
        undefined,
        error
      );
    }
  }

  // Perplexity doesn't support image generation
  generateImage(_params: ImageGenerationParams): Promise<ImageGenerationResult> {
    throw new ProviderError(
      'Image generation is not supported by Perplexity',
      'perplexity'
    );
  }
}
