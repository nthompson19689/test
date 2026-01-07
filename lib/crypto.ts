import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-cbc";
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "";

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
  throw new Error("ENCRYPTION_KEY must be exactly 32 characters");
}

export interface EncryptedData {
  encryptedData: string;
  iv: string;
}

/**
 * Encrypts a string (e.g., API key) using AES-256-CBC
 */
export function encrypt(text: string): EncryptedData {
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  return {
    encryptedData: encrypted,
    iv: iv.toString("hex"),
  };
}

/**
 * Decrypts an encrypted string using AES-256-CBC
 */
export function decrypt(encryptedData: string, ivHex: string): string {
  const iv = Buffer.from(ivHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
  let decrypted = decipher.update(encryptedData, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/**
 * Retrieves and decrypts a user's API key for a given provider
 */
export async function getUserApiKey(
  userId: string,
  provider: string
): Promise<string | null> {
  const { prisma } = await import("./db");

  const secret = await prisma.userSecret.findUnique({
    where: {
      userId_provider: {
        userId,
        provider,
      },
    },
  });

  if (!secret) {
    return null;
  }

  return decrypt(secret.encryptedApiKey, secret.encryptionIv);
}

/**
 * Stores an encrypted API key for a user
 */
export async function setUserApiKey(
  userId: string,
  provider: string,
  apiKey: string
): Promise<void> {
  const { prisma } = await import("./db");
  const { encryptedData, iv } = encrypt(apiKey);

  await prisma.userSecret.upsert({
    where: {
      userId_provider: {
        userId,
        provider,
      },
    },
    create: {
      userId,
      provider,
      encryptedApiKey: encryptedData,
      encryptionIv: iv,
    },
    update: {
      encryptedApiKey: encryptedData,
      encryptionIv: iv,
    },
  });
}
