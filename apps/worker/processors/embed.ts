import { prisma } from "../../../lib/db";
import { generateTableRowEmbedding } from "../../../lib/embeddings";

export interface EmbedTableRowJobPayload {
  tableRowId: string;
  userId: string;
}

export async function processEmbedTableRow(jobId: string): Promise<any> {
  const job = await prisma.job.findUnique({ where: { id: jobId } });

  if (!job) {
    throw new Error("Job not found");
  }

  const payload = job.payload as EmbedTableRowJobPayload;
  const { tableRowId, userId } = payload;

  // Get table row
  const row = await prisma.tableRow.findUnique({
    where: { id: tableRowId },
    include: {
      table: true,
    },
  });

  if (!row) {
    throw new Error(`Table row ${tableRowId} not found`);
  }

  const { table } = row;

  // Generate embedding
  console.log(`[Embed] Generating embedding for row ${tableRowId} in table ${table.name}`);

  const { textContent, embedding } = await generateTableRowEmbedding(
    table.name,
    table.schema,
    row.data,
    userId
  );

  // Update row with embedding
  await prisma.$executeRaw`
    UPDATE table_rows
    SET text_content = ${textContent},
        embedding = ${`[${embedding.join(",")}]`}::vector
    WHERE id = ${tableRowId}
  `;

  console.log(`[Embed] Embedding generated for row ${tableRowId}`);

  return {
    tableRowId,
    textContentLength: textContent.length,
    embeddingDimensions: embedding.length,
  };
}
