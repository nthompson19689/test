/**
 * Date utility functions
 */

/**
 * Format a date as relative time (e.g., "2 minutes", "1 hour")
 */
export function formatDistanceToNow(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) {
    return "just now";
  } else if (diffMin < 60) {
    return `${diffMin} minute${diffMin === 1 ? "" : "s"}`;
  } else if (diffHour < 24) {
    return `${diffHour} hour${diffHour === 1 ? "" : "s"}`;
  } else if (diffDay < 7) {
    return `${diffDay} day${diffDay === 1 ? "" : "s"}`;
  } else {
    return date.toLocaleDateString();
  }
}

/**
 * Format a duration in milliseconds
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  } else {
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
  }
}

/**
 * Format a date for display
 */
export function formatDate(date: Date): string {
  return date.toLocaleString();
}
