"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "../lib/auth";
import { prisma } from "../../../lib/db";
import { JobType } from "@prisma/client";
import { revalidatePath } from "next/cache";

export async function getTables() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return [];
  }

  return await prisma.table.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: {
          rows: true,
        },
      },
    },
  });
}

export async function getTable(id: string) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const table = await prisma.table.findUnique({
    where: { id },
    include: {
      rows: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!table || table.userId !== session.user.id) {
    throw new Error("Table not found or unauthorized");
  }

  return table;
}

export async function createTable(formData: FormData) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const name = formData.get("name") as string;
  const description = formData.get("description") as string;
  const schemaJson = formData.get("schema") as string;

  const schema = JSON.parse(schemaJson);

  const table = await prisma.table.create({
    data: {
      userId: session.user.id,
      name,
      description,
      schema,
    },
  });

  revalidatePath("/tables");

  return table;
}

export async function createTableRow(tableId: string, rowData: any) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const table = await prisma.table.findUnique({
    where: { id: tableId },
  });

  if (!table || table.userId !== session.user.id) {
    throw new Error("Unauthorized");
  }

  const row = await prisma.tableRow.create({
    data: {
      tableId,
      userId: session.user.id,
      data: rowData,
      textContent: "", // Will be set by embedding job
    },
  });

  // Create embedding job
  await prisma.job.create({
    data: {
      userId: session.user.id,
      type: JobType.EMBED_TABLE_ROW,
      payload: {
        tableRowId: row.id,
        userId: session.user.id,
      },
    },
  });

  revalidatePath(`/tables/${tableId}`);

  return row;
}

export async function updateTableRow(rowId: string, rowData: any) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const row = await prisma.tableRow.findUnique({
    where: { id: rowId },
  });

  if (!row || row.userId !== session.user.id) {
    throw new Error("Unauthorized");
  }

  const updated = await prisma.tableRow.update({
    where: { id: rowId },
    data: {
      data: rowData,
    },
  });

  // Re-embed
  await prisma.job.create({
    data: {
      userId: session.user.id,
      type: JobType.EMBED_TABLE_ROW,
      payload: {
        tableRowId: rowId,
        userId: session.user.id,
      },
    },
  });

  revalidatePath(`/tables/${row.tableId}`);

  return updated;
}

export async function deleteTableRow(rowId: string) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const row = await prisma.tableRow.findUnique({
    where: { id: rowId },
  });

  if (!row || row.userId !== session.user.id) {
    throw new Error("Unauthorized");
  }

  await prisma.tableRow.delete({
    where: { id: rowId },
  });

  revalidatePath(`/tables/${row.tableId}`);
}
