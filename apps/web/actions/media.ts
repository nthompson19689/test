"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "../lib/auth";
import { prisma } from "../../../lib/db";
import { getPresignedUploadUrl, generateStorageKey } from "../../../lib/storage";
import { isValidMediaType, getMediaTypeFromMime } from "../../../lib/utils";
import { JobType } from "@prisma/client";
import { revalidatePath } from "next/cache";

export async function getUploadUrl(projectId: string, fileName: string, mimeType: string) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  // Validate MIME type
  if (!isValidMediaType(mimeType)) {
    throw new Error("Invalid media type");
  }

  // Verify project ownership
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project || project.userId !== session.user.id) {
    throw new Error("Project not found or unauthorized");
  }

  // Generate storage key
  const storageKey = generateStorageKey(session.user.id, projectId, fileName);

  // Get presigned URL
  const { uploadUrl } = await getPresignedUploadUrl({
    key: storageKey,
    contentType: mimeType,
  });

  return {
    uploadUrl,
    storageKey,
  };
}

export async function createMediaFile(data: {
  projectId: string;
  name: string;
  storageKey: string;
  storageBucket: string;
  mimeType: string;
  fileSize: number;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const project = await prisma.project.findUnique({
    where: { id: data.projectId },
  });

  if (!project || project.userId !== session.user.id) {
    throw new Error("Unauthorized");
  }

  const mediaType = getMediaTypeFromMime(data.mimeType);

  const mediaFile = await prisma.mediaFile.create({
    data: {
      projectId: data.projectId,
      userId: session.user.id,
      name: data.name,
      storageKey: data.storageKey,
      storageBucket: data.storageBucket,
      mimeType: data.mimeType,
      fileSize: BigInt(data.fileSize),
      mediaType,
    },
  });

  // Create transcription job
  await prisma.job.create({
    data: {
      userId: session.user.id,
      type: JobType.TRANSCRIBE,
      payload: {
        mediaFileId: mediaFile.id,
        userId: session.user.id,
      },
    },
  });

  revalidatePath(`/projects/${data.projectId}`);

  return mediaFile;
}

export async function deleteMediaFile(id: string) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const mediaFile = await prisma.mediaFile.findUnique({
    where: { id },
  });

  if (!mediaFile || mediaFile.userId !== session.user.id) {
    throw new Error("Unauthorized");
  }

  await prisma.mediaFile.delete({
    where: { id },
  });

  revalidatePath(`/projects/${mediaFile.projectId}`);
}
