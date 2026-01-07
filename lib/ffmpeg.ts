import ffmpeg from "fluent-ffmpeg";
import { join } from "path";
import { tmpdir } from "os";
import { writeFile, unlink } from "fs/promises";
import { downloadFile, uploadFile } from "./storage";
import { ClipAspectRatio } from "@prisma/client";

export interface ClipOptions {
  storageKey: string;
  startSeconds: number;
  endSeconds: number;
  aspectRatio: ClipAspectRatio;
  withCaptions: boolean;
  subtitlesPath?: string;
}

export interface ClipResult {
  clipStorageKey: string;
  subtitlesStorageKey?: string;
}

/**
 * Generates a video clip with optional captions
 */
export async function generateClip(
  userId: string,
  projectId: string,
  options: ClipOptions
): Promise<ClipResult> {
  const { storageKey, startSeconds, endSeconds, aspectRatio, withCaptions, subtitlesPath } =
    options;

  // Download source file
  const sourceBuffer = await downloadFile(storageKey);
  const sourcePath = join(tmpdir(), `source-${Date.now()}.mp4`);
  await writeFile(sourcePath, sourceBuffer);

  const outputPath = join(tmpdir(), `clip-${Date.now()}.mp4`);

  try {
    // Get video info
    const info = await getVideoInfo(sourcePath);
    const { width, height } = info;

    // Calculate crop dimensions based on aspect ratio
    const cropParams = calculateCropParams(width, height, aspectRatio);

    // Build FFmpeg command
    const command = ffmpeg(sourcePath)
      .setStartTime(startSeconds)
      .setDuration(endSeconds - startSeconds)
      .videoFilters(buildVideoFilters(cropParams, withCaptions, subtitlesPath))
      .outputOptions(["-c:a aac", "-c:v libx264", "-preset fast", "-crf 23"]);

    // Execute
    await new Promise<void>((resolve, reject) => {
      command
        .output(outputPath)
        .on("end", () => resolve())
        .on("error", (err) => reject(err))
        .run();
    });

    // Upload result
    const clipBuffer = await import("fs/promises").then((fs) => fs.readFile(outputPath));
    const clipKey = `clips/${userId}/${projectId}/${Date.now()}.mp4`;

    await uploadFile({
      key: clipKey,
      body: clipBuffer,
      contentType: "video/mp4",
    });

    let subtitlesKey: string | undefined;

    // Upload subtitles if provided
    if (subtitlesPath) {
      const subtitlesBuffer = await import("fs/promises").then((fs) => fs.readFile(subtitlesPath));
      subtitlesKey = `clips/${userId}/${projectId}/${Date.now()}.srt`;

      await uploadFile({
        key: subtitlesKey,
        body: subtitlesBuffer,
        contentType: "text/plain",
      });
    }

    return {
      clipStorageKey: clipKey,
      subtitlesStorageKey: subtitlesKey,
    };
  } finally {
    // Cleanup
    await Promise.all([
      unlink(sourcePath).catch(() => {}),
      unlink(outputPath).catch(() => {}),
    ]);
  }
}

interface VideoInfo {
  width: number;
  height: number;
  duration: number;
}

function getVideoInfo(filePath: string): Promise<VideoInfo> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }

      const videoStream = metadata.streams.find((s) => s.codec_type === "video");
      if (!videoStream || !videoStream.width || !videoStream.height) {
        reject(new Error("Invalid video stream"));
        return;
      }

      resolve({
        width: videoStream.width,
        height: videoStream.height,
        duration: metadata.format.duration || 0,
      });
    });
  });
}

interface CropParams {
  width: number;
  height: number;
  x: number;
  y: number;
}

function calculateCropParams(
  videoWidth: number,
  videoHeight: number,
  aspectRatio: ClipAspectRatio
): CropParams {
  let targetWidth: number;
  let targetHeight: number;

  switch (aspectRatio) {
    case "VERTICAL": // 9:16
      targetWidth = Math.min(videoWidth, Math.floor(videoHeight * (9 / 16)));
      targetHeight = Math.floor(targetWidth * (16 / 9));
      break;
    case "SQUARE": // 1:1
      targetWidth = targetHeight = Math.min(videoWidth, videoHeight);
      break;
    case "HORIZONTAL": // 16:9
    default:
      targetWidth = videoWidth;
      targetHeight = Math.floor(targetWidth * (9 / 16));
      break;
  }

  return {
    width: targetWidth,
    height: targetHeight,
    x: Math.floor((videoWidth - targetWidth) / 2),
    y: Math.floor((videoHeight - targetHeight) / 2),
  };
}

function buildVideoFilters(
  cropParams: CropParams,
  withCaptions: boolean,
  subtitlesPath?: string
): string[] {
  const filters: string[] = [];

  // Crop if needed
  if (cropParams.x !== 0 || cropParams.y !== 0) {
    filters.push(
      `crop=${cropParams.width}:${cropParams.height}:${cropParams.x}:${cropParams.y}`
    );
  }

  // Scale to standard sizes
  filters.push(`scale=${cropParams.width}:${cropParams.height}`);

  // Burn in captions if requested
  if (withCaptions && subtitlesPath) {
    // Escape the path for FFmpeg
    const escapedPath = subtitlesPath.replace(/\\/g, "\\\\").replace(/:/g, "\\:");
    filters.push(`subtitles=${escapedPath}`);
  }

  return filters;
}

/**
 * Gets media file duration
 */
export async function getMediaDuration(storageKey: string): Promise<number> {
  const buffer = await downloadFile(storageKey);
  const tempPath = join(tmpdir(), `probe-${Date.now()}.mp4`);
  await writeFile(tempPath, buffer);

  try {
    const info = await getVideoInfo(tempPath);
    return info.duration;
  } finally {
    await unlink(tempPath).catch(() => {});
  }
}
