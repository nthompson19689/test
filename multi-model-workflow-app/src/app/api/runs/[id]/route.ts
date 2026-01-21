/**
 * Run Individual Routes
 * GET /api/runs/[id] - Get run details with steps and artifacts
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

/**
 * GET /api/runs/[id] - Get run details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    const run = await prisma.run.findUnique({
      where: { id },
      include: {
        workflow: {
          select: {
            name: true,
          },
        },
        steps: {
          include: {
            node: {
              select: {
                name: true,
                nodeType: true,
              },
            },
            artifacts: true,
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    if (!run) {
      return NextResponse.json(
        {
          success: false,
          error: { message: 'Run not found' },
        },
        { status: 404 }
      );
    }

    // Parse error JSON and redact for client
    let parsedError = null;
    if (run.error) {
      try {
        const errorObj = JSON.parse(run.error);
        parsedError = errorObj.message || 'Unknown error';
      } catch {
        parsedError = run.error;
      }
    }

    // Transform for frontend
    const transformedRun = {
      id: run.id,
      workflowId: run.workflowId,
      workflowName: run.workflow.name,
      status: run.status,
      startedAt: run.startedAt?.toISOString() || null,
      completedAt: run.completedAt?.toISOString() || null,
      createdAt: run.createdAt.toISOString(),
      error: parsedError,
      steps: run.steps.map((step) => {
        // Parse step error
        let stepError = null;
        if (step.error) {
          try {
            const errorObj = JSON.parse(step.error);
            stepError = errorObj.message || 'Unknown error';
          } catch {
            stepError = step.error;
          }
        }

        return {
          id: step.id,
          nodeId: step.nodeId,
          nodeName: step.node.name,
          nodeType: step.node.nodeType,
          status: step.status,
          startedAt: step.startedAt?.toISOString() || null,
          completedAt: step.completedAt?.toISOString() || null,
          durationMs: step.durationMs,
          tokensInput: step.tokensInput,
          tokensOutput: step.tokensOutput,
          error: stepError,
          artifacts: step.artifacts.map((a) => ({
            id: a.id,
            name: a.name,
            type: a.type,
            content: a.content,
            size: a.size,
          })),
        };
      }),
    };

    return NextResponse.json({
      success: true,
      data: transformedRun,
    });
  } catch (error) {
    console.error('Get run error:', error);
    return NextResponse.json(
      {
        success: false,
        error: { message: 'Failed to get run details' },
      },
      { status: 500 }
    );
  }
}
