/**
 * Workflow Individual Routes
 * GET /api/workflows/[id] - Get workflow details
 * PUT /api/workflows/[id] - Update workflow
 * DELETE /api/workflows/[id] - Delete workflow
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/db';

const UpdateWorkflowSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  nodes: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        nodeType: z.enum(['SCRAPE_URL', 'RESEARCH', 'ANALYZE', 'GENERATE_TEXT', 'GENERATE_IMAGE']),
        config: z.record(z.unknown()),
        positionX: z.number(),
        positionY: z.number(),
      })
    )
    .optional(),
  edges: z
    .array(
      z.object({
        id: z.string(),
        sourceNodeId: z.string(),
        targetNodeId: z.string(),
        sourceHandle: z.string().optional(),
        targetHandle: z.string().optional(),
      })
    )
    .optional(),
});

/**
 * GET /api/workflows/[id] - Get workflow details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    const workflow = await prisma.workflow.findUnique({
      where: { id },
      include: {
        nodes: true,
        edges: true,
      },
    });

    if (!workflow) {
      return NextResponse.json(
        {
          success: false,
          error: { message: 'Workflow not found' },
        },
        { status: 404 }
      );
    }

    // Parse node configs
    const workflowWithParsedConfigs = {
      ...workflow,
      nodes: workflow.nodes.map((node) => ({
        ...node,
        config: JSON.parse(node.config),
      })),
    };

    return NextResponse.json({
      success: true,
      data: workflowWithParsedConfigs,
    });
  } catch (error) {
    console.error('Get workflow error:', error);
    return NextResponse.json(
      {
        success: false,
        error: { message: 'Failed to get workflow' },
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/workflows/[id] - Update workflow
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const validated = UpdateWorkflowSchema.parse(body);

    // Check if workflow exists
    const existing = await prisma.workflow.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        {
          success: false,
          error: { message: 'Workflow not found' },
        },
        { status: 404 }
      );
    }

    // Update workflow with transaction
    const workflow = await prisma.$transaction(async (tx) => {
      // Update basic fields
      await tx.workflow.update({
        where: { id },
        data: {
          name: validated.name,
          description: validated.description,
          updatedAt: new Date(),
        },
      });

      // If nodes/edges provided, replace them
      if (validated.nodes) {
        // Delete existing nodes and edges
        await tx.workflowEdge.deleteMany({ where: { workflowId: id } });
        await tx.workflowNode.deleteMany({ where: { workflowId: id } });

        // Create new nodes
        await tx.workflowNode.createMany({
          data: validated.nodes.map((node) => ({
            id: node.id,
            workflowId: id,
            name: node.name,
            nodeType: node.nodeType,
            config: JSON.stringify(node.config),
            positionX: node.positionX,
            positionY: node.positionY,
          })),
        });
      }

      if (validated.edges) {
        // Delete existing edges if not already deleted
        if (!validated.nodes) {
          await tx.workflowEdge.deleteMany({ where: { workflowId: id } });
        }

        // Create new edges
        await tx.workflowEdge.createMany({
          data: validated.edges.map((edge) => ({
            id: edge.id,
            workflowId: id,
            sourceNodeId: edge.sourceNodeId,
            targetNodeId: edge.targetNodeId,
            sourceHandle: edge.sourceHandle,
            targetHandle: edge.targetHandle,
          })),
        });
      }

      // Return updated workflow
      return tx.workflow.findUnique({
        where: { id },
        include: {
          nodes: true,
          edges: true,
        },
      });
    });

    return NextResponse.json({
      success: true,
      data: workflow,
    });
  } catch (error) {
    console.error('Update workflow error:', error);

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
        error: { message: 'Failed to update workflow' },
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/workflows/[id] - Delete workflow
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    // Check if workflow exists
    const existing = await prisma.workflow.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        {
          success: false,
          error: { message: 'Workflow not found' },
        },
        { status: 404 }
      );
    }

    // Delete workflow (cascades to nodes, edges, runs)
    await prisma.workflow.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      data: { deleted: true },
    });
  } catch (error) {
    console.error('Delete workflow error:', error);
    return NextResponse.json(
      {
        success: false,
        error: { message: 'Failed to delete workflow' },
      },
      { status: 500 }
    );
  }
}
