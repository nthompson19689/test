/**
 * API Key Individual Routes
 * DELETE /api/keys/[id] - Delete an API key
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

/**
 * DELETE /api/keys/[id] - Delete an API key
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    // Check if key exists
    const key = await prisma.apiKey.findUnique({
      where: { id },
    });

    if (!key) {
      return NextResponse.json(
        {
          success: false,
          error: { message: 'API key not found' },
        },
        { status: 404 }
      );
    }

    // Delete the key
    await prisma.apiKey.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      data: { deleted: true },
    });
  } catch (error) {
    console.error('Delete API key error:', error);
    return NextResponse.json(
      {
        success: false,
        error: { message: 'Failed to delete API key' },
      },
      { status: 500 }
    );
  }
}
