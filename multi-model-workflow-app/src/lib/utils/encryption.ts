/**
 * Encryption utilities for API key storage
 * Uses libsodium for secure symmetric encryption
 */

import sodium from 'libsodium-wrappers';

let sodiumReady = false;

async function ensureSodium() {
  if (!sodiumReady) {
    await sodium.ready;
    sodiumReady = true;
  }
}

function getEncryptionKey(): Uint8Array {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex || keyHex.length !== 64) {
    throw new Error(
      'ENCRYPTION_KEY must be a 64-character hex string (32 bytes). ' +
      'Generate with: openssl rand -hex 32'
    );
  }
  return sodium.from_hex(keyHex);
}

/**
 * Encrypt a plaintext string
 * Returns base64-encoded ciphertext with nonce prepended
 */
export async function encrypt(plaintext: string): Promise<string> {
  await ensureSodium();

  const key = getEncryptionKey();
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const plaintextBytes = sodium.from_string(plaintext);

  const ciphertext = sodium.crypto_secretbox_easy(plaintextBytes, nonce, key);

  // Combine nonce + ciphertext
  const combined = new Uint8Array(nonce.length + ciphertext.length);
  combined.set(nonce);
  combined.set(ciphertext, nonce.length);

  return sodium.to_base64(combined, sodium.base64_variants.ORIGINAL);
}

/**
 * Decrypt a base64-encoded ciphertext
 * Expects nonce prepended to ciphertext
 */
export async function decrypt(encryptedBase64: string): Promise<string> {
  await ensureSodium();

  const key = getEncryptionKey();
  const combined = sodium.from_base64(encryptedBase64, sodium.base64_variants.ORIGINAL);

  const nonce = combined.slice(0, sodium.crypto_secretbox_NONCEBYTES);
  const ciphertext = combined.slice(sodium.crypto_secretbox_NONCEBYTES);

  const plaintext = sodium.crypto_secretbox_open_easy(ciphertext, nonce, key);

  return sodium.to_string(plaintext);
}

/**
 * Get masked version of a key (last 4 characters)
 */
export function maskKey(key: string): string {
  if (key.length <= 4) {
    return '****';
  }
  return '****' + key.slice(-4);
}

/**
 * Get just the last 4 characters of a key
 */
export function getKeyLastFour(key: string): string {
  if (key.length <= 4) {
    return key;
  }
  return key.slice(-4);
}
