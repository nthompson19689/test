import { prisma } from "../../lib/db";
import { JobType, JobStatus } from "@prisma/client";
import { sleep, getBackoffDelay } from "../../lib/utils";
import { processTranscribe } from "./processors/transcribe";
import { processClip } from "./processors/clip";
import { processGenerateAssets } from "./processors/assets";
import { processEmbedTableRow } from "./processors/embed";

const WORKER_ID = process.env.WORKER_ID || `worker-${process.pid}`;
const POLL_INTERVAL = parseInt(process.env.WORKER_POLL_INTERVAL_MS || "5000");
const MAX_CONCURRENT_JOBS = 3;

let isShuttingDown = false;
let activeJobs = 0;

async function main() {
  console.log(`[Worker ${WORKER_ID}] Starting...`);

  // Handle graceful shutdown
  process.on("SIGTERM", handleShutdown);
  process.on("SIGINT", handleShutdown);

  // Main polling loop
  while (!isShuttingDown) {
    try {
      // Only poll if we have capacity
      if (activeJobs < MAX_CONCURRENT_JOBS) {
        await pollAndProcessJobs();
      }

      await sleep(POLL_INTERVAL);
    } catch (error) {
      console.error(`[Worker ${WORKER_ID}] Error in main loop:`, error);
      await sleep(POLL_INTERVAL * 2); // Back off on error
    }
  }

  console.log(`[Worker ${WORKER_ID}] Shutdown complete`);
}

async function pollAndProcessJobs() {
  const availableSlots = MAX_CONCURRENT_JOBS - activeJobs;

  if (availableSlots <= 0) {
    return;
  }

  // Acquire jobs transactionally
  const jobs = await acquireJobs(availableSlots);

  // Process each job concurrently
  for (const job of jobs) {
    processJobAsync(job.id, job.type).catch((error) => {
      console.error(`[Worker ${WORKER_ID}] Unhandled error processing job ${job.id}:`, error);
    });
  }
}

async function acquireJobs(limit: number) {
  return await prisma.$transaction(async (tx) => {
    // Find pending jobs
    const jobs = await tx.job.findMany({
      where: {
        status: JobStatus.PENDING,
        lockedAt: null,
      },
      orderBy: {
        createdAt: "asc",
      },
      take: limit,
    });

    // Lock them
    const lockedJobs = [];
    for (const job of jobs) {
      const updated = await tx.job.updateMany({
        where: {
          id: job.id,
          status: JobStatus.PENDING,
          lockedAt: null,
        },
        data: {
          status: JobStatus.PROCESSING,
          lockedAt: new Date(),
          lockedBy: WORKER_ID,
        },
      });

      if (updated.count > 0) {
        lockedJobs.push(job);
      }
    }

    return lockedJobs;
  });
}

async function processJobAsync(jobId: string, jobType: JobType) {
  activeJobs++;

  try {
    await processJob(jobId, jobType);
  } finally {
    activeJobs--;
  }
}

async function processJob(jobId: string, jobType: JobType) {
  console.log(`[Worker ${WORKER_ID}] Processing job ${jobId} (${jobType})`);

  try {
    let result: any;

    switch (jobType) {
      case JobType.TRANSCRIBE:
        result = await processTranscribe(jobId);
        break;
      case JobType.MAKE_CLIP:
        result = await processClip(jobId);
        break;
      case JobType.GENERATE_ASSETS:
        result = await processGenerateAssets(jobId);
        break;
      case JobType.EMBED_TABLE_ROW:
        result = await processEmbedTableRow(jobId);
        break;
      default:
        throw new Error(`Unknown job type: ${jobType}`);
    }

    // Mark as completed
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: JobStatus.COMPLETED,
        result,
        updatedAt: new Date(),
      },
    });

    console.log(`[Worker ${WORKER_ID}] Job ${jobId} completed`);
  } catch (error) {
    console.error(`[Worker ${WORKER_ID}] Job ${jobId} failed:`, error);

    // Get job and check retry
    const job = await prisma.job.findUnique({ where: { id: jobId } });

    if (!job) {
      return;
    }

    const attempts = job.attempts + 1;

    if (attempts < job.maxAttempts) {
      // Retry with backoff
      const backoffMs = getBackoffDelay(attempts);

      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: JobStatus.RETRYING,
          attempts,
          lockedAt: null,
          lockedBy: null,
          result: {
            error: error instanceof Error ? error.message : String(error),
            attempts,
            nextRetryAfter: new Date(Date.now() + backoffMs),
          },
        },
      });

      console.log(`[Worker ${WORKER_ID}] Job ${jobId} will retry (attempt ${attempts})`);

      // Wait before retrying
      await sleep(backoffMs);

      // Reset to pending
      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: JobStatus.PENDING,
        },
      });
    } else {
      // Max retries exceeded
      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: JobStatus.FAILED,
          attempts,
          result: {
            error: error instanceof Error ? error.message : String(error),
            attempts,
          },
        },
      });

      console.log(`[Worker ${WORKER_ID}] Job ${jobId} failed permanently after ${attempts} attempts`);
    }
  }
}

async function handleShutdown() {
  console.log(`[Worker ${WORKER_ID}] Shutting down gracefully...`);
  isShuttingDown = true;

  // Wait for active jobs to finish (with timeout)
  const timeout = 30000; // 30 seconds
  const start = Date.now();

  while (activeJobs > 0 && Date.now() - start < timeout) {
    console.log(`[Worker ${WORKER_ID}] Waiting for ${activeJobs} active jobs to finish...`);
    await sleep(1000);
  }

  if (activeJobs > 0) {
    console.log(`[Worker ${WORKER_ID}] Force exiting with ${activeJobs} active jobs`);
  }

  process.exit(0);
}

main().catch((error) => {
  console.error("[Worker] Fatal error:", error);
  process.exit(1);
});
