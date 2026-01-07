import { getServerSession } from "next-auth";
import { authOptions } from "../../lib/auth";
import { redirect } from "next/navigation";
import { getProject } from "../../actions/projects";
import Link from "next/link";
import { formatFileSize, formatDuration } from "../../../../lib/utils";

export default async function ProjectPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/auth/signin");
  }

  const project = await getProject(params.id);

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-4">
              <Link href="/projects" className="text-sm text-gray-600 hover:text-gray-900">
                ← Back to Projects
              </Link>
              <h1 className="text-xl font-bold">{project.name}</h1>
            </div>
            <span className="text-sm text-gray-600">{session.user?.email}</span>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {project.description && (
          <p className="text-gray-600 mb-6">{project.description}</p>
        )}

        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Media Files</h2>
            <button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
              Upload Media
            </button>
          </div>

          {project.mediaFiles.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <p className="text-gray-500">No media files yet. Upload your first file to get started.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {project.mediaFiles.map((file) => (
                <div key={file.id} className="bg-white rounded-lg shadow p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-semibold">{file.name}</h3>
                      <p className="text-sm text-gray-500">
                        {file.mediaType} • {formatFileSize(Number(file.fileSize))}
                        {file.durationSeconds && ` • ${formatDuration(file.durationSeconds)}`}
                      </p>
                    </div>
                  </div>

                  {file.transcripts.length > 0 ? (
                    <div className="mt-4 p-4 bg-gray-50 rounded">
                      <h4 className="font-medium mb-2">Transcript</h4>
                      <p className="text-sm text-gray-700 line-clamp-3">
                        {file.transcripts[0].fullText}
                      </p>
                      <div className="mt-3 flex gap-2">
                        <button className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">
                          View Full Transcript
                        </button>
                        <button className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700">
                          Generate Assets
                        </button>
                        <button className="px-3 py-1 text-sm bg-purple-600 text-white rounded hover:bg-purple-700">
                          Create Clip
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 p-4 bg-yellow-50 rounded">
                      <p className="text-sm text-yellow-800">
                        Transcription in progress... Check back in a few moments.
                      </p>
                    </div>
                  )}

                  {file.clips.length > 0 && (
                    <div className="mt-4">
                      <h4 className="font-medium mb-2">Clips ({file.clips.length})</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {file.clips.map((clip) => (
                          <div key={clip.id} className="p-3 bg-gray-50 rounded text-sm">
                            <div className="font-medium">{clip.name}</div>
                            <div className="text-gray-500">
                              {clip.startSeconds}s - {clip.endSeconds}s • {clip.aspectRatio}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
