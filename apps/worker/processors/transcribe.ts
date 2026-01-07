import { prisma } from "../../../lib/db";
import { transcribeMedia } from "../../../lib/transcription";

export interface TranscribeJobPayload {
  mediaFileId: string;
  userId: string;
}

export async function processTranscribe(jobId: string): Promise<any> {
  const job = await prisma.job.findUnique({ where: { id: jobId } });

  if (!job) {
    throw new Error("Job not found");
  }

  const payload = job.payload as TranscribeJobPayload;
  const { mediaFileId, userId } = payload;

  // Get media file
  const mediaFile = await prisma.mediaFile.findUnique({
    where: { id: mediaFileId },
  });

  if (!mediaFile) {
    throw new Error(`Media file ${mediaFileId} not found`);
  }

  // Transcribe
  console.log(`[Transcribe] Transcribing media file ${mediaFileId}`);
  const result = await transcribeMedia(userId, mediaFile.storageKey);

  // Store transcript
  const transcript = await prisma.transcript.create({
    data: {
      mediaFileId,
      userId,
      segments: result.segments,
      fullText: result.fullText,
      language: result.language,
    },
  });

  console.log(`[Transcribe] Created transcript ${transcript.id}`);

  return {
    transcriptId: transcript.id,
    segmentCount: result.segments.length,
    language: result.language,
  };
}
