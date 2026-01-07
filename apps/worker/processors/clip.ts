import { prisma } from "../../../lib/db";
import { generateClip } from "../../../lib/ffmpeg";
import { generateSRT } from "../../../lib/transcription";
import { uploadFile } from "../../../lib/storage";
import { ClipAspectRatio } from "@prisma/client";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

export interface ClipJobPayload {
  clipId: string;
  userId: string;
}

export async function processClip(jobId: string): Promise<any> {
  const job = await prisma.job.findUnique({ where: { id: jobId } });

  if (!job) {
    throw new Error("Job not found");
  }

  const payload = job.payload as ClipJobPayload;
  const { clipId, userId } = payload;

  // Get clip record
  const clip = await prisma.clip.findUnique({
    where: { id: clipId },
    include: {
      mediaFile: {
        include: {
          transcripts: true,
        },
      },
    },
  });

  if (!clip) {
    throw new Error(`Clip ${clipId} not found`);
  }

  const { mediaFile } = clip;
  const project = await prisma.project.findFirst({
    where: { mediaFiles: { some: { id: mediaFile.id } } },
  });

  if (!project) {
    throw new Error("Project not found");
  }

  // Generate SRT file if captions are requested
  let subtitlesPath: string | undefined;

  if (clip.withCaptions && mediaFile.transcripts.length > 0) {
    const transcript = mediaFile.transcripts[0];
    const srtContent = generateSRT(transcript.segments as any[]);

    subtitlesPath = join(tmpdir(), `subtitles-${Date.now()}.srt`);
    await writeFile(subtitlesPath, srtContent);
  }

  try {
    // Generate clip
    console.log(`[Clip] Generating clip ${clipId}`);
    const result = await generateClip(userId, project.id, {
      storageKey: mediaFile.storageKey,
      startSeconds: clip.startSeconds,
      endSeconds: clip.endSeconds,
      aspectRatio: clip.aspectRatio,
      withCaptions: clip.withCaptions,
      subtitlesPath,
    });

    // Update clip record
    await prisma.clip.update({
      where: { id: clipId },
      data: {
        storageKey: result.clipStorageKey,
        storageBucket: process.env.S3_BUCKET || "transcript-assets",
        subtitlesKey: result.subtitlesStorageKey,
      },
    });

    console.log(`[Clip] Clip ${clipId} generated successfully`);

    return {
      clipStorageKey: result.clipStorageKey,
      subtitlesStorageKey: result.subtitlesStorageKey,
    };
  } finally {
    // Clean up temp subtitles file
    if (subtitlesPath) {
      await unlink(subtitlesPath).catch(() => {});
    }
  }
}
