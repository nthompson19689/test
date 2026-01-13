/**
 * YouTube Data API client for channel and video fetching
 */

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

export interface YouTubeChannelInfo {
  id: string;
  title: string;
  description: string;
  customUrl?: string;
  publishedAt: string;
  thumbnailUrl?: string;
  subscriberCount?: number;
  videoCount?: number;
  viewCount?: number;
  country?: string;
  keywords?: string[];
  bannerUrl?: string;
}

export interface YouTubeVideoInfo {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  thumbnailUrl?: string;
  thumbnailWidth?: number;
  thumbnailHeight?: number;
  channelId: string;
  channelTitle: string;
  tags?: string[];
  categoryId?: string;
  defaultLanguage?: string;
  defaultAudioLanguage?: string;
  duration?: string;
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
  caption?: boolean;
  licensedContent?: boolean;
}

export interface VideoSEOAnalysis {
  video: YouTubeVideoInfo;
  seoScore: number;
  issues: SEOIssue[];
  strengths: string[];
}

export interface SEOIssue {
  type: 'critical' | 'warning' | 'suggestion';
  category: string;
  message: string;
  recommendation: string;
}

export interface ChannelSEOAnalysis {
  channel: YouTubeChannelInfo;
  videos: VideoSEOAnalysis[];
  overallScore: number;
  categoryBreakdown: {
    titles: number;
    descriptions: number;
    tags: number;
    thumbnails: number;
    consistency: number;
    engagement: number;
  };
  recommendations: ChannelRecommendation[];
}

export interface ChannelRecommendation {
  priority: 'high' | 'medium' | 'low';
  category: string;
  title: string;
  description: string;
  actionItems: string[];
  affectedVideos?: string[];
}

/**
 * Extract channel ID from various YouTube URL formats
 */
export function extractChannelIdentifier(url: string): { type: 'id' | 'username' | 'handle' | 'custom'; value: string } | null {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;

    // Format: youtube.com/channel/UC... (channel ID)
    const channelMatch = pathname.match(/\/channel\/(UC[\w-]+)/);
    if (channelMatch) {
      return { type: 'id', value: channelMatch[1] };
    }

    // Format: youtube.com/@handle
    const handleMatch = pathname.match(/\/@([\w.-]+)/);
    if (handleMatch) {
      return { type: 'handle', value: handleMatch[1] };
    }

    // Format: youtube.com/c/CustomName or youtube.com/user/Username
    const customMatch = pathname.match(/\/(?:c|user)\/([\w.-]+)/);
    if (customMatch) {
      return { type: 'custom', value: customMatch[1] };
    }

    // Format: youtube.com/CustomName (legacy custom URLs)
    const legacyMatch = pathname.match(/^\/([\w.-]+)$/);
    if (legacyMatch && !['watch', 'feed', 'results', 'playlist', 'shorts'].includes(legacyMatch[1])) {
      return { type: 'custom', value: legacyMatch[1] };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Get YouTube API key from environment
 */
function getApiKey(): string {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new Error('YOUTUBE_API_KEY environment variable is not set');
  }
  return apiKey;
}

/**
 * Fetch channel information by channel ID
 */
export async function getChannelById(channelId: string): Promise<YouTubeChannelInfo | null> {
  const apiKey = getApiKey();
  const url = `${YOUTUBE_API_BASE}/channels?part=snippet,statistics,brandingSettings&id=${channelId}&key=${apiKey}`;

  const response = await fetch(url);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`YouTube API error: ${error.error?.message || response.statusText}`);
  }

  const data = await response.json();
  if (!data.items || data.items.length === 0) {
    return null;
  }

  return mapChannelResponse(data.items[0]);
}

/**
 * Fetch channel information by username or handle
 */
export async function getChannelByIdentifier(identifier: { type: 'id' | 'username' | 'handle' | 'custom'; value: string }): Promise<YouTubeChannelInfo | null> {
  const apiKey = getApiKey();

  if (identifier.type === 'id') {
    return getChannelById(identifier.value);
  }

  // For handles, usernames, and custom URLs, we need to search
  let searchParam: string;
  if (identifier.type === 'handle') {
    // Try forHandle parameter first (newer API)
    const handleUrl = `${YOUTUBE_API_BASE}/channels?part=snippet,statistics,brandingSettings&forHandle=${identifier.value}&key=${apiKey}`;
    const handleResponse = await fetch(handleUrl);
    if (handleResponse.ok) {
      const data = await handleResponse.json();
      if (data.items && data.items.length > 0) {
        return mapChannelResponse(data.items[0]);
      }
    }
    // Fall back to search
    searchParam = `@${identifier.value}`;
  } else {
    searchParam = identifier.value;
  }

  // Search for the channel
  const searchUrl = `${YOUTUBE_API_BASE}/search?part=snippet&type=channel&q=${encodeURIComponent(searchParam)}&maxResults=1&key=${apiKey}`;
  const searchResponse = await fetch(searchUrl);
  if (!searchResponse.ok) {
    const error = await searchResponse.json();
    throw new Error(`YouTube API error: ${error.error?.message || searchResponse.statusText}`);
  }

  const searchData = await searchResponse.json();
  if (!searchData.items || searchData.items.length === 0) {
    return null;
  }

  // Get full channel details
  return getChannelById(searchData.items[0].snippet.channelId);
}

/**
 * Fetch all videos from a channel (paginated)
 */
export async function getChannelVideos(channelId: string, maxVideos: number = 50): Promise<YouTubeVideoInfo[]> {
  const apiKey = getApiKey();
  const videos: YouTubeVideoInfo[] = [];
  let pageToken: string | undefined;

  // First, get the uploads playlist ID
  const channelUrl = `${YOUTUBE_API_BASE}/channels?part=contentDetails&id=${channelId}&key=${apiKey}`;
  const channelResponse = await fetch(channelUrl);
  if (!channelResponse.ok) {
    throw new Error('Failed to fetch channel content details');
  }
  const channelData = await channelResponse.json();
  const uploadsPlaylistId = channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;

  if (!uploadsPlaylistId) {
    throw new Error('Could not find uploads playlist for channel');
  }

  // Fetch videos from uploads playlist
  while (videos.length < maxVideos) {
    const playlistUrl = `${YOUTUBE_API_BASE}/playlistItems?part=snippet,contentDetails&playlistId=${uploadsPlaylistId}&maxResults=${Math.min(50, maxVideos - videos.length)}&key=${apiKey}${pageToken ? `&pageToken=${pageToken}` : ''}`;

    const playlistResponse = await fetch(playlistUrl);
    if (!playlistResponse.ok) {
      break;
    }

    const playlistData = await playlistResponse.json();
    const videoIds = playlistData.items?.map((item: { contentDetails?: { videoId?: string } }) => item.contentDetails?.videoId).filter(Boolean);

    if (!videoIds || videoIds.length === 0) {
      break;
    }

    // Get detailed video info
    const videoDetails = await getVideoDetails(videoIds);
    videos.push(...videoDetails);

    pageToken = playlistData.nextPageToken;
    if (!pageToken) {
      break;
    }
  }

  return videos;
}

/**
 * Get detailed information for multiple videos
 */
export async function getVideoDetails(videoIds: string[]): Promise<YouTubeVideoInfo[]> {
  const apiKey = getApiKey();
  const videos: YouTubeVideoInfo[] = [];

  // YouTube API allows max 50 video IDs per request
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const url = `${YOUTUBE_API_BASE}/videos?part=snippet,contentDetails,statistics&id=${batch.join(',')}&key=${apiKey}`;

    const response = await fetch(url);
    if (!response.ok) {
      continue;
    }

    const data = await response.json();
    if (data.items) {
      videos.push(...data.items.map(mapVideoResponse));
    }
  }

  return videos;
}

/**
 * Map YouTube API channel response to our interface
 */
function mapChannelResponse(item: {
  id: string;
  snippet?: {
    title?: string;
    description?: string;
    customUrl?: string;
    publishedAt?: string;
    thumbnails?: {
      high?: { url?: string };
      medium?: { url?: string };
      default?: { url?: string };
    };
    country?: string;
  };
  statistics?: {
    subscriberCount?: string;
    videoCount?: string;
    viewCount?: string;
  };
  brandingSettings?: {
    channel?: {
      keywords?: string;
    };
    image?: {
      bannerExternalUrl?: string;
    };
  };
}): YouTubeChannelInfo {
  return {
    id: item.id,
    title: item.snippet?.title || '',
    description: item.snippet?.description || '',
    customUrl: item.snippet?.customUrl,
    publishedAt: item.snippet?.publishedAt || '',
    thumbnailUrl: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url,
    subscriberCount: item.statistics?.subscriberCount ? parseInt(item.statistics.subscriberCount, 10) : undefined,
    videoCount: item.statistics?.videoCount ? parseInt(item.statistics.videoCount, 10) : undefined,
    viewCount: item.statistics?.viewCount ? parseInt(item.statistics.viewCount, 10) : undefined,
    country: item.snippet?.country,
    keywords: item.brandingSettings?.channel?.keywords?.split(',').map((k: string) => k.trim()).filter(Boolean),
    bannerUrl: item.brandingSettings?.image?.bannerExternalUrl,
  };
}

/**
 * Map YouTube API video response to our interface
 */
function mapVideoResponse(item: {
  id: string;
  snippet?: {
    title?: string;
    description?: string;
    publishedAt?: string;
    thumbnails?: {
      maxres?: { url?: string; width?: number; height?: number };
      high?: { url?: string; width?: number; height?: number };
      medium?: { url?: string; width?: number; height?: number };
      default?: { url?: string; width?: number; height?: number };
    };
    channelId?: string;
    channelTitle?: string;
    tags?: string[];
    categoryId?: string;
    defaultLanguage?: string;
    defaultAudioLanguage?: string;
  };
  contentDetails?: {
    duration?: string;
    caption?: string;
    licensedContent?: boolean;
  };
  statistics?: {
    viewCount?: string;
    likeCount?: string;
    commentCount?: string;
  };
}): YouTubeVideoInfo {
  const thumbnail = item.snippet?.thumbnails?.maxres || item.snippet?.thumbnails?.high || item.snippet?.thumbnails?.medium || item.snippet?.thumbnails?.default;

  return {
    id: item.id,
    title: item.snippet?.title || '',
    description: item.snippet?.description || '',
    publishedAt: item.snippet?.publishedAt || '',
    thumbnailUrl: thumbnail?.url,
    thumbnailWidth: thumbnail?.width,
    thumbnailHeight: thumbnail?.height,
    channelId: item.snippet?.channelId || '',
    channelTitle: item.snippet?.channelTitle || '',
    tags: item.snippet?.tags,
    categoryId: item.snippet?.categoryId,
    defaultLanguage: item.snippet?.defaultLanguage,
    defaultAudioLanguage: item.snippet?.defaultAudioLanguage,
    duration: item.contentDetails?.duration,
    viewCount: item.statistics?.viewCount ? parseInt(item.statistics.viewCount, 10) : undefined,
    likeCount: item.statistics?.likeCount ? parseInt(item.statistics.likeCount, 10) : undefined,
    commentCount: item.statistics?.commentCount ? parseInt(item.statistics.commentCount, 10) : undefined,
    caption: item.contentDetails?.caption === 'true',
    licensedContent: item.contentDetails?.licensedContent,
  };
}

/**
 * Parse ISO 8601 duration to seconds
 */
export function parseDuration(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;

  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);

  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Analyze a single video's SEO
 */
export function analyzeVideoSEO(video: YouTubeVideoInfo): VideoSEOAnalysis {
  const issues: SEOIssue[] = [];
  const strengths: string[] = [];
  let score = 100;

  // Title analysis (25 points max)
  const titleLength = video.title.length;
  if (titleLength === 0) {
    issues.push({
      type: 'critical',
      category: 'title',
      message: 'Video has no title',
      recommendation: 'Add a descriptive, keyword-rich title (50-60 characters ideal)',
    });
    score -= 25;
  } else if (titleLength < 20) {
    issues.push({
      type: 'warning',
      category: 'title',
      message: `Title is too short (${titleLength} characters)`,
      recommendation: 'Expand title to 50-60 characters with relevant keywords',
    });
    score -= 10;
  } else if (titleLength > 70) {
    issues.push({
      type: 'suggestion',
      category: 'title',
      message: `Title may be truncated in search results (${titleLength} characters)`,
      recommendation: 'Keep title under 60-70 characters for full visibility',
    });
    score -= 5;
  } else {
    strengths.push('Title length is optimal for search visibility');
  }

  // Check for clickbait patterns (all caps)
  if (video.title === video.title.toUpperCase() && titleLength > 10) {
    issues.push({
      type: 'suggestion',
      category: 'title',
      message: 'Title is in all caps which may appear spammy',
      recommendation: 'Use title case for better professionalism',
    });
    score -= 3;
  }

  // Description analysis (25 points max)
  const descLength = video.description.length;
  if (descLength === 0) {
    issues.push({
      type: 'critical',
      category: 'description',
      message: 'Video has no description',
      recommendation: 'Add a detailed description (200-500 words) with keywords and timestamps',
    });
    score -= 25;
  } else if (descLength < 100) {
    issues.push({
      type: 'warning',
      category: 'description',
      message: `Description is very short (${descLength} characters)`,
      recommendation: 'Expand to at least 200-300 words with keywords, links, and timestamps',
    });
    score -= 15;
  } else if (descLength < 250) {
    issues.push({
      type: 'suggestion',
      category: 'description',
      message: `Description could be more detailed (${descLength} characters)`,
      recommendation: 'Consider adding more context, timestamps, or relevant links',
    });
    score -= 5;
  } else {
    strengths.push('Description has good length for SEO');
  }

  // Check for timestamps in description
  const hasTimestamps = /\d{1,2}:\d{2}/.test(video.description);
  if (hasTimestamps) {
    strengths.push('Description includes timestamps (good for chapters)');
  } else if (video.duration && parseDuration(video.duration) > 300) {
    issues.push({
      type: 'suggestion',
      category: 'description',
      message: 'Long video without timestamps in description',
      recommendation: 'Add timestamps for video chapters to improve navigation and SEO',
    });
    score -= 3;
  }

  // Check for links in description
  const hasLinks = /https?:\/\//.test(video.description);
  if (hasLinks) {
    strengths.push('Description includes links');
  }

  // Tags analysis (20 points max)
  const tagCount = video.tags?.length || 0;
  if (tagCount === 0) {
    issues.push({
      type: 'warning',
      category: 'tags',
      message: 'Video has no tags',
      recommendation: 'Add 5-15 relevant tags including primary keyword variations',
    });
    score -= 15;
  } else if (tagCount < 5) {
    issues.push({
      type: 'suggestion',
      category: 'tags',
      message: `Video has only ${tagCount} tag(s)`,
      recommendation: 'Add more tags (8-15 recommended) for better discoverability',
    });
    score -= 8;
  } else if (tagCount > 15) {
    strengths.push(`Good number of tags (${tagCount})`);
  } else {
    strengths.push(`Adequate tags (${tagCount})`);
  }

  // Thumbnail analysis (15 points max)
  if (!video.thumbnailUrl) {
    issues.push({
      type: 'warning',
      category: 'thumbnail',
      message: 'No custom thumbnail detected',
      recommendation: 'Upload a custom thumbnail with text overlay and engaging visuals',
    });
    score -= 15;
  } else if (video.thumbnailWidth && video.thumbnailWidth < 1280) {
    issues.push({
      type: 'suggestion',
      category: 'thumbnail',
      message: 'Thumbnail resolution may be low',
      recommendation: 'Use 1280x720 (HD) resolution for thumbnails',
    });
    score -= 5;
  } else {
    strengths.push('Has thumbnail');
  }

  // Captions analysis (10 points max)
  if (video.caption) {
    strengths.push('Video has captions/subtitles (improves accessibility and SEO)');
  } else {
    issues.push({
      type: 'suggestion',
      category: 'accessibility',
      message: 'No captions detected',
      recommendation: 'Add closed captions to improve accessibility and SEO',
    });
    score -= 5;
  }

  // Engagement analysis (5 points max)
  if (video.viewCount && video.likeCount) {
    const likeRatio = video.likeCount / video.viewCount;
    if (likeRatio > 0.04) {
      strengths.push('High engagement ratio');
    } else if (likeRatio < 0.01) {
      issues.push({
        type: 'suggestion',
        category: 'engagement',
        message: 'Low engagement ratio',
        recommendation: 'Encourage likes with CTAs and engaging content',
      });
      score -= 3;
    }
  }

  return {
    video,
    seoScore: Math.max(0, Math.min(100, score)),
    issues,
    strengths,
  };
}

/**
 * Analyze a channel's overall SEO
 */
export function analyzeChannelSEO(channel: YouTubeChannelInfo, videoAnalyses: VideoSEOAnalysis[]): ChannelSEOAnalysis {
  const recommendations: ChannelRecommendation[] = [];

  // Calculate category scores
  const titleScores = videoAnalyses.map(v => {
    const titleIssues = v.issues.filter(i => i.category === 'title');
    return titleIssues.length === 0 ? 100 : Math.max(0, 100 - titleIssues.reduce((sum, i) => sum + (i.type === 'critical' ? 30 : i.type === 'warning' ? 15 : 5), 0));
  });

  const descScores = videoAnalyses.map(v => {
    const descIssues = v.issues.filter(i => i.category === 'description');
    return descIssues.length === 0 ? 100 : Math.max(0, 100 - descIssues.reduce((sum, i) => sum + (i.type === 'critical' ? 30 : i.type === 'warning' ? 15 : 5), 0));
  });

  const tagScores = videoAnalyses.map(v => {
    const tagIssues = v.issues.filter(i => i.category === 'tags');
    return tagIssues.length === 0 ? 100 : Math.max(0, 100 - tagIssues.reduce((sum, i) => sum + (i.type === 'critical' ? 30 : i.type === 'warning' ? 15 : 5), 0));
  });

  const thumbScores = videoAnalyses.map(v => {
    const thumbIssues = v.issues.filter(i => i.category === 'thumbnail');
    return thumbIssues.length === 0 ? 100 : Math.max(0, 100 - thumbIssues.reduce((sum, i) => sum + (i.type === 'critical' ? 30 : i.type === 'warning' ? 15 : 5), 0));
  });

  const avgTitle = titleScores.length > 0 ? titleScores.reduce((a, b) => a + b, 0) / titleScores.length : 0;
  const avgDesc = descScores.length > 0 ? descScores.reduce((a, b) => a + b, 0) / descScores.length : 0;
  const avgTags = tagScores.length > 0 ? tagScores.reduce((a, b) => a + b, 0) / tagScores.length : 0;
  const avgThumb = thumbScores.length > 0 ? thumbScores.reduce((a, b) => a + b, 0) / thumbScores.length : 0;

  // Calculate consistency score (how similar is the branding/style)
  const consistencyScore = calculateConsistencyScore(videoAnalyses);

  // Calculate engagement score
  const engagementScore = calculateEngagementScore(videoAnalyses);

  const categoryBreakdown = {
    titles: Math.round(avgTitle),
    descriptions: Math.round(avgDesc),
    tags: Math.round(avgTags),
    thumbnails: Math.round(avgThumb),
    consistency: consistencyScore,
    engagement: engagementScore,
  };

  // Overall score (weighted average)
  const overallScore = Math.round(
    avgTitle * 0.20 +
    avgDesc * 0.20 +
    avgTags * 0.15 +
    avgThumb * 0.15 +
    consistencyScore * 0.15 +
    engagementScore * 0.15
  );

  // Generate channel-level recommendations
  generateChannelRecommendations(channel, videoAnalyses, categoryBreakdown, recommendations);

  return {
    channel,
    videos: videoAnalyses,
    overallScore,
    categoryBreakdown,
    recommendations,
  };
}

/**
 * Calculate consistency score based on title/description patterns
 */
function calculateConsistencyScore(videoAnalyses: VideoSEOAnalysis[]): number {
  if (videoAnalyses.length < 2) return 100;

  let score = 100;

  // Check title length consistency
  const titleLengths = videoAnalyses.map(v => v.video.title.length);
  const avgTitleLength = titleLengths.reduce((a, b) => a + b, 0) / titleLengths.length;
  const titleVariance = titleLengths.reduce((sum, len) => sum + Math.pow(len - avgTitleLength, 2), 0) / titleLengths.length;
  if (titleVariance > 400) {
    score -= 15;
  }

  // Check for consistent tag usage
  const tagSets = videoAnalyses.map(v => new Set(v.video.tags || []));
  const allTags = new Set<string>();
  tagSets.forEach(set => set.forEach(tag => allTags.add(tag.toLowerCase())));

  // Count how many videos each tag appears in
  const tagFrequency = new Map<string, number>();
  tagSets.forEach(set => {
    set.forEach(tag => {
      const lower = tag.toLowerCase();
      tagFrequency.set(lower, (tagFrequency.get(lower) || 0) + 1);
    });
  });

  // Check for common channel tags
  const commonTags = Array.from(tagFrequency.entries()).filter(([, count]) => count >= videoAnalyses.length * 0.5);
  if (commonTags.length < 3 && videoAnalyses.length > 5) {
    score -= 10;
  }

  // Check description structure consistency
  const hasTimestamps = videoAnalyses.map(v => /\d{1,2}:\d{2}/.test(v.video.description));
  const timestampConsistency = hasTimestamps.filter(Boolean).length / videoAnalyses.length;
  if (timestampConsistency > 0.3 && timestampConsistency < 0.7) {
    score -= 10;
  }

  return Math.max(0, score);
}

/**
 * Calculate engagement score
 */
function calculateEngagementScore(videoAnalyses: VideoSEOAnalysis[]): number {
  const engagementRatios = videoAnalyses
    .filter(v => v.video.viewCount && v.video.viewCount > 0 && v.video.likeCount)
    .map(v => (v.video.likeCount || 0) / (v.video.viewCount || 1));

  if (engagementRatios.length === 0) return 50;

  const avgEngagement = engagementRatios.reduce((a, b) => a + b, 0) / engagementRatios.length;

  // Benchmark: 4% is considered good engagement
  if (avgEngagement >= 0.05) return 100;
  if (avgEngagement >= 0.04) return 90;
  if (avgEngagement >= 0.03) return 75;
  if (avgEngagement >= 0.02) return 60;
  if (avgEngagement >= 0.01) return 40;
  return 20;
}

/**
 * Generate channel-level recommendations
 */
function generateChannelRecommendations(
  channel: YouTubeChannelInfo,
  videoAnalyses: VideoSEOAnalysis[],
  categoryBreakdown: { titles: number; descriptions: number; tags: number; thumbnails: number; consistency: number; engagement: number },
  recommendations: ChannelRecommendation[]
): void {
  // Channel-level issues
  if (!channel.description || channel.description.length < 100) {
    recommendations.push({
      priority: 'high',
      category: 'channel',
      title: 'Improve Channel Description',
      description: 'Your channel description is too short or missing. A detailed channel description helps YouTube understand your content and improves discoverability.',
      actionItems: [
        'Write a 200-500 word channel description',
        'Include your main topics and keywords',
        'Add links to your website and social media',
        'Mention your upload schedule',
      ],
    });
  }

  if (!channel.keywords || channel.keywords.length < 5) {
    recommendations.push({
      priority: 'high',
      category: 'channel',
      title: 'Add Channel Keywords',
      description: 'Channel keywords help YouTube categorize your content and suggest it to relevant viewers.',
      actionItems: [
        'Add 10-20 relevant channel keywords in YouTube Studio',
        'Include your niche, topics, and brand name',
        'Use a mix of broad and specific keywords',
      ],
    });
  }

  // Title recommendations
  if (categoryBreakdown.titles < 70) {
    const poorTitleVideos = videoAnalyses
      .filter(v => v.issues.some(i => i.category === 'title'))
      .map(v => v.video.title);

    recommendations.push({
      priority: categoryBreakdown.titles < 50 ? 'high' : 'medium',
      category: 'titles',
      title: 'Optimize Video Titles',
      description: `${poorTitleVideos.length} videos have suboptimal titles that may hurt discoverability.`,
      actionItems: [
        'Keep titles between 50-60 characters',
        'Front-load important keywords',
        'Use numbers and power words when relevant',
        'Avoid clickbait and all-caps titles',
      ],
      affectedVideos: poorTitleVideos.slice(0, 5),
    });
  }

  // Description recommendations
  if (categoryBreakdown.descriptions < 70) {
    const poorDescVideos = videoAnalyses
      .filter(v => v.issues.some(i => i.category === 'description'))
      .map(v => v.video.title);

    recommendations.push({
      priority: categoryBreakdown.descriptions < 50 ? 'high' : 'medium',
      category: 'descriptions',
      title: 'Enhance Video Descriptions',
      description: `${poorDescVideos.length} videos have weak descriptions that limit SEO potential.`,
      actionItems: [
        'Write 200-500 word descriptions for each video',
        'Include timestamps for videos over 5 minutes',
        'Add relevant links and CTAs',
        'Use target keywords naturally in the first 2-3 sentences',
        'Create a description template for consistency',
      ],
      affectedVideos: poorDescVideos.slice(0, 5),
    });
  }

  // Tag recommendations
  if (categoryBreakdown.tags < 70) {
    const poorTagVideos = videoAnalyses
      .filter(v => v.issues.some(i => i.category === 'tags'))
      .map(v => v.video.title);

    recommendations.push({
      priority: 'medium',
      category: 'tags',
      title: 'Improve Video Tags',
      description: `${poorTagVideos.length} videos have missing or insufficient tags.`,
      actionItems: [
        'Add 8-15 relevant tags per video',
        'Include exact match and broad keywords',
        'Use your channel name as a tag',
        'Include common misspellings of important terms',
        'Research competitor tags for ideas',
      ],
      affectedVideos: poorTagVideos.slice(0, 5),
    });
  }

  // Consistency recommendations
  if (categoryBreakdown.consistency < 70) {
    recommendations.push({
      priority: 'medium',
      category: 'consistency',
      title: 'Improve Content Consistency',
      description: 'Your videos lack consistent branding and structure, which can confuse the algorithm.',
      actionItems: [
        'Create title templates/formulas for different content types',
        'Develop a consistent description template',
        'Use consistent intro/outro patterns',
        'Maintain a set of "channel tags" on all videos',
        'Establish a recognizable thumbnail style',
      ],
    });
  }

  // Engagement recommendations
  if (categoryBreakdown.engagement < 60) {
    recommendations.push({
      priority: 'medium',
      category: 'engagement',
      title: 'Boost Viewer Engagement',
      description: 'Your videos have lower than average engagement rates, which affects ranking.',
      actionItems: [
        'Add verbal CTAs asking viewers to like and subscribe',
        'Ask questions to encourage comments',
        'Use YouTube Cards and End Screens',
        'Respond to comments to build community',
        'Create content that addresses viewer pain points',
      ],
    });
  }

  // Upload consistency
  if (videoAnalyses.length > 5) {
    const dates = videoAnalyses.map(v => new Date(v.video.publishedAt).getTime()).sort((a, b) => b - a);
    const gaps = [];
    for (let i = 0; i < dates.length - 1; i++) {
      gaps.push((dates[i] - dates[i + 1]) / (1000 * 60 * 60 * 24));
    }
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const maxGap = Math.max(...gaps);

    if (maxGap > avgGap * 3 || avgGap > 14) {
      recommendations.push({
        priority: 'low',
        category: 'schedule',
        title: 'Maintain Consistent Upload Schedule',
        description: 'Irregular uploads can hurt channel growth and algorithm favor.',
        actionItems: [
          'Set a realistic upload schedule (1-2 videos per week ideal)',
          'Batch record content to maintain consistency',
          'Use YouTube\'s scheduling feature',
          'Communicate your schedule to subscribers',
        ],
      });
    }
  }
}
