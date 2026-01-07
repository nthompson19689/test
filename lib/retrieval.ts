import { prisma } from "./db";
import { generateEmbedding } from "./embeddings";

export interface RetrievalResult {
  id: string;
  tableId: string;
  tableName: string;
  data: any;
  textContent: string;
  similarity: number;
}

/**
 * Searches table rows using semantic similarity
 * Uses cosine similarity via pgvector
 */
export async function searchTableRows(
  userId: string,
  query: string,
  options: {
    tableIds?: string[];
    topK?: number;
    minSimilarity?: number;
  } = {}
): Promise<RetrievalResult[]> {
  const { tableIds, topK = 6, minSimilarity = 0.0 } = options;

  // Generate embedding for the query
  const queryEmbedding = await generateEmbedding(query, userId);

  // Build the WHERE clause
  let whereClause = `user_id = $1`;
  const params: any[] = [userId];
  let paramIndex = 2;

  if (tableIds && tableIds.length > 0) {
    whereClause += ` AND table_id = ANY($${paramIndex})`;
    params.push(tableIds);
    paramIndex++;
  }

  // Query using pgvector's cosine similarity operator (<=>)
  // Lower distance = higher similarity
  const queryText = `
    SELECT
      tr.id,
      tr.table_id,
      t.name as table_name,
      tr.data,
      tr.text_content,
      1 - (tr.embedding <=> $${paramIndex}::vector) as similarity
    FROM table_rows tr
    JOIN tables t ON t.id = tr.table_id
    WHERE ${whereClause}
      AND tr.embedding IS NOT NULL
    ORDER BY tr.embedding <=> $${paramIndex}::vector
    LIMIT $${paramIndex + 1}
  `;

  params.push(`[${queryEmbedding.join(",")}]`);
  params.push(topK);

  const results = await prisma.$queryRawUnsafe<any[]>(queryText, ...params);

  // Filter by minimum similarity and format results
  return results
    .filter((row) => row.similarity >= minSimilarity)
    .map((row) => ({
      id: row.id,
      tableId: row.table_id,
      tableName: row.table_name,
      data: row.data,
      textContent: row.text_content,
      similarity: Number(row.similarity),
    }));
}

/**
 * Retrieves context from tables for asset generation
 * Categorizes results by table type/name
 */
export async function retrieveContextForGeneration(
  userId: string,
  query: string,
  options: {
    brandVoiceTableIds?: string[];
    proofTableIds?: string[];
    icpTableIds?: string[];
    topKPerCategory?: number;
  } = {}
): Promise<{
  brandVoice: RetrievalResult[];
  proof: RetrievalResult[];
  icp: RetrievalResult[];
  other: RetrievalResult[];
}> {
  const { brandVoiceTableIds, proofTableIds, icpTableIds, topKPerCategory = 3 } = options;

  const [brandVoice, proof, icp] = await Promise.all([
    brandVoiceTableIds
      ? searchTableRows(userId, query, { tableIds: brandVoiceTableIds, topK: topKPerCategory })
      : [],
    proofTableIds
      ? searchTableRows(userId, query, { tableIds: proofTableIds, topK: topKPerCategory })
      : [],
    icpTableIds
      ? searchTableRows(userId, query, { tableIds: icpTableIds, topK: topKPerCategory })
      : [],
  ]);

  return {
    brandVoice,
    proof,
    icp,
    other: [],
  };
}
