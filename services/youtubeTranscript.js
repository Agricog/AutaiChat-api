import axios from 'axios';

// Extract video ID
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

// Get transcript via TranscriptAPI
export async function getYoutubeTranscript(videoUrl) {
  try {
    const videoId = extractVideoId(videoUrl);
    console.log(`[YouTube] Fetching transcript for: ${videoId}`);

    const response = await axios.get('https://transcriptapi.com/api/v2/youtube/transcript', {
      params: {
        video_url: videoId,
        format: 'json'
      },
      headers: {
        'Authorization': `Bearer ${process.env.TRANSCRIPT_API_KEY}`
      }
    });

    const transcript = response.data;
    
    // Combine all text segments
    const fullText = transcript.transcript
      .map(item => item.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    console.log(`[YouTube] ✓ Transcript fetched: ${fullText.split(' ').length} words`);

    return {
      videoId,
      text: fullText,
      wordCount: fullText.split(/\s+/).length,
      method: 'transcriptapi'
    };

  } catch (error) {
    console.error('[YouTube] Error:', error.message);
    throw new Error(`Failed to get transcript: ${error.response?.data?.message || error.message}`);
  }
}

export async function getVideoMetadata(videoId) {
  return {
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
  };
}
