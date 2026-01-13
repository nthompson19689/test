"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { analyzeChannel } from "../actions/channel";
import { JobStatusBadge } from "./JobStatusBadge";

export function ChannelAnalyzerForm() {
  const router = useRouter();
  const [channelUrl, setChannelUrl] = useState("");
  const [maxVideos, setMaxVideos] = useState(50);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    setJobId(null);

    try {
      const job = await analyzeChannel({
        channelUrl: channelUrl.trim(),
        maxVideos,
      });
      setJobId(job.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start analysis");
      setIsLoading(false);
    }
  }

  function handleJobComplete(result: { analysisId: string }) {
    setIsLoading(false);
    router.push(`/channel-analyzer/${result.analysisId}`);
  }

  return (
    <div className="max-w-2xl mx-auto">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label
            htmlFor="channelUrl"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            YouTube Channel URL
          </label>
          <input
            type="url"
            id="channelUrl"
            value={channelUrl}
            onChange={(e) => setChannelUrl(e.target.value)}
            placeholder="https://youtube.com/@channelname"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
            disabled={isLoading}
          />
          <p className="mt-2 text-sm text-gray-500">
            Supported formats: youtube.com/@handle, youtube.com/channel/UC...,
            youtube.com/c/CustomName, youtube.com/user/Username
          </p>
        </div>

        <div>
          <label
            htmlFor="maxVideos"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Maximum Videos to Analyze
          </label>
          <select
            id="maxVideos"
            value={maxVideos}
            onChange={(e) => setMaxVideos(parseInt(e.target.value))}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isLoading}
          >
            <option value={10}>10 videos (faster)</option>
            <option value={25}>25 videos</option>
            <option value={50}>50 videos (recommended)</option>
            <option value={100}>100 videos (thorough)</option>
          </select>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {jobId && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm text-blue-700">
                Analysis in progress...
              </span>
              <JobStatusBadge
                jobId={jobId}
                type="ANALYZE_CHANNEL"
                onComplete={handleJobComplete}
              />
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading || !channelUrl.trim()}
          className="w-full py-3 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? "Analyzing..." : "Analyze Channel SEO"}
        </button>
      </form>
    </div>
  );
}
