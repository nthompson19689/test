/**
 * API Keys Management Routes
 * POST /api/keys - Create new API key
 * GET /api/keys - List all API keys (masked)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/db';
import { encrypt, getKeyLastFour, maskKey } from '@/lib/utils/encryption';

// Request validation schema
const CreateKeySchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'google', 'perplexity']),
  name: z.string().min(1, 'Name is required').max(100),
  apiKey: z.string().min(10, 'API key is too short'),
});

/**
 * POST /api/keys - Create new API key
 */
export async function POST(request: NextRequest) {
  try {
    console.log('POST /api/keys - Starting...');
    const body = await request.json();
    console.log('Request body received:', { provider: body.provider, name: body.name, keyLength: body.apiKey?.length });

    const validated = CreateKeySchema.parse(body);
    console.log('Validation passed');

    // Encrypt the API key
    console.log('Encrypting API key...');
    const encryptedKey = await encrypt(validated.apiKey);
    const keyLastFour = getKeyLastFour(validated.apiKey);
    console.log('Encryption complete, keyLastFour:', keyLastFour);

    // Create the key record
    console.log('Creating database record...');
    const apiKey = await prisma.apiKey.create({
      data: {
        provider: validated.provider,
        name: validated.name,
        encryptedKey,
        keyLastFour,
        isValid: true,
      },
      select: {
        id: true,
        provider: true,
        name: true,
        keyLastFour: true,
        isValid: true,
        createdAt: true,
      },
    });
    console.log('Database record created:', apiKey.id);

    return NextResponse.json({
      success: true,
      data: apiKey,
    });
  } catch (error) {
    console.error('Create API key error:', error);

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

    // Return more specific error message
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        success: false,
        error: { message: `Failed to create API key: ${errorMessage}` },
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/keys - List all API keys (masked)
 */
export async function GET() {
  try {
    const keys = await prisma.apiKey.findMany({
      select: {
        id: true,
        provider: true,
        name: true,
        keyLastFour: true,
        isValid: true,
        lastUsedAt: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Add masked key for display
    const maskedKeys = keys.map((key) => ({
      ...key,
      maskedKey: maskKey(key.keyLastFour),
    }));

    return NextResponse.json({
      success: true,
      data: maskedKeys,
    });
  } catch (error) {
    console.error('List API keys error:', error);
    return NextResponse.json(
      {
        success: false,
        error: { message: 'Failed to list API keys' },
      },
      { status: 500 }
    );
  }
}
