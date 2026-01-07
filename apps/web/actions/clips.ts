"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "../lib/auth";
import { prisma } from "../../../lib/db";
import { ClipAspectRatio, JobType } from "@prisma/client";
import { revalidatePath } from "next/cache";

export async function createClip(data: {
  mediaFileId: string;
  name: string;
  startSeconds: number;
  endSeconds: number;
  aspectRatio: ClipAspectRatio;
  withCaptions: boolean;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const mediaFile = await prisma.mediaFile.findUnique({
    where: { id: data.mediaFileId },
  });

  if (!mediaFile || mediaFile.userId !== session.user.id) {
    throw new Error("Unauthorized");
  }

  const clip = await prisma.clip.create({
    data: {
      mediaFileId: data.mediaFileId,
      userId: session.user.id,
      name: data.name,
      startSeconds: data.startSeconds,
      endSeconds: data.endSeconds,
      aspectRatio: data.aspectRatio,
      withCaptions: data.withCaptions,
    },
  });

  // Create clip generation job
  await prisma.job.create({
    data: {
      userId: session.user.id,
      type: JobType.MAKE_CLIP,
      payload: {
        clipId: clip.id,
        userId: session.user.id,
      },
    },
  });

  revalidatePath(`/projects/${mediaFile.projectId}`);

  return clip;
}

export async function getClip(id: string) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const clip = await prisma.clip.findUnique({
    where: { id },
    include: {
      mediaFile: true,
    },
  });

  if (!clip || clip.userId !== session.user.id) {
    throw new Error("Unauthorized");
  }

  return clip;
}

export async function deleteClip(id: string) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const clip = await prisma.clip.findUnique({
    where: { id },
    include: {
      mediaFile: true,
    },
  });

  if (!clip || clip.userId !== session.user.id) {
    throw new Error("Unauthorized");
  }

  await prisma.clip.delete({
    where: { id },
  });

  revalidatePath(`/projects/${clip.mediaFile.projectId}`);
}
