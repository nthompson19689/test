/**
 * Chat API Route
 * POST /api/chat - Send chat message with streaming support
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/db';
import { decrypt } from '@/lib/utils/encryption';
import { createProvider } from '@/lib/providers';
import type { Provider, Message } from '@/types';

const ChatRequestSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant', 'system']),
      content: z.string(),
      images: z.array(z.string()).optional(),
    })
  ),
  provider: z.enum(['openai', 'anthropic', 'google', 'perplexity']),
  model: z.string(),
  apiKeyId: z.string(),
  stream: z.boolean().optional().default(true),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().optional(),
});

/**
 * POST /api/chat - Send chat message
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = ChatRequestSchema.parse(body);

    // Get and decrypt API key
    const apiKeyRecord = await prisma.apiKey.findUnique({
      where: { id: validated.apiKeyId },
    });

    if (!apiKeyRecord) {
      return NextResponse.json(
        { success: false, error: { message: 'API key not found' } },
        { status: 404 }
      );
    }

    if (apiKeyRecord.provider !== validated.provider) {
      return NextResponse.json(
        {
          success: false,
          error: { message: `API key is for ${apiKeyRecord.provider}, not ${validated.provider}` },
        },
        { status: 400 }
      );
    }

    const apiKey = await decrypt(apiKeyRecord.encryptedKey);

    // Update last used
    await prisma.apiKey.update({
      where: { id: validated.apiKeyId },
      data: { lastUsedAt: new Date() },
    });

    // Create provider
    const provider = createProvider(validated.provider as Provider, apiKey);

    // Handle streaming response
    if (validated.stream && provider.streamText) {
      const encoder = new TextEncoder();

      const stream = new ReadableStream({
        async start(controller) {
          try {
            const generator = provider.streamText!({
              model: validated.model,
              messages: validated.messages as Message[],
              temperature: validated.temperature,
              maxTokens: validated.maxTokens,
            });

            for await (const chunk of generator) {
              const data = JSON.stringify({ content: chunk });
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            }

            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ error: errorMessage })}\n\n`)
            );
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    }

    // Non-streaming response
    const result = await provider.generateText({
      model: validated.model,
      messages: validated.messages as Message[],
      temperature: validated.temperature,
      maxTokens: validated.maxTokens,
    });

    return NextResponse.json({
      success: true,
      data: {
        content: result.text,
        usage: result.usage,
        citations: result.citations,
      },
    });
  } catch (error) {
    console.error('Chat error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: 'Validation error',
            details: error.errors,
          },
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Failed to process chat',
        },
      },
      { status: 500 }
    );
  }
}
