"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "../lib/auth";
import { prisma } from "../../../lib/db";
import { revalidatePath } from "next/cache";

export async function createProject(formData: FormData) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const name = formData.get("name") as string;
  const description = formData.get("description") as string;

  const project = await prisma.project.create({
    data: {
      userId: session.user.id,
      name,
      description,
    },
  });

  revalidatePath("/projects");

  return project;
}

export async function getProjects() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return [];
  }

  return await prisma.project.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: {
          mediaFiles: true,
        },
      },
    },
  });
}

export async function getProject(id: string) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      mediaFiles: {
        include: {
          transcripts: true,
          clips: true,
        },
        orderBy: { uploadedAt: "desc" },
      },
    },
  });

  if (!project || project.userId !== session.user.id) {
    throw new Error("Project not found or unauthorized");
  }

  return project;
}

export async function deleteProject(id: string) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const project = await prisma.project.findUnique({
    where: { id },
  });

  if (!project || project.userId !== session.user.id) {
    throw new Error("Project not found or unauthorized");
  }

  await prisma.project.delete({
    where: { id },
  });

  revalidatePath("/projects");
}
