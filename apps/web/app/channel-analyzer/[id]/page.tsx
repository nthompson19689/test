import { getServerSession } from "next-auth";
import { authOptions } from "../../lib/auth";
import { redirect, notFound } from "next/navigation";
import { getChannelAnalysis } from "../../actions/channel";
import { ChannelAnalysisResults } from "../../components/ChannelAnalysisResults";
import Link from "next/link";

interface PageProps {
  params: { id: string };
}

export default async function ChannelAnalysisDetailPage({ params }: PageProps) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/auth/signin");
  }

  let analysis;
  try {
    analysis = await getChannelAnalysis(params.id);
  } catch (err) {
    notFound();
  }

  if (!analysis) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-4">
              <Link
                href="/channel-analyzer"
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                &larr; Back to Channel Analyzer
              </Link>
              <h1 className="text-xl font-bold">Analysis Results</h1>
            </div>
            <span className="text-sm text-gray-600">{session.user?.email}</span>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <ChannelAnalysisResults analysis={analysis as any} />
      </main>
    </div>
  );
}
