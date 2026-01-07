"use client";

import { useState } from "react";
import { UploadMediaForm } from "../../../components/UploadMediaForm";
import { TranscriptViewer } from "../../../components/TranscriptViewer";
import { ClipCreatorForm } from "../../../components/ClipCreatorForm";
import { AssetGeneratorForm } from "../../../components/AssetGeneratorForm";
import { AssetDisplay } from "../../../components/AssetDisplay";
import { JobStatusBadge } from "../../../components/JobStatusBadge";
import { formatFileSize, formatDuration } from "../../../../../lib/utils";
import { getPresignedDownloadUrl } from "../../../../../lib/storage";

interface ProjectDetailClientProps {
  project: any;
}

export function ProjectDetailClient({ project }: ProjectDetailClientProps) {
  const [showUpload, setShowUpload] = useState(false);
  const [selectedTranscript, setSelectedTranscript] = useState<any>(null);
  const [showClipCreator, setShowClipCreator] = useState(false);
  const [clipRange, setClipRange] = useState<{ start: number; end: number } | null>(null);
  const [showAssetGenerator, setShowAssetGenerator] = useState(false);
  const [assetRange, setAssetRange] = useState<{ start: number; end: number } | null>(null);
  const [selectedMediaFile, setSelectedMediaFile] = useState<any>(null);
  const [selectedAsset, setSelectedAsset] = useState<any>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  function handleRangeSelected(startSeconds: number, endSeconds: number, forType: "clip" | "asset") {
    if (forType === "clip") {
      setClipRange({ start: startSeconds, end: endSeconds });
      setShowClipCreator(true);
    } else {
      setAssetRange({ start: startSeconds, end: endSeconds });
      setShowAssetGenerator(true);
    }
  }

  function handleSuccess() {
    setRefreshKey((k) => k + 1);
    window.location.reload(); // Simple reload for now
  }

  return (
    <div>
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Media Files</h2>
          <button
            onClick={() => setShowUpload(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Upload Media
          </button>
        </div>

        {project.mediaFiles.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-500">
              No media files yet. Upload your first file to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {project.mediaFiles.map((file: any) => (
              <div key={file.id} className="bg-white rounded-lg shadow">
                <div className="p-6 border-b border-gray-200">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="text-lg font-semibold">{file.name}</h3>
                      <p className="text-sm text-gray-500">
                        {file.mediaType} • {formatFileSize(Number(file.fileSize))}
                        {file.durationSeconds && ` • ${formatDuration(file.durationSeconds)}`}
                      </p>
                    </div>
                  </div>

                  {file.transcripts.length === 0 && (
                    <div className="mt-3">
                      <JobStatusBadge type="TRANSCRIBE" initialStatus="PROCESSING" />
                    </div>
                  )}
                </div>

                {file.transcripts.length > 0 && (
                  <div className="p-6">
                    <div className="flex justify-between items-center mb-4">
                      <h4 className="font-semibold">Transcript</h4>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setSelectedTranscript(file.transcripts[0]);
                            setSelectedMediaFile(file);
                            setAssetRange(null);
                          }}
                          className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                        >
                          Generate Assets
                        </button>
                        <button
                          onClick={() => {
                            setSelectedTranscript(file.transcripts[0]);
                            setSelectedMediaFile(file);
                            setClipRange(null);
                          }}
                          className="px-3 py-1 text-sm bg-purple-600 text-white rounded hover:bg-purple-700"
                        >
                          Create Clip
                        </button>
                      </div>
                    </div>

                    {selectedTranscript?.id === file.transcripts[0].id ? (
                      <div className="mb-4">
                        <TranscriptViewer
                          segments={file.transcripts[0].segments}
                          fullText={file.transcripts[0].fullText}
                          onSelectRange={(start, end) => {
                            // Show buttons to choose clip or asset
                            const choice = confirm(
                              "What would you like to create with this selection?\n\nOK = Create Clip\nCancel = Generate Assets"
                            );
                            handleRangeSelected(start, end, choice ? "clip" : "asset");
                          }}
                        />
                        <button
                          onClick={() => setSelectedTranscript(null)}
                          className="mt-3 text-sm text-gray-600 hover:text-gray-900"
                        >
                          ← Hide Transcript
                        </button>
                      </div>
                    ) : (
                      <div
                        onClick={() => setSelectedTranscript(file.transcripts[0])}
                        className="p-4 bg-gray-50 rounded cursor-pointer hover:bg-gray-100"
                      >
                        <p className="text-sm text-gray-700 line-clamp-2">
                          {file.transcripts[0].fullText}
                        </p>
                        <p className="text-xs text-blue-600 mt-2">Click to expand →</p>
                      </div>
                    )}
                  </div>
                )}

                {file.clips.length > 0 && (
                  <div className="p-6 border-t border-gray-200">
                    <h4 className="font-semibold mb-3">Clips ({file.clips.length})</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {file.clips.map((clip: any) => (
                        <div key={clip.id} className="p-3 bg-gray-50 rounded">
                          <div className="flex justify-between items-start mb-1">
                            <div className="font-medium text-sm">{clip.name}</div>
                            {!clip.storageKey && (
                              <JobStatusBadge type="MAKE_CLIP" initialStatus="PROCESSING" />
                            )}
                          </div>
                          <div className="text-xs text-gray-500">
                            {formatDuration(clip.startSeconds)} -{" "}
                            {formatDuration(clip.endSeconds)} • {clip.aspectRatio}
                            {clip.withCaptions && " • Captions"}
                          </div>
                          {clip.storageKey && (
                            <a
                              href="#"
                              onClick={async (e) => {
                                e.preventDefault();
                                // In a real app, you'd fetch the presigned URL
                                alert("Download functionality: Fetch presigned URL from API");
                              }}
                              className="text-xs text-blue-600 hover:underline mt-2 inline-block"
                            >
                              Download
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {file.transcripts[0]?.generatedAssets?.length > 0 && (
                  <div className="p-6 border-t border-gray-200">
                    <h4 className="font-semibold mb-3">
                      Generated Assets ({file.transcripts[0].generatedAssets.length})
                    </h4>
                    {selectedAsset ? (
                      <div>
                        <button
                          onClick={() => setSelectedAsset(null)}
                          className="mb-3 text-sm text-gray-600 hover:text-gray-900"
                        >
                          ← Back to list
                        </button>
                        <AssetDisplay asset={selectedAsset} />
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {file.transcripts[0].generatedAssets.map((asset: any) => (
                          <button
                            key={asset.id}
                            onClick={() => setSelectedAsset(asset)}
                            className="w-full p-3 bg-gray-50 rounded hover:bg-gray-100 text-left"
                          >
                            <div className="font-medium text-sm">
                              {asset.name || "Generated Assets"}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {new Date(asset.createdAt).toLocaleString()}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showUpload && (
        <UploadMediaForm
          projectId={project.id}
          onClose={() => setShowUpload(false)}
          onSuccess={handleSuccess}
        />
      )}

      {showClipCreator && selectedMediaFile && selectedTranscript && (
        <ClipCreatorForm
          mediaFileId={selectedMediaFile.id}
          maxDuration={selectedMediaFile.durationSeconds || 0}
          initialStart={clipRange?.start}
          initialEnd={clipRange?.end}
          onClose={() => {
            setShowClipCreator(false);
            setClipRange(null);
          }}
          onSuccess={handleSuccess}
        />
      )}

      {(showAssetGenerator || assetRange) && selectedTranscript && (
        <AssetGeneratorForm
          transcriptId={selectedTranscript.id}
          initialStart={assetRange?.start}
          initialEnd={assetRange?.end}
          onClose={() => {
            setShowAssetGenerator(false);
            setAssetRange(null);
          }}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
}
