/**
 * Workflows API Routes
 * POST /api/workflows - Create workflow
 * GET /api/workflows - List workflows
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/db';

const CreateWorkflowSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  nodes: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      nodeType: z.enum(['SCRAPE_URL', 'RESEARCH', 'ANALYZE', 'GENERATE_TEXT', 'GENERATE_IMAGE']),
      config: z.record(z.unknown()),
      positionX: z.number(),
      positionY: z.number(),
    })
  ),
  edges: z.array(
    z.object({
      id: z.string(),
      sourceNodeId: z.string(),
      targetNodeId: z.string(),
      sourceHandle: z.string().optional(),
      targetHandle: z.string().optional(),
    })
  ),
});

/**
 * POST /api/workflows - Create workflow
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = CreateWorkflowSchema.parse(body);

    // Create workflow with nodes and edges
    const workflow = await prisma.workflow.create({
      data: {
        name: validated.name,
        description: validated.description,
        nodes: {
          create: validated.nodes.map((node) => ({
            id: node.id,
            name: node.name,
            nodeType: node.nodeType,
            config: JSON.stringify(node.config),
            positionX: node.positionX,
            positionY: node.positionY,
          })),
        },
        edges: {
          create: validated.edges.map((edge) => ({
            id: edge.id,
            sourceNodeId: edge.sourceNodeId,
            targetNodeId: edge.targetNodeId,
            sourceHandle: edge.sourceHandle,
            targetHandle: edge.targetHandle,
          })),
        },
      },
      include: {
        nodes: true,
        edges: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: workflow,
    });
  } catch (error) {
    console.error('Create workflow error:', error);

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
        error: { message: 'Failed to create workflow' },
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/workflows - List workflows
 */
export async function GET() {
  try {
    const workflows = await prisma.workflow.findMany({
      include: {
        _count: {
          select: {
            nodes: true,
            runs: true,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    return NextResponse.json({
      success: true,
      data: workflows,
    });
  } catch (error) {
    console.error('List workflows error:', error);
    return NextResponse.json(
      {
        success: false,
        error: { message: 'Failed to list workflows' },
      },
      { status: 500 }
    );
  }
}
