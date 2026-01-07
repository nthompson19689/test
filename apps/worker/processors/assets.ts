import { prisma } from "../../../lib/db";
import { generateAssets } from "../../../lib/llm";
import { retrieveContextForGeneration } from "../../../lib/retrieval";
import { extractTranscriptRange } from "../../../lib/transcription";

export interface GenerateAssetsJobPayload {
  transcriptId: string;
  userId: string;
  name?: string;
  startSeconds?: number;
  endSeconds?: number;
  tableIds?: string[];
}

export async function processGenerateAssets(jobId: string): Promise<any> {
  const job = await prisma.job.findUnique({ where: { id: jobId } });

  if (!job) {
    throw new Error("Job not found");
  }

  const payload = job.payload as GenerateAssetsJobPayload;
  const { transcriptId, userId, name, startSeconds, endSeconds, tableIds } = payload;

  // Get transcript
  const transcript = await prisma.transcript.findUnique({
    where: { id: transcriptId },
  });

  if (!transcript) {
    throw new Error(`Transcript ${transcriptId} not found`);
  }

  // Determine input text
  let inputText: string;

  if (startSeconds !== undefined && endSeconds !== undefined) {
    inputText = extractTranscriptRange(
      transcript.segments as any[],
      startSeconds,
      endSeconds
    );
  } else {
    inputText = transcript.fullText;
  }

  // Retrieve context from tables
  console.log(`[Assets] Retrieving context for user ${userId}`);

  // Get user's tables (or specific ones if provided)
  let userTables = await prisma.table.findMany({
    where: {
      userId,
      ...(tableIds && tableIds.length > 0 ? { id: { in: tableIds } } : {}),
    },
  });

  // Categorize tables by name/type
  const brandVoiceTableIds = userTables
    .filter((t) => t.name.toLowerCase().includes("brand") || t.name.toLowerCase().includes("voice"))
    .map((t) => t.id);

  const proofTableIds = userTables
    .filter((t) => t.name.toLowerCase().includes("proof") || t.name.toLowerCase().includes("claim"))
    .map((t) => t.id);

  const icpTableIds = userTables
    .filter(
      (t) =>
        t.name.toLowerCase().includes("icp") ||
        t.name.toLowerCase().includes("audience") ||
        t.name.toLowerCase().includes("persona")
    )
    .map((t) => t.id);

  const context = await retrieveContextForGeneration(userId, inputText, {
    brandVoiceTableIds,
    proofTableIds,
    icpTableIds,
  });

  // Generate assets
  console.log(`[Assets] Generating assets for transcript ${transcriptId}`);
  const output = await generateAssets(userId, {
    transcriptText: inputText,
    retrievedContext: context,
  });

  // Store generated assets
  const asset = await prisma.generatedAsset.create({
    data: {
      transcriptId,
      userId,
      name: name || `Assets ${new Date().toISOString()}`,
      inputText,
      retrievedContext: {
        brandVoice: context.brandVoice,
        proof: context.proof,
        icp: context.icp,
      },
      outputJson: output,
    },
  });

  console.log(`[Assets] Generated asset ${asset.id}`);

  return {
    assetId: asset.id,
    outputs: {
      linkedinPostCount: output.linkedin_posts.length,
      blogOutlineLength: output.blog_outline.length,
      newsletterLength: output.newsletter.length,
      hooksCount: output.hooks.length,
    },
  };
}
