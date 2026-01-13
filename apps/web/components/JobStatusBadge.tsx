"use client";

import { useEffect, useState } from "react";
import { JobStatus, JobType } from "@prisma/client";

interface JobStatusBadgeProps {
  jobId?: string;
  initialStatus?: JobStatus;
  type: JobType;
  onComplete?: (result: any) => void;
}

export function JobStatusBadge({
  jobId,
  initialStatus,
  type,
  onComplete,
}: JobStatusBadgeProps) {
  const [status, setStatus] = useState<JobStatus | null>(initialStatus || null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;

    // Poll for job status every 3 seconds
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/jobs/${jobId}`);
        if (response.ok) {
          const job = await response.json();
          setStatus(job.status);

          if (job.status === "COMPLETED") {
            onComplete?.(job.result);
            clearInterval(interval);
          } else if (job.status === "FAILED") {
            setError(job.result?.error || "Job failed");
            clearInterval(interval);
          }
        }
      } catch (err) {
        console.error("Error polling job status:", err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [jobId, onComplete]);

  function getStatusColor(status: JobStatus | null): string {
    switch (status) {
      case "COMPLETED":
        return "bg-green-100 text-green-800";
      case "FAILED":
        return "bg-red-100 text-red-800";
      case "PROCESSING":
        return "bg-blue-100 text-blue-800";
      case "RETRYING":
        return "bg-yellow-100 text-yellow-800";
      case "PENDING":
      default:
        return "bg-gray-100 text-gray-800";
    }
  }

  function getJobTypeLabel(type: JobType): string {
    switch (type) {
      case "TRANSCRIBE":
        return "Transcribing";
      case "MAKE_CLIP":
        return "Generating clip";
      case "GENERATE_ASSETS":
        return "Generating assets";
      case "EMBED_TABLE_ROW":
        return "Embedding";
      case "ANALYZE_CHANNEL":
        return "Analyzing channel";
      default:
        return "Processing";
    }
  }

  function getStatusLabel(status: JobStatus | null): string {
    if (!status) return "Queued";
    switch (status) {
      case "COMPLETED":
        return "Complete";
      case "FAILED":
        return "Failed";
      case "PROCESSING":
        return "Processing";
      case "RETRYING":
        return "Retrying";
      case "PENDING":
        return "Queued";
      default:
        return status;
    }
  }

  const isActive = status === "PENDING" || status === "PROCESSING" || status === "RETRYING";

  return (
    <div className="inline-flex items-center gap-2">
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(
          status
        )}`}
      >
        {isActive && (
          <svg
            className="animate-spin h-3 w-3"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {getJobTypeLabel(type)} - {getStatusLabel(status)}
      </span>
      {error && (
        <span className="text-xs text-red-600" title={error}>
          ⚠️
        </span>
      )}
    </div>
  );
}
