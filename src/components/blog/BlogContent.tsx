import React from "react";
import {
  youtubeEmbedSrc,
  tiktokEmbedSrc,
  instagramEmbedSrc,
  isSafeImageSrc,
} from "@/lib/media-embed";
import { ExternalLink } from "lucide-react";

/**
 * Blog içeriğini işler. Metin içinde tek başına bir satırda şu etiketler
 * medya bloğuna dönüşür:
 *
 *   [media:image]https://… veya /uploads/products/…[/media]
 *   [media:youtube]https://www.youtube.com/watch?v=…[/media]
 *   [media:tiktok]https://www.tiktok.com/@kullanici/video/123…[/media]
 *   [media:instagram]https://www.instagram.com/p/ABC…/[/media]
 *
 * Diğer tüm satırlar normal metin (satır sonları korunarak) gösterilir.
 */

export type BlogContentBlock =
  | { type: "text"; text: string }
  | { type: "media"; kind: "image" | "youtube" | "tiktok" | "instagram" | "link"; url: string };

const MEDIA_RE = /^\[media:(image|youtube|tiktok|instagram)\]([\s\S]+?)\[\/media\]$/;

export function parseBlogContent(content: string): BlogContentBlock[] {
  const lines = (content || "").split(/\r?\n/);
  const blocks: BlogContentBlock[] = [];
  let buf: string[] = [];

  const flush = () => {
    const text = buf.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    if (text) blocks.push({ type: "text", text });
    buf = [];
  };

  for (const raw of lines) {
    const m = raw.trim().match(MEDIA_RE);
    if (m) {
      flush();
      blocks.push({ type: "media", kind: m[1] as never, url: m[2].trim() });
    } else {
      buf.push(raw);
    }
  }
  flush();
  return blocks;
}

function MediaFallback({ url, label }: { url: string; label: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border border-stone-200 bg-stone-50 text-xs font-bold text-amber-900 hover:border-amber-400 transition"
    >
      {label} — kaynağı aç
      <ExternalLink className="w-4 h-4" />
    </a>
  );
}

function MediaBlock({ kind, url }: { kind: "image" | "youtube" | "tiktok" | "instagram" | "link"; url: string }) {
  if (kind === "image") {
    if (!isSafeImageSrc(url)) return <MediaFallback url={url} label="Görsel" />;
    return (
      <figure className="rounded-2xl overflow-hidden border border-stone-200 bg-stone-50 shadow-xs">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="Makale görseli" loading="lazy" className="w-full h-auto object-contain max-h-[520px]" />
      </figure>
    );
  }
  if (kind === "youtube") {
    const src = youtubeEmbedSrc(url);
    if (!src) return <MediaFallback url={url} label="YouTube videosu" />;
    return (
      <div className="aspect-video w-full rounded-2xl overflow-hidden border border-stone-200 bg-black shadow-sm">
        <iframe
          src={src}
          title="YouTube video"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          loading="lazy"
          className="w-full h-full"
        />
      </div>
    );
  }
  if (kind === "tiktok") {
    const src = tiktokEmbedSrc(url);
    if (!src) return <MediaFallback url={url} label="TikTok videosu" />;
    return (
      <div className="flex flex-col items-center gap-1">
        <iframe
          src={src}
          title="TikTok video"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          loading="lazy"
          className="w-full max-w-[340px] h-[640px] rounded-2xl border border-stone-200 bg-black"
        />
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-stone-400 hover:text-amber-800 flex items-center gap-1">
          Kaynak: TikTok <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    );
  }
  if (kind === "instagram") {
    const src = instagramEmbedSrc(url);
    if (!src) return <MediaFallback url={url} label="Instagram içeriği" />;
    return (
      <div className="flex flex-col items-center gap-1">
        <iframe
          src={src}
          title="Instagram içeriği"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          loading="lazy"
          className="w-full max-w-[420px] h-[560px] rounded-2xl border border-stone-200 bg-white"
        />
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-stone-400 hover:text-amber-800 flex items-center gap-1">
          Kaynak: Instagram <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    );
  }
  return <MediaFallback url={url} label="Bağlantı" />;
}

export function BlogContent({ content }: { content: string }) {
  const blocks = parseBlogContent(content);
  return (
    <>
      {blocks.map((block, i) =>
        block.type === "text" ? (
          <p key={i} className="whitespace-pre-line">
            {block.text}
          </p>
        ) : (
          <MediaBlock key={i} kind={block.kind} url={block.url} />
        )
      )}
    </>
  );
}
