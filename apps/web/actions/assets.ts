"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "../lib/auth";
import { prisma } from "../../../lib/db";
import { JobType } from "@prisma/client";
import { revalidatePath } from "next/cache";

export async function generateAssets(data: {
  transcriptId: string;
  name?: string;
  startSeconds?: number;
  endSeconds?: number;
  tableIds?: string[];
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const transcript = await prisma.transcript.findUnique({
    where: { id: data.transcriptId },
    include: {
      mediaFile: true,
    },
  });

  if (!transcript || transcript.userId !== session.user.id) {
    throw new Error("Unauthorized");
  }

  // Create asset generation job
  const job = await prisma.job.create({
    data: {
      userId: session.user.id,
      type: JobType.GENERATE_ASSETS,
      payload: {
        transcriptId: data.transcriptId,
        userId: session.user.id,
        name: data.name,
        startSeconds: data.startSeconds,
        endSeconds: data.endSeconds,
        tableIds: data.tableIds,
      },
    },
  });

  revalidatePath(`/projects/${transcript.mediaFile.projectId}`);

  return job;
}

export async function getGeneratedAssets(transcriptId: string) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return [];
  }

  return await prisma.generatedAsset.findMany({
    where: {
      transcriptId,
      userId: session.user.id,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getGeneratedAsset(id: string) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const asset = await prisma.generatedAsset.findUnique({
    where: { id },
    include: {
      transcript: {
        include: {
          mediaFile: true,
        },
      },
    },
  });

  if (!asset || asset.userId !== session.user.id) {
    throw new Error("Unauthorized");
  }

  return asset;
}

export async function deleteGeneratedAsset(id: string) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const asset = await prisma.generatedAsset.findUnique({
    where: { id },
    include: {
      transcript: {
        include: {
          mediaFile: true,
        },
      },
    },
  });

  if (!asset || asset.userId !== session.user.id) {
    throw new Error("Unauthorized");
  }

  await prisma.generatedAsset.delete({
    where: { id },
  });

  revalidatePath(`/projects/${asset.transcript.mediaFile.projectId}`);
}
