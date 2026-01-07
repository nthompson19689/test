import { getUserApiKey } from "./crypto";
import { downloadFile } from "./storage";
import { createReadStream } from "fs";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import OpenAI from "openai";

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  speaker?: string;
}

export interface TranscriptionResult {
  segments: TranscriptSegment[];
  fullText: string;
  language?: string;
}

/**
 * Transcribes audio/video using OpenAI Whisper API
 */
export async function transcribeMedia(
  userId: string,
  storageKey: string
): Promise<TranscriptionResult> {
  let apiKey = process.env.OPENAI_API_KEY || "";

  // Try to use user's API key
  const userKey = await getUserApiKey(userId, "openai");
  if (userKey) {
    apiKey = userKey;
  }

  if (!apiKey) {
    throw new Error("No OpenAI API key available for transcription");
  }

  // Download file from storage
  const fileBuffer = await downloadFile(storageKey);

  // Write to temp file (Whisper API requires file path)
  const tempPath = join(tmpdir(), `transcribe-${Date.now()}.mp3`);
  await writeFile(tempPath, fileBuffer);

  try {
    const openai = new OpenAI({ apiKey });

    // Use verbose_json to get timestamps
    const response = await openai.audio.transcriptions.create({
      file: createReadStream(tempPath),
      model: "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["segment"],
    });

    // Parse response
    const segments: TranscriptSegment[] = [];
    let fullText = "";

    if ("segments" in response && Array.isArray(response.segments)) {
      for (const seg of response.segments) {
        segments.push({
          start: seg.start || 0,
          end: seg.end || 0,
          text: seg.text || "",
        });
        fullText += seg.text + " ";
      }
    } else if ("text" in response) {
      // Fallback if segments not available
      fullText = response.text;
      segments.push({
        start: 0,
        end: 0,
        text: response.text,
      });
    }

    return {
      segments,
      fullText: fullText.trim(),
      language: "language" in response ? response.language : undefined,
    };
  } finally {
    // Clean up temp file
    await unlink(tempPath).catch(() => {});
  }
}

/**
 * Extracts a portion of transcript text by time range
 */
export function extractTranscriptRange(
  segments: TranscriptSegment[],
  startSeconds: number,
  endSeconds: number
): string {
  const relevantSegments = segments.filter((seg) => {
    return seg.end > startSeconds && seg.start < endSeconds;
  });

  return relevantSegments.map((seg) => seg.text).join(" ");
}

/**
 * Generates an SRT subtitle file from transcript segments
 */
export function generateSRT(segments: TranscriptSegment[]): string {
  let srt = "";

  segments.forEach((segment, index) => {
    const startTime = formatSRTTimestamp(segment.start);
    const endTime = formatSRTTimestamp(segment.end);

    srt += `${index + 1}\n`;
    srt += `${startTime} --> ${endTime}\n`;
    srt += `${segment.text.trim()}\n\n`;
  });

  return srt;
}

function formatSRTTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.floor((seconds % 1) * 1000);

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
}
