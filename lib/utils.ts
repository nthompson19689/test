/**
 * Validates that a user owns a resource
 * Throws an error if ownership check fails
 */
export function ensureOwnership(resourceUserId: string, requestUserId: string): void {
  if (resourceUserId !== requestUserId) {
    throw new Error("Unauthorized: User does not own this resource");
  }
}

/**
 * Validates MIME type for media uploads
 */
export function isValidMediaType(mimeType: string): boolean {
  const validTypes = [
    "video/mp4",
    "video/quicktime",
    "video/x-msvideo",
    "video/webm",
    "audio/mpeg",
    "audio/wav",
    "audio/mp4",
    "audio/x-m4a",
    "audio/webm",
  ];

  return validTypes.includes(mimeType);
}

/**
 * Parses media type from MIME type
 */
export function getMediaTypeFromMime(mimeType: string): "AUDIO" | "VIDEO" {
  return mimeType.startsWith("video/") ? "VIDEO" : "AUDIO";
}

/**
 * Exponential backoff delay
 */
export function getBackoffDelay(attempt: number, baseDelayMs: number = 1000): number {
  return baseDelayMs * Math.pow(2, attempt);
}

/**
 * Sleep utility
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Formats file size for display
 */
export function formatFileSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Formats duration in seconds to readable string
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  return `${minutes}:${String(secs).padStart(2, "0")}`;
}
