/**
 * Ürün videosu: YouTube / Dailymotion / Vimeo / TikTok / Instagram / Facebook
 * bağlantılarını oynatılabilir gömme (embed) adresine çevirir. Doğrudan video
 * dosyaları (.mp4/.webm) için de <video> ile oynatma bilgisi döndürür.
 */

export type VideoKind =
  | "youtube"
  | "dailymotion"
  | "vimeo"
  | "tiktok"
  | "instagram"
  | "facebook"
  | "file"
  | "unknown";

export interface ParsedVideo {
  kind: VideoKind;
  /** iframe için gömme adresi (kind=file ise boş, dosyanın kendisi oynatılır) */
  embedUrl: string;
  /** Orijinal bağlantı (yedek "orijinalini aç" bağlantısı için) */
  watchUrl: string;
}

function parsed(kind: VideoKind, embedUrl: string, watchUrl: string): ParsedVideo {
  return { kind, embedUrl, watchUrl };
}

const EMPTY: ParsedVideo = { kind: "unknown", embedUrl: "", watchUrl: "" };

const YT_WATCH = /youtube\.com\/watch\?[^#]*?v=([A-Za-z0-9_-]{6,})/i;
const YT_SHORT = /youtube\.com\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{6,})/i;
const YT_BE = /youtu\.be\/([A-Za-z0-9_-]{6,})/i;
const YT_NOCOOKIE = /youtube-nocookie\.com\/embed\/([A-Za-z0-9_-]{6,})/i;

const DM_PATTERNS = [
  /dailymotion\.com\/video\/([A-Za-z0-9]+)/i,
  /dai\.ly\/([A-Za-z0-9]+)/i,
  /dailymotion\.com\/embed\/video\/([A-Za-z0-9]+)/i,
];

const VIMEO_STD = /vimeo\.com\/(?:video\/)?(\d+)(?:\/([a-f0-9]+))?/i;
const VIMEO_MANAGE = /vimeo\.com\/manage\/videos\/(\d+)/i;

const TIKTOK = /tiktok\.com\/@[^/]+\/video\/(\d+)/i;
const TIKTOK_EMBED = /tiktok\.com\/embed\/v2\/(\d+)/i;
const INSTAGRAM = /instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i;
const FB_WATCH = /facebook\.com\/watch\?(?:[^#]*?&)?v=(\d+)/i;
const FB_VIDEO = /facebook\.com\/.+\/videos\/(\d+)/i;

const FILE_EXT = /\.(mp4|webm|ogg|mov)(\?.*)?$/i;

export function parseVideoUrl(raw: string | null | undefined): ParsedVideo {
  const url = (raw || "").trim();
  if (!url) return EMPTY;

  const ytId =
    url.match(YT_WATCH)?.[1] ||
    url.match(YT_SHORT)?.[1] ||
    url.match(YT_BE)?.[1] ||
    url.match(YT_NOCOOKIE)?.[1];
  if (ytId) {
    // Standart gömme adresi iframe ile çekilir. (youtube-nocookie varyantı
    // bazı tarayıcılarda "yapılandırma hatası (153)" veriyor.)
    return parsed("youtube", `https://www.youtube.com/embed/${ytId}`, url);
  }

  for (const re of DM_PATTERNS) {
    const m = url.match(re);
    if (m) return parsed("dailymotion", `https://www.dailymotion.com/embed/video/${m[1]}`, url);
  }

  const vimeoStd = url.match(VIMEO_STD);
  if (vimeoStd) {
    const hash = vimeoStd[2] ? `?h=${vimeoStd[2]}` : "";
    return parsed("vimeo", `https://player.vimeo.com/video/${vimeoStd[1]}${hash}`, url);
  }
  const vimeoManage = url.match(VIMEO_MANAGE);
  if (vimeoManage) {
    return parsed("vimeo", `https://player.vimeo.com/video/${vimeoManage[1]}`, url);
  }

  const tiktokId = url.match(TIKTOK)?.[1] || url.match(TIKTOK_EMBED)?.[1];
  if (tiktokId) {
    return parsed("tiktok", `https://www.tiktok.com/embed/v2/${tiktokId}`, url);
  }

  const igId = url.match(INSTAGRAM)?.[1];
  if (igId) {
    return parsed("instagram", `https://www.instagram.com/reel/${igId}/embed`, url);
  }

  const fbId = url.match(FB_WATCH)?.[1] || url.match(FB_VIDEO)?.[1];
  if (fbId) {
    void fbId;
    return parsed(
      "facebook",
      `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false`,
      url
    );
  }

  if (FILE_EXT.test(url) || url.startsWith("/uploads/")) {
    return parsed("file", "", url);
  }
  return { ...EMPTY, watchUrl: url };
}

/** Video sekmesi/oynatıcının gösterilip gösterilmeyeceği. */
export function isPlayableVideoUrl(raw: string | null | undefined): boolean {
  return parseVideoUrl(raw).kind !== "unknown";
}

/** Tanınmayan bağlantılarda bile orijinal sayfaya gidiş için kullanılır. */
export function videoWatchUrl(raw: string | null | undefined): string {
  return (raw || "").trim();
}

export const VIDEO_HINT =
  "YouTube, Dailymotion, Vimeo, TikTok, Instagram veya Facebook bağlantısı yapıştırın (örn. https://www.youtube.com/watch?v=…)";

export const VIDEO_UNKNOWN_HINT =
  "Bu bağlantı doğrudan oynatılamıyor — ürün sayfasında 'Orijinal videoyu aç' bağlantısı olarak gösterilecek.";
