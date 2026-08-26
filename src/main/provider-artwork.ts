const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{6,20}$/;

export function providerArtworkFallbackUrls(
  serviceId: string,
  watchUrl: string
): readonly string[] {
  if (serviceId !== "youtube") {
    return [];
  }

  try {
    const url = new URL(watchUrl);
    const videoId = url.searchParams.get("v");
    if (
      url.protocol !== "https:" ||
      url.hostname !== "www.youtube.com" ||
      url.pathname !== "/watch" ||
      videoId === null ||
      !YOUTUBE_VIDEO_ID.test(videoId)
    ) {
      return [];
    }

    return [
      `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
      `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
    ];
  } catch {
    return [];
  }
}
