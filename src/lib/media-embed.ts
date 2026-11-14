/**
 * Blog içeriklerinde kullanılan medya URL'lerini gömülü (embed) formata çevirir.
 * İstemci ve sunucuda (server component) kullanılabilir — saf fonksiyonlar.
 */

export function youtubeEmbedSrc(url: string): string | null {
  const m =
    url.match(/youtube\.com\/(?:watch\?(?:[^&\s]*&)*v=|shorts\/|embed\/|live\/)([\w-]{6,})/i) ||
    url.match(/youtu\.be\/([\w-]{6,})/i);
  if (!m) return null;
  return `https://www.youtube.com/embed/${m[1]}`;
}

export function tiktokEmbedSrc(url: string): string | null {
  const m = url.match(/tiktok\.com\/(?:@[\w.-]+\/video\/|embed\/v2\/)(\d{6,})/i);
  if (!m) return null;
  return `https://www.tiktok.com/embed/v2/${m[1]}`;
}

export function instagramEmbedSrc(url: string): string | null {
  const m = url.match(/instagram\.com\/(p|reel|reels|tv)\/([\w-]+)/i);
  if (!m) return null;
  const kind = m[1].toLowerCase() === "reels" ? "reel" : m[1].toLowerCase();
  return `https://www.instagram.com/${kind}/${m[2]}/embed`;
}

/** Görsel kaynağı güvenli mi? (https/http veya yerel /uploads yolu) */
export function isSafeImageSrc(url: string): boolean {
  return /^https?:\/\//i.test(url) || url.startsWith("/uploads/");
}

export type MediaKind = "image" | "youtube" | "tiktok" | "instagram" | "link";

/** URL'nin hangi medya türüne uygun olduğunu tahmin eder (editor doğrulaması için). */
export function detectMediaKind(url: string): MediaKind | null {
  if (youtubeEmbedSrc(url)) return "youtube";
  if (tiktokEmbedSrc(url)) return "tiktok";
  if (instagramEmbedSrc(url)) return "instagram";
  if (isSafeImageSrc(url) && /\.(png|jpe?g|webp|gif|avif|svg)(\?.*)?$/i.test(url)) return "image";
  if (isSafeImageSrc(url)) return "image";
  return null;
}
