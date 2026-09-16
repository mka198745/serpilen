/**
 * Ürün videosu: YouTube / Dailymotion / Vimeo bağlantılarını oynatılabilir
 * gömme (embed) adresine çevirir. Doğrudan video dosyaları (.mp4/.webm)
 * için de <video> ile oynatma bilgisi döndürür.
 */

export type VideoKind = "youtube" | "dailymotion" | "vimeo" | "file" | "unknown";

export interface ParsedVideo {
  kind: VideoKind;
  /** iframe için gömme adresi (kind=file ise boş, dosyanın kendisi oynatılır) */
  embedUrl: string;
}

const YT_PATTERNS = [
  /youtube\.com\/watch\?[^#]*?v=([A-Za-z0-9_-]{6,})/i,
  /youtube\.com\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{6,})/i,
  /youtu\.be\/([A-Za-z0-9_-]{6,})/i,
];

const DM_PATTERNS = [
  /dailymotion\.com\/video\/([A-Za-z0-9]+)/i,
  /dai\.ly\/([A-Za-z0-9]+)/i,
  /dailymotion\.com\/embed\/video\/([A-Za-z0-9]+)/i,
];

const VIMEO_PATTERNS = [
  /vimeo\.com\/(?:video\/)?(\d+)/i,
  /player\.vimeo\.com\/video\/(\d+)/i,
];

const FILE_EXT = /\.(mp4|webm|ogg|mov)(\?.*)?$/i;

export function parseVideoUrl(raw: string | null | undefined): ParsedVideo {
  const url = (raw || "").trim();
  if (!url) return { kind: "unknown", embedUrl: "" };

  for (const re of YT_PATTERNS) {
    const m = url.match(re);
    if (m) return { kind: "youtube", embedUrl: `https://www.youtube.com/embed/${m[1]}` };
  }
  for (const re of DM_PATTERNS) {
    const m = url.match(re);
    if (m) return { kind: "dailymotion", embedUrl: `https://www.dailymotion.com/embed/video/${m[1]}` };
  }
  for (const re of VIMEO_PATTERNS) {
    const m = url.match(re);
    if (m) return { kind: "vimeo", embedUrl: `https://player.vimeo.com/video/${m[1]}` };
  }
  if (FILE_EXT.test(url) || url.startsWith("/uploads/")) {
    return { kind: "file", embedUrl: "" };
  }
  return { kind: "unknown", embedUrl: "" };
}

/** Video sekmesi/oynatıcının gösterilip gösterilmeyeceği. */
export function isPlayableVideoUrl(raw: string | null | undefined): boolean {
  return parseVideoUrl(raw).kind !== "unknown";
}

export const VIDEO_HINT =
  "YouTube, Dailymotion veya Vimeo bağlantısı yapıştırın (örn. https://www.youtube.com/watch?v=… veya https://dai.ly/…)";
