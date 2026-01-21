/**
 * Google Gemini Provider Adapter
 * Supports text generation with multimodal capabilities
 */

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import type {
  TextGenerationParams,
  TextGenerationResult,
  ImageGenerationParams,
  ImageGenerationResult,
} from '@/types';
import { BaseProvider, ProviderError } from './base';

export class GoogleProvider extends BaseProvider {
  private client: GoogleGenerativeAI;

  constructor(apiKey: string) {
    super(apiKey, 'google');
    this.validateApiKey();
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async generateText(params: TextGenerationParams): Promise<TextGenerationResult> {
    try {
      const model = this.client.getGenerativeModel({
        model: params.model,
        generationConfig: {
          temperature: params.temperature ?? 0.7,
          maxOutputTokens: params.maxTokens,
        },
        safetySettings: [
          {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
          },
          {
            category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
            threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
          },
          {
            category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
            threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
          },
          {
            category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
          },
        ],
      });

      // Convert messages to Gemini format
      const contents = this.convertToGeminiMessages(params);

      const result = await model.generateContent({
        contents,
      });

      const response = result.response;
      const text = response.text();

      // Extract token usage if available
      const usageMetadata = response.usageMetadata;

      return {
        text,
        usage: usageMetadata
          ? {
              inputTokens: usageMetadata.promptTokenCount || 0,
              outputTokens: usageMetadata.candidatesTokenCount || 0,
            }
          : undefined,
        raw: response,
      };
    } catch (error) {
      throw new ProviderError(
        error instanceof Error ? error.message : 'Unknown error',
        'google',
        undefined,
        error
      );
    }
  }

  async *streamText(params: TextGenerationParams): AsyncGenerator<string, TextGenerationResult> {
    try {
      const model = this.client.getGenerativeModel({
        model: params.model,
        generationConfig: {
          temperature: params.temperature ?? 0.7,
          maxOutputTokens: params.maxTokens,
        },
      });

      const contents = this.convertToGeminiMessages(params);

      const result = await model.generateContentStream({
        contents,
      });

      let fullText = '';
      let inputTokens = 0;
      let outputTokens = 0;

      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        if (chunkText) {
          fullText += chunkText;
          yield chunkText;
        }

        // Update token counts from usage metadata
        if (chunk.usageMetadata) {
          inputTokens = chunk.usageMetadata.promptTokenCount || 0;
          outputTokens = chunk.usageMetadata.candidatesTokenCount || 0;
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
      throw new ProviderError(
        error instanceof Error ? error.message : 'Unknown error',
        'google',
        undefined,
        error
      );
    }
  }

  // Google doesn't have a direct image generation API in the SDK
  // TODO: Could implement with Imagen API if access is available
  generateImage(_params: ImageGenerationParams): Promise<ImageGenerationResult> {
    throw new ProviderError(
      'Image generation is not directly supported via Google Generative AI SDK. Consider using Imagen API.',
      'google'
    );
  }

  /**
   * Convert our message format to Gemini's format
   */
  private convertToGeminiMessages(params: TextGenerationParams) {
    type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };
    type GeminiContent = { role: string; parts: GeminiPart[] };

    const contents: GeminiContent[] = [];

    // Handle system message by prepending to first user message
    const systemMessage = params.messages.find((m) => m.role === 'system');
    let systemPrefix = systemMessage ? `${systemMessage.content}\n\n` : '';

    for (const msg of params.messages) {
      if (msg.role === 'system') continue;

      const parts: GeminiPart[] = [];

      // Add text content
      let textContent = msg.content;
      if (systemPrefix && msg.role === 'user') {
        textContent = systemPrefix + textContent;
        systemPrefix = ''; // Only add once
      }
      parts.push({ text: textContent });

      // Add images if present
      if (msg.images && msg.images.length > 0) {
        for (const image of msg.images) {
          if (image.startsWith('data:')) {
            // Extract base64 and mime type from data URL
            const match = image.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              parts.push({
                inlineData: {
                  mimeType: match[1],
                  data: match[2],
                },
              });
            }
          } else if (!image.startsWith('http')) {
            // Assume raw base64
            parts.push({
              inlineData: {
                mimeType: 'image/jpeg',
                data: image,
              },
            });
          }
          // Note: Gemini SDK doesn't support URL images directly
          // Would need to fetch and convert to base64
        }
      }

      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts,
      });
    }

    return contents;
  }
}
