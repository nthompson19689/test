"use client";

import Link from "next/link";
import { useState } from "react";
import { deleteChannelAnalysis } from "../actions/channel";
import { useRouter } from "next/navigation";

interface ChannelAnalysisListItem {
  id: string;
  channelId: string;
  channelUrl: string;
  channelTitle: string;
  thumbnailUrl?: string;
  subscriberCount?: number;
  videoCount?: number;
  overallScore: number;
  createdAt: string;
}

interface ChannelAnalysisListProps {
  analyses: ChannelAnalysisListItem[];
}

function formatNumber(num: number | undefined | null): string {
  if (num === undefined || num === null) return "N/A";
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "K";
  return num.toString();
}

function getScoreColor(score: number): string {
  if (score >= 80) return "text-green-600 bg-green-100";
  if (score >= 60) return "text-yellow-600 bg-yellow-100";
  if (score >= 40) return "text-orange-600 bg-orange-100";
  return "text-red-600 bg-red-100";
}

export function ChannelAnalysisList({ analyses }: ChannelAnalysisListProps) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (!confirm("Are you sure you want to delete this analysis?")) {
      return;
    }

    setDeletingId(id);
    try {
      await deleteChannelAnalysis(id);
      router.refresh();
    } catch (err) {
      console.error("Failed to delete analysis:", err);
    } finally {
      setDeletingId(null);
    }
  }

  if (analyses.length === 0) {
    return (
      <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
        <svg
          className="mx-auto h-12 w-12 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
          />
        </svg>
        <h3 className="mt-4 text-lg font-medium text-gray-900">
          No analyses yet
        </h3>
        <p className="mt-2 text-sm text-gray-500">
          Enter a YouTube channel URL above to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Previous Analyses</h2>
      <div className="grid gap-4">
        {analyses.map((analysis) => (
          <Link
            key={analysis.id}
            href={`/channel-analyzer/${analysis.id}`}
            className="block bg-white rounded-xl shadow-sm border p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center gap-4">
              {analysis.thumbnailUrl ? (
                <img
                  src={analysis.thumbnailUrl}
                  alt={analysis.channelTitle}
                  className="w-16 h-16 rounded-full object-cover"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center">
                  <svg
                    className="w-8 h-8 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-gray-900 truncate">
                  {analysis.channelTitle}
                </h3>
                <div className="flex gap-4 text-sm text-gray-500 mt-1">
                  <span>{formatNumber(analysis.subscriberCount)} subscribers</span>
                  <span>{analysis.videoCount} videos</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Analyzed {new Date(analysis.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div
                  className={`w-14 h-14 rounded-full flex items-center justify-center ${getScoreColor(
                    analysis.overallScore
                  )}`}
                >
                  <span className="text-lg font-bold">
                    {analysis.overallScore}
                  </span>
                </div>
                <button
                  onClick={(e) => handleDelete(analysis.id, e)}
                  disabled={deletingId === analysis.id}
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                  title="Delete analysis"
                >
                  {deletingId === analysis.id ? (
                    <svg
                      className="animate-spin h-5 w-5"
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
                  ) : (
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
