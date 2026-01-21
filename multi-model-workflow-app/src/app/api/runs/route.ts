/**
 * Runs API Routes
 * POST /api/runs - Start a new workflow run
 * GET /api/runs - List all runs
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/db';
import { runWorkflow } from '@/lib/workflow/runner';

const StartRunSchema = z.object({
  workflowId: z.string().min(1),
});

/**
 * POST /api/runs - Start a new workflow run
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = StartRunSchema.parse(body);

    // Check if workflow exists
    const workflow = await prisma.workflow.findUnique({
      where: { id: validated.workflowId },
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

    if (workflow.nodes.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: { message: 'Workflow has no nodes' },
        },
        { status: 400 }
      );
    }

    // Start the run asynchronously
    const runId = await runWorkflow(validated.workflowId);

    return NextResponse.json({
      success: true,
      data: { runId },
    });
  } catch (error) {
    console.error('Start run error:', error);

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
          message: error instanceof Error ? error.message : 'Failed to start run',
        },
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/runs - List all runs
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const workflowId = searchParams.get('workflowId');
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const runs = await prisma.run.findMany({
      where: workflowId ? { workflowId } : undefined,
      include: {
        workflow: {
          select: {
            name: true,
          },
        },
        _count: {
          select: {
            steps: true,
          },
        },
        steps: {
          select: {
            status: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });

    // Transform data for frontend
    const transformedRuns = runs.map((run) => ({
      id: run.id,
      workflowId: run.workflowId,
      workflowName: run.workflow.name,
      status: run.status,
      startedAt: run.startedAt?.toISOString() || null,
      completedAt: run.completedAt?.toISOString() || null,
      createdAt: run.createdAt.toISOString(),
      stepCount: run._count.steps,
      completedSteps: run.steps.filter(
        (s) => s.status === 'succeeded' || s.status === 'failed' || s.status === 'skipped'
      ).length,
    }));

    return NextResponse.json({
      success: true,
      data: transformedRuns,
    });
  } catch (error) {
    console.error('List runs error:', error);
    return NextResponse.json(
      {
        success: false,
        error: { message: 'Failed to list runs' },
      },
      { status: 500 }
    );
  }
}
