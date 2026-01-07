import OpenAI from "openai";
import { getUserApiKey } from "./crypto";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;

/**
 * Generates an embedding for the given text
 * Tries user's API key first, falls back to system key
 */
export async function generateEmbedding(
  text: string,
  userId?: string
): Promise<number[]> {
  let apiKey = process.env.OPENAI_API_KEY || "";

  // Try to use user's API key if provided
  if (userId) {
    const userKey = await getUserApiKey(userId, "openai");
    if (userKey) {
      apiKey = userKey;
    }
  }

  if (!apiKey) {
    throw new Error("No OpenAI API key available");
  }

  const openai = new OpenAI({ apiKey });

  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
    dimensions: EMBEDDING_DIMENSIONS,
  });

  return response.data[0].embedding;
}

/**
 * Flattens a table row into a text string suitable for embedding
 */
export function flattenTableRow(
  tableName: string,
  schema: any,
  rowData: any
): string {
  const parts = [`Table: ${tableName}`];

  const columns = schema.columns || [];
  for (const column of columns) {
    const value = rowData[column.name];
    if (value !== undefined && value !== null && value !== "") {
      parts.push(`${column.name}: ${String(value)}`);
    }
  }

  return parts.join("\n");
}

/**
 * Generates embedding for a table row
 */
export async function generateTableRowEmbedding(
  tableName: string,
  schema: any,
  rowData: any,
  userId: string
): Promise<{ textContent: string; embedding: number[] }> {
  const textContent = flattenTableRow(tableName, schema, rowData);
  const embedding = await generateEmbedding(textContent, userId);

  return { textContent, embedding };
}

export { EMBEDDING_DIMENSIONS };
