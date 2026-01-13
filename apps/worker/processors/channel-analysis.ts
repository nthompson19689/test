import { prisma } from "../../../lib/db";
import {
  extractChannelIdentifier,
  getChannelByIdentifier,
  getChannelVideos,
  analyzeVideoSEO,
  analyzeChannelSEO,
  type YouTubeChannelInfo,
  type VideoSEOAnalysis,
  type ChannelSEOAnalysis,
} from "../../../lib/youtube";

export interface AnalyzeChannelJobPayload {
  channelUrl: string;
  userId: string;
  maxVideos?: number;
}

export async function processChannelAnalysis(jobId: string): Promise<{
  analysisId: string;
  channelTitle: string;
  videosAnalyzed: number;
  overallScore: number;
}> {
  const job = await prisma.job.findUnique({ where: { id: jobId } });

  if (!job) {
    throw new Error("Job not found");
  }

  const payload = job.payload as AnalyzeChannelJobPayload;
  const { channelUrl, userId, maxVideos = 50 } = payload;

  console.log(`[ChannelAnalysis] Starting analysis for URL: ${channelUrl}`);

  // Extract channel identifier from URL
  const identifier = extractChannelIdentifier(channelUrl);
  if (!identifier) {
    throw new Error(`Invalid YouTube channel URL: ${channelUrl}`);
  }

  console.log(`[ChannelAnalysis] Extracted identifier: ${identifier.type} = ${identifier.value}`);

  // Fetch channel info
  const channelInfo = await getChannelByIdentifier(identifier);
  if (!channelInfo) {
    throw new Error(`Could not find YouTube channel for URL: ${channelUrl}`);
  }

  console.log(`[ChannelAnalysis] Found channel: ${channelInfo.title} (${channelInfo.id})`);

  // Fetch channel videos
  console.log(`[ChannelAnalysis] Fetching up to ${maxVideos} videos...`);
  const videos = await getChannelVideos(channelInfo.id, maxVideos);
  console.log(`[ChannelAnalysis] Fetched ${videos.length} videos`);

  // Analyze each video's SEO
  console.log(`[ChannelAnalysis] Analyzing video SEO...`);
  const videoAnalyses: VideoSEOAnalysis[] = videos.map((video) => analyzeVideoSEO(video));

  // Analyze overall channel SEO
  console.log(`[ChannelAnalysis] Analyzing channel SEO...`);
  const channelAnalysis: ChannelSEOAnalysis = analyzeChannelSEO(channelInfo, videoAnalyses);

  // Store results in database
  const analysis = await prisma.channelAnalysis.create({
    data: {
      userId,
      channelId: channelInfo.id,
      channelUrl,
      channelTitle: channelInfo.title,
      channelDescription: channelInfo.description,
      subscriberCount: channelInfo.subscriberCount ? BigInt(channelInfo.subscriberCount) : null,
      videoCount: channelInfo.videoCount,
      viewCount: channelInfo.viewCount ? BigInt(channelInfo.viewCount) : null,
      thumbnailUrl: channelInfo.thumbnailUrl,
      videosAnalyzed: videoAnalyses.map((v) => ({
        videoId: v.video.id,
        title: v.video.title,
        publishedAt: v.video.publishedAt,
        seoScore: v.seoScore,
        viewCount: v.video.viewCount,
        likeCount: v.video.likeCount,
        issues: v.issues,
        strengths: v.strengths,
      })),
      overallScore: channelAnalysis.overallScore,
      recommendations: {
        categoryBreakdown: channelAnalysis.categoryBreakdown,
        recommendations: channelAnalysis.recommendations,
      },
      rawData: {
        channel: channelInfo,
        videoCount: videos.length,
        fetchedAt: new Date().toISOString(),
      },
    },
  });

  console.log(`[ChannelAnalysis] Analysis complete. ID: ${analysis.id}, Score: ${channelAnalysis.overallScore}`);

  return {
    analysisId: analysis.id,
    channelTitle: channelInfo.title,
    videosAnalyzed: videos.length,
    overallScore: channelAnalysis.overallScore,
  };
}
