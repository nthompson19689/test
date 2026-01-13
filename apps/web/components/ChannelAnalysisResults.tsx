"use client";

import { useState } from "react";

interface VideoAnalysis {
  videoId: string;
  title: string;
  publishedAt: string;
  seoScore: number;
  viewCount?: number;
  likeCount?: number;
  issues: Array<{
    type: "critical" | "warning" | "suggestion";
    category: string;
    message: string;
    recommendation: string;
  }>;
  strengths: string[];
}

interface Recommendation {
  priority: "high" | "medium" | "low";
  category: string;
  title: string;
  description: string;
  actionItems: string[];
  affectedVideos?: string[];
}

interface CategoryBreakdown {
  titles: number;
  descriptions: number;
  tags: number;
  thumbnails: number;
  consistency: number;
  engagement: number;
}

interface ChannelAnalysisData {
  id: string;
  channelId: string;
  channelUrl: string;
  channelTitle: string;
  channelDescription?: string;
  subscriberCount?: number;
  videoCount?: number;
  viewCount?: number;
  thumbnailUrl?: string;
  videosAnalyzed: VideoAnalysis[];
  overallScore: number;
  recommendations: {
    categoryBreakdown: CategoryBreakdown;
    recommendations: Recommendation[];
  };
  createdAt: string;
}

interface ChannelAnalysisResultsProps {
  analysis: ChannelAnalysisData;
}

function ScoreCircle({ score, size = "lg" }: { score: number; size?: "sm" | "lg" }) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    if (score >= 40) return "text-orange-600";
    return "text-red-600";
  };

  const getBgColor = (score: number) => {
    if (score >= 80) return "bg-green-100";
    if (score >= 60) return "bg-yellow-100";
    if (score >= 40) return "bg-orange-100";
    return "bg-red-100";
  };

  const sizeClasses = size === "lg" ? "w-32 h-32 text-4xl" : "w-16 h-16 text-xl";

  return (
    <div
      className={`${sizeClasses} ${getBgColor(score)} rounded-full flex items-center justify-center`}
    >
      <span className={`font-bold ${getScoreColor(score)}`}>{score}</span>
    </div>
  );
}

function CategoryBar({ label, score }: { label: string; score: number }) {
  const getBarColor = (score: number) => {
    if (score >= 80) return "bg-green-500";
    if (score >= 60) return "bg-yellow-500";
    if (score >= 40) return "bg-orange-500";
    return "bg-red-500";
  };

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-gray-600">{label}</span>
        <span className="font-medium">{score}/100</span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full ${getBarColor(score)} transition-all duration-500`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: "high" | "medium" | "low" }) {
  const colors = {
    high: "bg-red-100 text-red-800",
    medium: "bg-yellow-100 text-yellow-800",
    low: "bg-green-100 text-green-800",
  };

  return (
    <span
      className={`px-2 py-1 text-xs font-medium rounded-full ${colors[priority]}`}
    >
      {priority.charAt(0).toUpperCase() + priority.slice(1)} Priority
    </span>
  );
}

function IssueTypeBadge({ type }: { type: "critical" | "warning" | "suggestion" }) {
  const colors = {
    critical: "bg-red-100 text-red-800",
    warning: "bg-yellow-100 text-yellow-800",
    suggestion: "bg-blue-100 text-blue-800",
  };

  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded ${colors[type]}`}>
      {type.charAt(0).toUpperCase() + type.slice(1)}
    </span>
  );
}

function formatNumber(num: number | undefined): string {
  if (num === undefined) return "N/A";
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "K";
  return num.toString();
}

export function ChannelAnalysisResults({ analysis }: ChannelAnalysisResultsProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "recommendations" | "videos">("overview");
  const [expandedVideo, setExpandedVideo] = useState<string | null>(null);

  const { categoryBreakdown, recommendations } = analysis.recommendations;
  const videos = analysis.videosAnalyzed as VideoAnalysis[];

  // Sort recommendations by priority
  const sortedRecommendations = [...recommendations].sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  // Sort videos by SEO score (worst first for easy identification)
  const sortedVideos = [...videos].sort((a, b) => a.seoScore - b.seoScore);

  return (
    <div className="space-y-8">
      {/* Channel Header */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <div className="flex items-start gap-6">
          {analysis.thumbnailUrl && (
            <img
              src={analysis.thumbnailUrl}
              alt={analysis.channelTitle}
              className="w-24 h-24 rounded-full object-cover"
            />
          )}
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">
              {analysis.channelTitle}
            </h1>
            <p className="text-gray-500 mt-1">
              <a
                href={analysis.channelUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                {analysis.channelUrl}
              </a>
            </p>
            <div className="flex gap-6 mt-4 text-sm">
              <div>
                <span className="text-gray-500">Subscribers:</span>{" "}
                <span className="font-medium">
                  {formatNumber(analysis.subscriberCount)}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Videos:</span>{" "}
                <span className="font-medium">{analysis.videoCount}</span>
              </div>
              <div>
                <span className="text-gray-500">Total Views:</span>{" "}
                <span className="font-medium">
                  {formatNumber(analysis.viewCount)}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Analyzed:</span>{" "}
                <span className="font-medium">{videos.length} videos</span>
              </div>
            </div>
          </div>
          <div className="text-center">
            <ScoreCircle score={analysis.overallScore} />
            <p className="mt-2 text-sm text-gray-600 font-medium">
              Overall SEO Score
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-8">
          {[
            { id: "overview", label: "Overview" },
            { id: "recommendations", label: `Recommendations (${recommendations.length})` },
            { id: "videos", label: `Videos (${videos.length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === tab.id
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && (
        <div className="grid md:grid-cols-2 gap-8">
          {/* Category Breakdown */}
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="text-lg font-semibold mb-6">SEO Category Scores</h2>
            <div className="space-y-4">
              <CategoryBar label="Titles" score={categoryBreakdown.titles} />
              <CategoryBar label="Descriptions" score={categoryBreakdown.descriptions} />
              <CategoryBar label="Tags" score={categoryBreakdown.tags} />
              <CategoryBar label="Thumbnails" score={categoryBreakdown.thumbnails} />
              <CategoryBar label="Consistency" score={categoryBreakdown.consistency} />
              <CategoryBar label="Engagement" score={categoryBreakdown.engagement} />
            </div>
          </div>

          {/* Quick Stats */}
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="text-lg font-semibold mb-6">Quick Insights</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-gray-600">Videos with Critical Issues</span>
                <span className="font-semibold text-red-600">
                  {videos.filter((v) => v.issues.some((i) => i.type === "critical")).length}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-gray-600">Videos with No Tags</span>
                <span className="font-semibold text-yellow-600">
                  {videos.filter((v) =>
                    v.issues.some((i) => i.category === "tags" && i.message.includes("no tags"))
                  ).length}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-gray-600">Videos Scoring 80+</span>
                <span className="font-semibold text-green-600">
                  {videos.filter((v) => v.seoScore >= 80).length}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-gray-600">Average Video Score</span>
                <span className="font-semibold">
                  {Math.round(videos.reduce((sum, v) => sum + v.seoScore, 0) / videos.length)}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-gray-600">High Priority Actions</span>
                <span className="font-semibold text-red-600">
                  {recommendations.filter((r) => r.priority === "high").length}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "recommendations" && (
        <div className="space-y-4">
          {sortedRecommendations.length === 0 ? (
            <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
              <p className="text-green-700 font-medium">
                Great job! No major recommendations at this time.
              </p>
            </div>
          ) : (
            sortedRecommendations.map((rec, index) => (
              <div
                key={index}
                className="bg-white rounded-xl shadow-sm border p-6"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <PriorityBadge priority={rec.priority} />
                      <span className="text-sm text-gray-500 capitalize">
                        {rec.category}
                      </span>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {rec.title}
                    </h3>
                  </div>
                </div>
                <p className="text-gray-600 mb-4">{rec.description}</p>
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">
                    Action Items:
                  </h4>
                  <ul className="space-y-2">
                    {rec.actionItems.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className="text-blue-500 mt-0.5">-</span>
                        <span className="text-gray-600">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                {rec.affectedVideos && rec.affectedVideos.length > 0 && (
                  <div className="mt-4 pt-4 border-t">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">
                      Affected Videos:
                    </h4>
                    <ul className="text-sm text-gray-500 space-y-1">
                      {rec.affectedVideos.slice(0, 3).map((title, i) => (
                        <li key={i} className="truncate">
                          - {title}
                        </li>
                      ))}
                      {rec.affectedVideos.length > 3 && (
                        <li className="text-gray-400">
                          ...and {rec.affectedVideos.length - 3} more
                        </li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === "videos" && (
        <div className="space-y-3">
          {sortedVideos.map((video) => (
            <div
              key={video.videoId}
              className="bg-white rounded-xl shadow-sm border overflow-hidden"
            >
              <button
                onClick={() =>
                  setExpandedVideo(
                    expandedVideo === video.videoId ? null : video.videoId
                  )
                }
                className="w-full p-4 flex items-center gap-4 text-left hover:bg-gray-50 transition-colors"
              >
                <ScoreCircle score={video.seoScore} size="sm" />
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-gray-900 truncate">
                    {video.title}
                  </h3>
                  <div className="flex gap-4 text-sm text-gray-500 mt-1">
                    <span>{formatNumber(video.viewCount)} views</span>
                    <span>{video.issues.length} issues</span>
                    <span>{video.strengths.length} strengths</span>
                  </div>
                </div>
                <svg
                  className={`w-5 h-5 text-gray-400 transition-transform ${
                    expandedVideo === video.videoId ? "rotate-180" : ""
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {expandedVideo === video.videoId && (
                <div className="px-4 pb-4 border-t bg-gray-50">
                  <div className="grid md:grid-cols-2 gap-6 pt-4">
                    {/* Issues */}
                    <div>
                      <h4 className="font-medium text-gray-700 mb-3">Issues</h4>
                      {video.issues.length === 0 ? (
                        <p className="text-sm text-gray-500">No issues found</p>
                      ) : (
                        <div className="space-y-3">
                          {video.issues.map((issue, i) => (
                            <div key={i} className="bg-white rounded-lg p-3">
                              <div className="flex items-center gap-2 mb-1">
                                <IssueTypeBadge type={issue.type} />
                                <span className="text-xs text-gray-500 capitalize">
                                  {issue.category}
                                </span>
                              </div>
                              <p className="text-sm text-gray-700">
                                {issue.message}
                              </p>
                              <p className="text-xs text-gray-500 mt-1">
                                Fix: {issue.recommendation}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Strengths */}
                    <div>
                      <h4 className="font-medium text-gray-700 mb-3">
                        Strengths
                      </h4>
                      {video.strengths.length === 0 ? (
                        <p className="text-sm text-gray-500">
                          No strengths identified
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {video.strengths.map((strength, i) => (
                            <li
                              key={i}
                              className="flex items-start gap-2 text-sm bg-white rounded-lg p-3"
                            >
                              <span className="text-green-500">+</span>
                              <span className="text-gray-600">{strength}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t">
                    <a
                      href={`https://youtube.com/watch?v=${video.videoId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline"
                    >
                      View on YouTube -&gt;
                    </a>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
