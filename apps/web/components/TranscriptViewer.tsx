"use client";

import { useState } from "react";
import { formatDuration } from "../../../lib/utils";

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  speaker?: string;
}

interface TranscriptViewerProps {
  segments: TranscriptSegment[];
  fullText: string;
  onSelectRange?: (startSeconds: number, endSeconds: number) => void;
}

export function TranscriptViewer({
  segments,
  fullText,
  onSelectRange,
}: TranscriptViewerProps) {
  const [selectedStart, setSelectedStart] = useState<number | null>(null);
  const [selectedEnd, setSelectedEnd] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"segments" | "full">("segments");

  function handleSegmentClick(segment: TranscriptSegment) {
    if (!onSelectRange) return;

    if (selectedStart === null) {
      // First selection
      setSelectedStart(segment.start);
      setSelectedEnd(segment.end);
    } else if (selectedEnd === null || segment.start < selectedStart) {
      // Selecting before current start
      setSelectedStart(segment.start);
      setSelectedEnd(selectedEnd || segment.end);
    } else {
      // Extending selection
      setSelectedEnd(segment.end);
    }
  }

  function clearSelection() {
    setSelectedStart(null);
    setSelectedEnd(null);
  }

  function confirmSelection() {
    if (selectedStart !== null && selectedEnd !== null && onSelectRange) {
      onSelectRange(selectedStart, selectedEnd);
      clearSelection();
    }
  }

  function isSegmentSelected(segment: TranscriptSegment): boolean {
    if (selectedStart === null || selectedEnd === null) return false;
    return segment.start >= selectedStart && segment.end <= selectedEnd;
  }

  function isSegmentInRange(segment: TranscriptSegment): boolean {
    if (selectedStart === null) return false;
    if (selectedEnd === null) {
      return segment.start === selectedStart;
    }
    return segment.start >= selectedStart && segment.end <= selectedEnd;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode("segments")}
            className={`px-3 py-1 text-sm rounded ${
              viewMode === "segments"
                ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            Segments
          </button>
          <button
            onClick={() => setViewMode("full")}
            className={`px-3 py-1 text-sm rounded ${
              viewMode === "full"
                ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            Full Text
          </button>
        </div>

        {selectedStart !== null && selectedEnd !== null && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">
              Selected: {formatDuration(selectedStart)} - {formatDuration(selectedEnd)}
            </span>
            <button
              onClick={confirmSelection}
              className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
            >
              Use Selection
            </button>
            <button
              onClick={clearSelection}
              className="px-3 py-1 text-sm bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {viewMode === "segments" ? (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {segments.map((segment, index) => (
            <div
              key={index}
              onClick={() => handleSegmentClick(segment)}
              className={`p-3 rounded border transition-colors ${
                isSegmentInRange(segment)
                  ? "bg-blue-50 border-blue-300"
                  : "bg-white border-gray-200 hover:bg-gray-50"
              } ${onSelectRange ? "cursor-pointer" : ""}`}
            >
              <div className="flex items-start gap-3">
                <div className="text-xs text-gray-500 font-mono whitespace-nowrap pt-0.5">
                  {formatDuration(segment.start)}
                </div>
                <div className="flex-1">
                  {segment.speaker && (
                    <div className="text-xs font-semibold text-gray-700 mb-1">
                      {segment.speaker}
                    </div>
                  )}
                  <p className="text-sm text-gray-800">{segment.text}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-4 bg-white border border-gray-200 rounded max-h-96 overflow-y-auto">
          <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
            {fullText}
          </p>
        </div>
      )}

      {onSelectRange && viewMode === "segments" && (
        <div className="text-xs text-gray-500 p-3 bg-gray-50 rounded">
          <strong>Tip:</strong> Click segments to select a range for clip generation or asset
          creation. Click the first segment to start, then click the last segment to complete
          your selection.
        </div>
      )}
    </div>
  );
}
