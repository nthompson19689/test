import { getServerSession } from "next-auth";
import { authOptions } from "../lib/auth";
import { redirect } from "next/navigation";
import { getChannelAnalyses } from "../actions/channel";
import { ChannelAnalyzerForm } from "../components/ChannelAnalyzerForm";
import { ChannelAnalysisList } from "../components/ChannelAnalysisList";
import Link from "next/link";

export default async function ChannelAnalyzerPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/auth/signin");
  }

  const analyses = await getChannelAnalyses();

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-4">
              <Link href="/projects" className="text-sm text-gray-600 hover:text-gray-900">
                &larr; Back to Projects
              </Link>
              <h1 className="text-xl font-bold">YouTube Channel SEO Analyzer</h1>
            </div>
            <span className="text-sm text-gray-600">{session.user?.email}</span>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Hero Section */}
        <div className="bg-gradient-to-r from-red-600 to-red-700 rounded-2xl p-8 mb-8 text-white">
          <div className="max-w-3xl">
            <h2 className="text-3xl font-bold mb-4">
              Optimize Your YouTube Channel for Search
            </h2>
            <p className="text-red-100 text-lg">
              Get detailed SEO analysis and actionable recommendations to improve your
              channel's discoverability. We analyze titles, descriptions, tags,
              thumbnails, and engagement patterns across all your videos.
            </p>
          </div>
        </div>

        {/* Analyzer Form */}
        <div className="bg-white rounded-xl shadow-sm border p-8 mb-8">
          <h3 className="text-lg font-semibold mb-6">Analyze a Channel</h3>
          <ChannelAnalyzerForm />
        </div>

        {/* Previous Analyses */}
        <ChannelAnalysisList analyses={analyses} />

        {/* Info Section */}
        <div className="mt-12 grid md:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
              <svg
                className="w-6 h-6 text-blue-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            </div>
            <h4 className="font-semibold mb-2">Video-by-Video Analysis</h4>
            <p className="text-sm text-gray-600">
              Each video is scored individually, helping you identify which content
              needs the most attention.
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
              <svg
                className="w-6 h-6 text-green-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h4 className="font-semibold mb-2">Actionable Recommendations</h4>
            <p className="text-sm text-gray-600">
              Get prioritized action items with specific steps to improve your
              channel's SEO performance.
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
              <svg
                className="w-6 h-6 text-purple-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                />
              </svg>
            </div>
            <h4 className="font-semibold mb-2">Track Progress</h4>
            <p className="text-sm text-gray-600">
              Re-analyze your channel periodically to track improvements and identify
              new opportunities.
            </p>
          </div>
        </div>

        {/* What We Analyze */}
        <div className="mt-8 bg-white rounded-xl shadow-sm border p-8">
          <h3 className="text-lg font-semibold mb-6">What We Analyze</h3>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium text-gray-900 mb-3">Video Metadata</h4>
              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                  Title length and keyword optimization
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                  Description completeness and structure
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                  Tag usage and relevance
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                  Thumbnail presence and quality
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                  Captions and accessibility
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-gray-900 mb-3">Channel Patterns</h4>
              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                  Content consistency and branding
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                  Upload schedule regularity
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                  Engagement metrics (likes, comments)
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                  Channel description and keywords
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                  Cross-video tag consistency
                </li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
