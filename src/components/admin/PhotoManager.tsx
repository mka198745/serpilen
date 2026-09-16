"use client";

import React, { useState } from "react";
import { ImagePlus, Link2, Upload, X, Star } from "lucide-react";

export const MAX_PHOTOS = 6;

interface PhotoManagerProps {
  photos: string[];
  onChange: (photos: string[]) => void;
}

/**
 * Ürün fotoğraf yöneticisi: en fazla 6 fotoğraf, her biri bağlantı
 * yapıştırma veya site deposuna dosya yükleme ile eklenir. İlk fotoğraf
 * kapak (ana görsel) sayılır.
 */
export function PhotoManager({ photos, onChange }: PhotoManagerProps) {
  const [mode, setMode] = useState<"link" | "upload">("link");
  const [linkValue, setLinkValue] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remaining = MAX_PHOTOS - photos.length;

  const addUrls = (urls: string[]) => {
    const clean = urls.map((u) => u.trim()).filter(Boolean);
    if (clean.length === 0) return;
    onChange([...photos, ...clean].slice(0, MAX_PHOTOS));
  };

  const handleAddLink = () => {
    if (!linkValue.trim()) return;
    addUrls([linkValue]);
    setLinkValue("");
    setError(null);
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || uploading) return;
    if (remaining <= 0) {
      setError(`En fazla ${MAX_PHOTOS} fotoğraf ekleyebilirsiniz.`);
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const picked = [...files].slice(0, remaining);
      const uploaded: string[] = [];
      for (const file of picked) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/uploads", { method: "POST", body: form });
        const data = await res.json();
        if (!data.success) {
          setError(data?.error || `"${file.name}" yüklenemedi.`);
          break;
        }
        uploaded.push(data.data.url);
      }
      if (uploaded.length > 0) addUrls(uploaded);
      if (files.length > remaining) {
        setError(`İlk ${remaining} dosya yüklendi — en fazla ${MAX_PHOTOS} fotoğraf olabilir.`);
      }
    } catch {
      setError("Sunucuya ulaşılamadı.");
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = (index: number) => {
    onChange(photos.filter((_, i) => i !== index));
    setError(null);
  };

  const handleMakeCover = (index: number) => {
    if (index === 0) return;
    const next = [...photos];
    const [picked] = next.splice(index, 1);
    onChange([picked, ...next]);
  };

  return (
    <div className="p-2.5 rounded-xl bg-sky-50/70 border border-sky-200 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold text-sky-900 flex items-center gap-1">
          <ImagePlus className="w-3.5 h-3.5" />
          Ürün Fotoğrafları Ekle
          <span className="font-normal text-sky-700">
            ({photos.length}/{MAX_PHOTOS})
          </span>
        </p>
        <div className="flex gap-1 bg-white rounded-lg border border-sky-200 p-0.5">
          <button
            type="button"
            onClick={() => setMode("link")}
            className={`px-2 py-1 rounded-md text-[10px] font-bold flex items-center gap-1 transition ${
              mode === "link" ? "bg-sky-800 text-white" : "text-sky-900 hover:bg-sky-100"
            }`}
          >
            <Link2 className="w-3 h-3" />
            Link
          </button>
          <button
            type="button"
            onClick={() => setMode("upload")}
            className={`px-2 py-1 rounded-md text-[10px] font-bold flex items-center gap-1 transition ${
              mode === "upload" ? "bg-sky-800 text-white" : "text-sky-900 hover:bg-sky-100"
            }`}
          >
            <Upload className="w-3 h-3" />
            Siteden Yükle
          </button>
        </div>
      </div>

      {remaining > 0 ? (
        mode === "link" ? (
          <div className="flex gap-1.5">
            <input
              type="url"
              value={linkValue}
              onChange={(e) => setLinkValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddLink();
                }
              }}
              placeholder="https://… (görsel bağlantısı yapıştırın)"
              className="flex-1 min-w-0 px-3 py-2 bg-white border border-sky-300 rounded-xl"
            />
            <button
              type="button"
              onClick={handleAddLink}
              disabled={!linkValue.trim()}
              className="px-3 py-2 bg-sky-800 hover:bg-sky-900 disabled:opacity-50 text-white text-[11px] font-bold rounded-xl transition whitespace-nowrap"
            >
              Ekle
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              onChange={(e) => {
                void handleFiles(e.target.files);
                e.target.value = "";
              }}
              disabled={uploading}
              className="w-full px-2 py-1.5 bg-white border border-sky-300 rounded-xl text-[11px] file:mr-2 file:px-2 file:py-1 file:rounded-lg file:border-0 file:bg-sky-800 file:text-white file:text-[10px] file:font-bold file:cursor-pointer disabled:opacity-60"
            />
            <p className="text-[9px] text-stone-500">
              JPG, PNG, WEBP veya GIF — dosya başına en fazla 5 MB. Aynı anda birden fazla seçebilirsiniz.
            </p>
          </div>
        )
      ) : (
        <p className="text-[10px] font-bold text-sky-800">
          {MAX_PHOTOS} fotoğraf tamamlandı — yenisini eklemek için birini kaldırın.
        </p>
      )}

      {uploading && <p className="text-[10px] font-bold text-sky-800">Yükleniyor…</p>}
      {error && <p className="text-[10px] font-bold text-rose-700">{error}</p>}

      {photos.length > 0 && (
        <div className="flex flex-wrap gap-1.5 bg-white p-1.5 rounded-lg border border-sky-200">
          {photos.map((url, i) => (
            <div key={`${url}-${i}`} className="relative group w-16">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`Ürün fotoğrafı ${i + 1}`}
                className="w-16 h-16 rounded-lg object-cover border border-stone-200 bg-stone-100"
              />
              {i === 0 && (
                <span className="absolute left-0.5 bottom-0.5 px-1 py-px rounded bg-amber-800/90 text-white text-[8px] font-bold flex items-center gap-0.5">
                  <Star className="w-2 h-2 fill-white" />
                  Kapak
                </span>
              )}
              <button
                type="button"
                onClick={() => handleRemove(i)}
                title="Kaldır"
                className="absolute -top-1 -right-1 w-4.5 h-4.5 min-w-5 min-h-5 rounded-full bg-rose-700 text-white flex items-center justify-center shadow hover:bg-rose-800"
              >
                <X className="w-3 h-3" />
              </button>
              {i !== 0 && (
                <button
                  type="button"
                  onClick={() => handleMakeCover(i)}
                  title="Kapak yap"
                  className="absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white/90 text-amber-800 items-center justify-center shadow hidden group-hover:flex hover:bg-white"
                >
                  <Star className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {photos.length > 0 && (
        <p className="text-[9px] text-stone-500">
          İlk fotoğraf kapak görselidir. Yıldız simgesiyle kapak değiştirebilirsiniz.
        </p>
      )}
    </div>
  );
}
