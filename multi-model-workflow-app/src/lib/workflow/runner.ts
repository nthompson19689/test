/**
 * Workflow Runner
 * Handles workflow execution with topological sort and progress streaming
 */

import type {
  NodeType,
  NodeOutput,
  RunContext,
  RunEvent,
  RunStatus,
  StepStatus,
} from '@/types';
import { executeNode, ExecutionContext } from './nodes';
import { ResolveContext } from './variable-reference';
import prisma from '@/lib/db';
import { decrypt } from '@/lib/utils/encryption';

/**
 * Node data for execution
 */
interface ExecutableNode {
  id: string;
  name: string;
  nodeType: NodeType;
  config: Record<string, unknown>;
}

/**
 * Edge data for graph building
 */
interface ExecutableEdge {
  sourceNodeId: string;
  targetNodeId: string;
}

/**
 * Event emitter type for SSE
 */
export type RunEventEmitter = (event: RunEvent) => void;

/**
 * Workflow runner options
 */
export interface RunnerOptions {
  onEvent?: RunEventEmitter;
}

/**
 * Topologically sort nodes based on edges
 * Uses Kahn's algorithm
 */
export function topologicalSort(
  nodes: ExecutableNode[],
  edges: ExecutableEdge[]
): ExecutableNode[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const inDegree = new Map<string, number>();
  const adjacencyList = new Map<string, string[]>();

  // Initialize
  for (const node of nodes) {
    inDegree.set(node.id, 0);
    adjacencyList.set(node.id, []);
  }

  // Build adjacency list and count in-degrees
  for (const edge of edges) {
    adjacencyList.get(edge.sourceNodeId)?.push(edge.targetNodeId);
    inDegree.set(edge.targetNodeId, (inDegree.get(edge.targetNodeId) || 0) + 1);
  }

  // Find all nodes with no incoming edges
  const queue: string[] = [];
  for (const [nodeId, degree] of inDegree) {
    if (degree === 0) {
      queue.push(nodeId);
    }
  }

  // Process nodes
  const sorted: ExecutableNode[] = [];
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    const node = nodeMap.get(nodeId);
    if (node) {
      sorted.push(node);
    }

    // Reduce in-degree for neighbors
    for (const neighbor of adjacencyList.get(nodeId) || []) {
      const newDegree = (inDegree.get(neighbor) || 0) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  // Check for cycles
  if (sorted.length !== nodes.length) {
    throw new Error('Workflow contains a cycle and cannot be executed');
  }

  return sorted;
}

/**
 * Create run steps in the database
 */
async function createRunSteps(
  runId: string,
  sortedNodes: ExecutableNode[]
): Promise<Map<string, string>> {
  const stepIdMap = new Map<string, string>();

  for (const node of sortedNodes) {
    const step = await prisma.runStep.create({
      data: {
        runId,
        nodeId: node.id,
        status: 'queued',
      },
    });
    stepIdMap.set(node.id, step.id);
  }

  return stepIdMap;
}

/**
 * Update run step status
 */
async function updateStepStatus(
  stepId: string,
  status: StepStatus,
  data?: {
    inputs?: string;
    outputs?: string;
    error?: string;
    tokensInput?: number;
    tokensOutput?: number;
    durationMs?: number;
  }
) {
  const updateData: Record<string, unknown> = { status };

  if (status === 'running') {
    updateData.startedAt = new Date();
  } else if (['succeeded', 'failed', 'skipped'].includes(status)) {
    updateData.completedAt = new Date();
  }

  if (data) {
    Object.assign(updateData, data);
  }

  await prisma.runStep.update({
    where: { id: stepId },
    data: updateData,
  });
}

/**
 * Create artifacts for step outputs
 */
async function createArtifacts(
  stepId: string,
  output: NodeOutput
): Promise<void> {
  const artifacts: Array<{
    runStepId: string;
    name: string;
    type: string;
    content: string;
    size: number;
  }> = [];

  for (const [name, value] of Object.entries(output)) {
    if (value === undefined || value === null) continue;

    let type: string;
    let content: string;

    if (typeof value === 'string') {
      // Detect type
      if (value.startsWith('http://') || value.startsWith('https://')) {
        type = name.includes('image') ? 'image' : 'url';
      } else if (value.startsWith('data:image/') || value.startsWith('/9j/')) {
        type = 'image';
      } else if (value.startsWith('<') && value.includes('html')) {
        type = 'html';
      } else {
        type = 'text';
      }
      content = value;
    } else {
      type = 'json';
      content = JSON.stringify(value, null, 2);
    }

    artifacts.push({
      runStepId: stepId,
      name,
      type,
      content,
      size: content.length,
    });
  }

  if (artifacts.length > 0) {
    await prisma.artifact.createMany({ data: artifacts });
  }
}

/**
 * Main workflow runner
 */
export async function runWorkflow(
  workflowId: string,
  options: RunnerOptions = {}
): Promise<string> {
  const { onEvent } = options;

  // Emit helper
  const emit = (event: Omit<RunEvent, 'timestamp'>) => {
    onEvent?.({ ...event, timestamp: new Date().toISOString() } as RunEvent);
  };

  // Load workflow with nodes and edges
  const workflow = await prisma.workflow.findUnique({
    where: { id: workflowId },
    include: {
      nodes: true,
      edges: true,
    },
  });

  if (!workflow) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }

  // Create run record
  const run = await prisma.run.create({
    data: {
      workflowId,
      userId: workflow.userId,
      status: 'pending',
    },
  });

  try {
    // Update run to running
    await prisma.run.update({
      where: { id: run.id },
      data: { status: 'running', startedAt: new Date() },
    });

    emit({ type: 'run_started', runId: run.id, status: 'running' });

    // Convert nodes to executable format
    const executableNodes: ExecutableNode[] = workflow.nodes.map((node) => ({
      id: node.id,
      name: node.name,
      nodeType: node.nodeType as NodeType,
      config: JSON.parse(node.config),
    }));

    const executableEdges: ExecutableEdge[] = workflow.edges.map((edge) => ({
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: edge.targetNodeId,
    }));

    // Topologically sort nodes
    const sortedNodes = topologicalSort(executableNodes, executableEdges);

    // Create run steps
    const stepIdMap = await createRunSteps(run.id, sortedNodes);

    // Collect unique API key IDs from all node configs
    const apiKeyIds = new Set<string>();
    for (const node of sortedNodes) {
      if (node.config.apiKeyId) {
        apiKeyIds.add(node.config.apiKeyId as string);
      }
    }

    // Load and decrypt API keys
    const apiKeys: Record<string, string> = {};
    for (const keyId of apiKeyIds) {
      const apiKey = await prisma.apiKey.findUnique({
        where: { id: keyId },
      });
      if (apiKey) {
        apiKeys[keyId] = await decrypt(apiKey.encryptedKey);
      }
    }

    // Build run context
    const runContext: RunContext = {
      runId: run.id,
      workflowId,
      outputs: {},
      apiKeys,
    };

    // Build node ID to name mapping
    const nodeIdToName: Record<string, string> = {};
    for (const node of sortedNodes) {
      nodeIdToName[node.id] = node.name;
    }

    // Execute each node in order
    for (const node of sortedNodes) {
      const stepId = stepIdMap.get(node.id)!;
      const startTime = Date.now();

      // Update step to running
      await updateStepStatus(stepId, 'running');
      emit({
        type: 'step_started',
        runId: run.id,
        stepId,
        nodeId: node.id,
        status: 'running',
      });

      try {
        // Build resolve context with current outputs
        const resolveContext: ResolveContext = {
          outputs: { ...runContext.outputs },
          nodeIdToName,
        };

        // Add outputs by name as well
        for (const [nodeId, output] of Object.entries(runContext.outputs)) {
          const nodeName = nodeIdToName[nodeId];
          if (nodeName) {
            resolveContext.outputs[nodeName] = output;
          }
        }

        // Build execution context
        const executionContext: ExecutionContext = {
          runContext,
          resolveContext,
          onProgress: (message) => {
            emit({
              type: 'step_progress',
              runId: run.id,
              stepId,
              nodeId: node.id,
              output: message,
            });
          },
        };

        // Execute the node
        const output = await executeNode(
          node.nodeType,
          node.config,
          executionContext
        );

        // Store output in context
        runContext.outputs[node.id] = output;

        // Calculate duration
        const durationMs = Date.now() - startTime;

        // Update step to succeeded
        await updateStepStatus(stepId, 'succeeded', {
          inputs: JSON.stringify(node.config),
          outputs: JSON.stringify(output),
          durationMs,
        });

        // Create artifacts
        await createArtifacts(stepId, output);

        emit({
          type: 'step_completed',
          runId: run.id,
          stepId,
          nodeId: node.id,
          status: 'succeeded',
          output,
        });
      } catch (error) {
        const durationMs = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorObj = {
          message: errorMessage,
          stack: error instanceof Error ? error.stack : undefined,
        };

        // Update step to failed
        await updateStepStatus(stepId, 'failed', {
          inputs: JSON.stringify(node.config),
          error: JSON.stringify(errorObj),
          durationMs,
        });

        emit({
          type: 'step_failed',
          runId: run.id,
          stepId,
          nodeId: node.id,
          status: 'failed',
          error: errorMessage,
        });

        // Mark remaining steps as skipped
        for (const remainingNode of sortedNodes) {
          const remainingStepId = stepIdMap.get(remainingNode.id);
          if (remainingStepId) {
            const step = await prisma.runStep.findUnique({
              where: { id: remainingStepId },
            });
            if (step?.status === 'queued') {
              await updateStepStatus(remainingStepId, 'skipped');
            }
          }
        }

        // Update run to failed
        await prisma.run.update({
          where: { id: run.id },
          data: {
            status: 'failed',
            completedAt: new Date(),
            error: JSON.stringify(errorObj),
          },
        });

        emit({
          type: 'run_failed',
          runId: run.id,
          status: 'failed',
          error: errorMessage,
        });

        return run.id;
      }
    }

    // All steps completed successfully
    await prisma.run.update({
      where: { id: run.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
      },
    });

    emit({
      type: 'run_completed',
      runId: run.id,
      status: 'completed',
    });

    return run.id;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    await prisma.run.update({
      where: { id: run.id },
      data: {
        status: 'failed',
        completedAt: new Date(),
        error: JSON.stringify({ message: errorMessage }),
      },
    });

    emit({
      type: 'run_failed',
      runId: run.id,
      status: 'failed',
      error: errorMessage,
    });

    return run.id;
  }
}

/**
 * Simple in-process job queue
 * TODO: Replace with BullMQ/Redis for production
 */
interface QueuedJob {
  id: string;
  workflowId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  runId?: string;
}

class JobQueue {
  private queue: QueuedJob[] = [];
  private processing = false;

  enqueue(workflowId: string, onEvent?: RunEventEmitter): string {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.queue.push({
      id: jobId,
      workflowId,
      status: 'queued',
    });

    // Start processing if not already
    if (!this.processing) {
      this.processQueue(onEvent);
    }

    return jobId;
  }

  private async processQueue(onEvent?: RunEventEmitter): Promise<void> {
    this.processing = true;

    while (this.queue.length > 0) {
      const job = this.queue.find((j) => j.status === 'queued');
      if (!job) break;

      job.status = 'running';

      try {
        const runId = await runWorkflow(job.workflowId, { onEvent });
        job.runId = runId;
        job.status = 'completed';
      } catch (error) {
        job.status = 'failed';
        console.error(`Job ${job.id} failed:`, error);
      }
    }

    this.processing = false;
  }

  getJob(jobId: string): QueuedJob | undefined {
    return this.queue.find((j) => j.id === jobId);
  }
}

export const jobQueue = new JobQueue();

/**
 * Index file for workflow module
 */
export { topologicalSort as sortNodes };
