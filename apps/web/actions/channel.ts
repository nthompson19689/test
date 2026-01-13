"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "../lib/auth";
import { prisma } from "../../../lib/db";
import { JobType } from "@prisma/client";
import { revalidatePath } from "next/cache";

export async function analyzeChannel(data: { channelUrl: string; maxVideos?: number }) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  // Validate URL format
  const urlPattern = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/.+/;
  if (!urlPattern.test(data.channelUrl)) {
    throw new Error("Invalid YouTube URL. Please provide a valid YouTube channel URL.");
  }

  // Create channel analysis job
  const job = await prisma.job.create({
    data: {
      userId: session.user.id,
      type: JobType.ANALYZE_CHANNEL,
      payload: {
        channelUrl: data.channelUrl,
        userId: session.user.id,
        maxVideos: data.maxVideos || 50,
      },
    },
  });

  revalidatePath("/channel-analyzer");

  return job;
}

export async function getChannelAnalyses() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return [];
  }

  const analyses = await prisma.channelAnalysis.findMany({
    where: {
      userId: session.user.id,
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      channelId: true,
      channelUrl: true,
      channelTitle: true,
      thumbnailUrl: true,
      subscriberCount: true,
      videoCount: true,
      overallScore: true,
      createdAt: true,
    },
  });

  // Convert BigInt to number for JSON serialization
  return analyses.map((a) => ({
    ...a,
    subscriberCount: a.subscriberCount ? Number(a.subscriberCount) : null,
  }));
}

export async function getChannelAnalysis(id: string) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const analysis = await prisma.channelAnalysis.findUnique({
    where: { id },
  });

  if (!analysis || analysis.userId !== session.user.id) {
    throw new Error("Unauthorized");
  }

  // Convert BigInt to number for JSON serialization
  return {
    ...analysis,
    subscriberCount: analysis.subscriberCount ? Number(analysis.subscriberCount) : null,
    viewCount: analysis.viewCount ? Number(analysis.viewCount) : null,
  };
}

export async function deleteChannelAnalysis(id: string) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const analysis = await prisma.channelAnalysis.findUnique({
    where: { id },
  });

  if (!analysis || analysis.userId !== session.user.id) {
    throw new Error("Unauthorized");
  }

  await prisma.channelAnalysis.delete({
    where: { id },
  });

  revalidatePath("/channel-analyzer");
}
