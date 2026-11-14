"use client";

import React, { useState } from "react";
import { withOrigin } from "@/lib/video";

interface YouTubePlayerProps {
  videoId: string;
  embedUrl: string;
  title: string;
  watchUrl: string;
}

/**
 * YouTube'un orijinal oynatıcısı — tıklayınca yüklenir.
 * (Doğrudan gömme bazı ortamlarda "yapılandırma hatası (153)" veriyor;
 * kullanıcı tıklamasıyla açılan gerçek oynatıcı en dayanıklı yöntemdir.)
 */
export function YouTubePlayer({ videoId, embedUrl, title, watchUrl }: YouTubePlayerProps) {
  const [started, setStarted] = useState(false);
  const [origin] = useState(() =>
    typeof window !== "undefined" ? window.location.origin : ""
  );

  if (!started) {
    return (
      <button
        type="button"
        onClick={() => setStarted(true)}
        className="relative w-full h-full group bg-black overflow-hidden"
        title={`${title} — oynatmak için tıklayın`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
          alt={title}
          className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:opacity-100 transition"
          loading="lazy"
        />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="w-16 h-11 rounded-xl bg-red-600 group-hover:bg-red-700 transition flex items-center justify-center shadow-lg">
            <span
              className="w-0 h-0 border-y-[9px] border-y-transparent border-l-[15px] border-l-white ml-1"
              aria-hidden
            />
          </span>
        </span>
        <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/70 text-white text-[10px] font-bold">
          YouTube&apos;da oynat
        </span>
      </button>
    );
  }

  const sep = embedUrl.includes("?") ? "&" : "?";
  const src = withOrigin(`${embedUrl}${sep}autoplay=1&rel=0`, origin);

  return (
    <iframe
      src={src}
      title="YouTube video player"
      className="w-full h-full"
      frameBorder="0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      referrerPolicy="strict-origin-when-cross-origin"
      allowFullScreen
    />
  );
}

/** Oynatılamayan durumlar için yedek bağlantı (her zaman gösterilir). */
export function VideoFallbackLink({ watchUrl, label = "Orijinal videoyu aç ↗" }: { watchUrl: string; label?: string }) {
  if (!watchUrl) return null;
  return (
    <a
      href={watchUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-block text-[11px] font-bold text-violet-800 hover:underline"
    >
      {label}
    </a>
  );
}
