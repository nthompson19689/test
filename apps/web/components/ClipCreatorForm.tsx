"use client";

import { useState } from "react";
import { createClip } from "../actions/clips";
import { ClipAspectRatio } from "@prisma/client";
import { formatDuration } from "../../../lib/utils";

interface ClipCreatorFormProps {
  mediaFileId: string;
  maxDuration: number;
  initialStart?: number;
  initialEnd?: number;
  onClose: () => void;
  onSuccess?: () => void;
}

export function ClipCreatorForm({
  mediaFileId,
  maxDuration,
  initialStart = 0,
  initialEnd,
  onClose,
  onSuccess,
}: ClipCreatorFormProps) {
  const [name, setName] = useState("");
  const [startSeconds, setStartSeconds] = useState(initialStart);
  const [endSeconds, setEndSeconds] = useState(initialEnd || Math.min(30, maxDuration));
  const [aspectRatio, setAspectRatio] = useState<ClipAspectRatio>("HORIZONTAL");
  const [withCaptions, setWithCaptions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (endSeconds <= startSeconds) {
      setError("End time must be after start time");
      return;
    }

    if (endSeconds > maxDuration) {
      setError(`End time cannot exceed ${formatDuration(maxDuration)}`);
      return;
    }

    if (!name.trim()) {
      setError("Please enter a clip name");
      return;
    }

    setLoading(true);

    try {
      await createClip({
        mediaFileId,
        name: name.trim(),
        startSeconds,
        endSeconds,
        aspectRatio,
        withCaptions,
      });

      onSuccess?.();
      onClose();
    } catch (err) {
      console.error("Error creating clip:", err);
      setError(err instanceof Error ? err.message : "Failed to create clip");
    } finally {
      setLoading(false);
    }
  }

  const duration = endSeconds - startSeconds;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-lg w-full">
        <h2 className="text-xl font-bold mb-4">Create Clip</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Clip Name
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Product Demo Highlight"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="start" className="block text-sm font-medium text-gray-700 mb-1">
                Start Time (seconds)
              </label>
              <input
                type="number"
                id="start"
                value={startSeconds}
                onChange={(e) => setStartSeconds(Number(e.target.value))}
                min={0}
                max={maxDuration}
                step={0.1}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="text-xs text-gray-500 mt-1">
                {formatDuration(startSeconds)}
              </div>
            </div>

            <div>
              <label htmlFor="end" className="block text-sm font-medium text-gray-700 mb-1">
                End Time (seconds)
              </label>
              <input
                type="number"
                id="end"
                value={endSeconds}
                onChange={(e) => setEndSeconds(Number(e.target.value))}
                min={0}
                max={maxDuration}
                step={0.1}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="text-xs text-gray-500 mt-1">
                {formatDuration(endSeconds)}
              </div>
            </div>
          </div>

          <div className="p-3 bg-blue-50 rounded">
            <div className="text-sm font-medium text-blue-900">
              Clip Duration: {formatDuration(duration)}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Aspect Ratio
            </label>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setAspectRatio("VERTICAL")}
                className={`p-3 border rounded-lg text-center transition-colors ${
                  aspectRatio === "VERTICAL"
                    ? "border-blue-600 bg-blue-50"
                    : "border-gray-300 hover:bg-gray-50"
                }`}
              >
                <div className="flex justify-center mb-2">
                  <div className="w-8 h-12 border-2 border-current rounded" />
                </div>
                <div className="text-sm font-medium">9:16</div>
                <div className="text-xs text-gray-500">Stories</div>
              </button>

              <button
                type="button"
                onClick={() => setAspectRatio("SQUARE")}
                className={`p-3 border rounded-lg text-center transition-colors ${
                  aspectRatio === "SQUARE"
                    ? "border-blue-600 bg-blue-50"
                    : "border-gray-300 hover:bg-gray-50"
                }`}
              >
                <div className="flex justify-center mb-2">
                  <div className="w-10 h-10 border-2 border-current rounded" />
                </div>
                <div className="text-sm font-medium">1:1</div>
                <div className="text-xs text-gray-500">Square</div>
              </button>

              <button
                type="button"
                onClick={() => setAspectRatio("HORIZONTAL")}
                className={`p-3 border rounded-lg text-center transition-colors ${
                  aspectRatio === "HORIZONTAL"
                    ? "border-blue-600 bg-blue-50"
                    : "border-gray-300 hover:bg-gray-50"
                }`}
              >
                <div className="flex justify-center mb-2">
                  <div className="w-12 h-8 border-2 border-current rounded" />
                </div>
                <div className="text-sm font-medium">16:9</div>
                <div className="text-xs text-gray-500">Landscape</div>
              </button>
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={withCaptions}
                onChange={(e) => setWithCaptions(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">
                Burn captions into video
              </span>
            </label>
            <p className="text-xs text-gray-500 ml-6 mt-1">
              Captions will be permanently added to the video (requires transcript)
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 text-red-700 rounded text-sm">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create Clip"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
