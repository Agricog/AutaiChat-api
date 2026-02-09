import axios from 'axios';

// Extract video ID from various YouTube URL formats
function extractVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /^([a-zA-Z0-9_-]{11})$/
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  throw new Error('Invalid YouTube URL format');
}

// Get transcript via TranscriptAPI v2
export async function getYoutubeTranscript(videoUrl) {
  try {
    const videoId = extractVideoId(videoUrl);
    const fullUrl = `https://www.youtube.com/watch?v=${videoId}`;

    console.log(`[YouTube] Fetching transcript for: ${videoId}`);

    const response = await axios.get('https://transcriptapi.com/api/v2/youtube/transcript', {
      params: {
        video_url: fullUrl,
        format: 'json'
      },
      headers: {
        'Authorization': `Bearer ${process.env.TRANSCRIPT_API_KEY}`
      },
      timeout: 30000
    });

    const data = response.data;

    // v2 API returns "segments" array with { start, text } objects
    const segments = data.segments || data.transcript || [];

    if (!segments || segments.length === 0) {
      throw new Error('No transcript available for this video. The video may not have captions enabled.');
    }

    // Combine all text segments
    const fullText = segments
      .map(item => item.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    const wordCount = fullText.split(/\s+/).length;

    console.log(`[YouTube] ✓ Transcript fetched: ${wordCount} words`);

    return {
      videoId,
      text: fullText,
      wordCount,
      duration: data.duration || null,
      title: data.title || null,
      method: 'transcriptapi-v2'
    };
  } catch (error) {
    console.error('[YouTube] Error:', error.message);

    if (error.response?.status === 404) {
      throw new Error('No transcript found for this video. The video may not have captions or subtitles available.');
    }

    if (error.response?.status === 401) {
      throw new Error('TranscriptAPI authentication failed. Check TRANSCRIPT_API_KEY.');
    }

    if (error.response?.status === 429) {
      throw new Error('TranscriptAPI rate limit reached. Please try again in a moment.');
    }

    throw new Error(`Failed to get transcript: ${error.response?.data?.message || error.response?.data?.error || error.message}`);
  }
}

// Get basic video metadata
export async function getVideoMetadata(videoId) {
  return {
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
  };
}
