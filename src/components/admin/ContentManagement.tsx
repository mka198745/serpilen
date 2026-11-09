"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { BlogContent } from "@/components/blog/BlogContent";
import { youtubeEmbedSrc, tiktokEmbedSrc, instagramEmbedSrc, isSafeImageSrc } from "@/lib/media-embed";
import {
  Newspaper,
  Plus,
  Pencil,
  Trash2,
  Power,
  Save,
  X,
  RefreshCw,
  ImagePlus,
  ArrowLeft,
  Play,
  Music2,
  Camera,
  Eye,
  EyeOff,
  CalendarClock,
  Search,
} from "lucide-react";

const CATEGORIES = [
  "Dikiş Rehberi",
  "Malzeme Rehberi",
  "Teknikler & İpuçları",
  "Bakım & Onarım",
  "Hikayeler",
] as const;

interface BlogPost {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  category: string | null;
  author: string | null;
  imageUrl: string | null;
  isPublished: boolean;
  publishedAt: string | Date;
  seoTitle?: string | null;
  seoDescription?: string | null;
  seoKeywords?: string | null;
  seoNoindex?: boolean;
}

const inputCls =
  "w-full px-3 py-2 border border-stone-300 rounded-xl text-xs focus:outline-none focus:border-amber-700 bg-white";
const labelCls = "block text-[10px] font-bold text-stone-500 uppercase mb-1";

const EMPTY_FORM = {
  title: "",
  category: "Dikiş Rehberi" as string,
  author: "Tuhafiye Uzmanı",
  imageUrl: "",
  excerpt: "",
  content: "",
  isPublished: true,
  publishedAt: "",
  seoTitle: "",
  seoDescription: "",
  seoKeywords: "",
  seoNoindex: false,
};

/** Date -> <input type="datetime-local"> yerel değeri */
const toLocalInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function ContentManagement() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "editor">("list");
  const [editing, setEditing] = useState<BlogPost | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; isError: boolean } | null>(null);
  const [filter, setFilter] = useState<"all" | "published" | "scheduled" | "draft">("all");
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const [mediaPanel, setMediaPanel] = useState<null | "image" | "youtube" | "tiktok" | "instagram">(null);
  const [mediaUrl, setMediaUrl] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  const load = () => {
    setLoading(true);
    fetch("/api/blog-posts", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d?.success) setPosts(d.data || []);
        else setFeedback({ text: d?.error?.message || "Liste alınamadı.", isError: true });
      })
      .catch(() => setFeedback({ text: "Sunucuya ulaşılamadı.", isError: true }))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const isScheduledPost = (p: BlogPost) =>
    p.isPublished && new Date(p.publishedAt).getTime() > Date.now();
  const liveCount = posts.filter((p) => p.isPublished && !isScheduledPost(p)).length;
  const scheduledCount = posts.filter(isScheduledPost).length;
  const draftCount = posts.filter((p) => !p.isPublished).length;

  const filtered = useMemo(
    () =>
      posts.filter((p) =>
        filter === "all"
          ? true
          : filter === "published"
            ? p.isPublished && !isScheduledPost(p)
            : filter === "scheduled"
              ? isScheduledPost(p)
              : !p.isPublished
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [posts, filter]
  );

  const openEditor = (post: BlogPost | null) => {
    setEditing(post);
    setForm(
      post
        ? {
            title: post.title,
            category: post.category || "Dikiş Rehberi",
            author: post.author || "Tuhafiye Uzmanı",
            imageUrl: post.imageUrl || "",
            excerpt: post.excerpt || "",
            content: post.content,
            isPublished: post.isPublished,
            publishedAt: toLocalInput(new Date(post.publishedAt)),
            seoTitle: post.seoTitle || "",
            seoDescription: post.seoDescription || "",
            seoKeywords: post.seoKeywords || "",
            seoNoindex: post.seoNoindex ?? false,
          }
        : { ...EMPTY_FORM, publishedAt: toLocalInput(new Date()) }
    );
    setFeedback(null);
    setView("editor");
  };

  const insertAtCursor = (snippet: string) => {
    const ta = contentRef.current;
    const block = snippet.trim();
    if (!ta) {
      setForm((f) => ({ ...f, content: (f.content ? f.content.replace(/\s*$/, "") + "\n" : "") + block + "\n" }));
      return;
    }
    const start = ta.selectionStart ?? form.content.length;
    const end = ta.selectionEnd ?? form.content.length;
    const before = form.content.slice(0, start);
    const after = form.content.slice(end);
    const prefix = before && !before.endsWith("\n") ? "\n" : "";
    const blockText = prefix + block + "\n";
    const next = before + blockText + after;
    setForm((f) => ({ ...f, content: next }));
    window.requestAnimationFrame(() => {
      ta.focus();
      const pos = (before + blockText).length;
      ta.setSelectionRange(pos, pos);
    });
  };

  const MEDIA_PANEL_META: Record<string, { title: string; placeholder: string; hint: string }> = {
    image: {
      title: "Görsel",
      placeholder: "https://…/gorsel.jpg veya /uploads/products/…",
      hint: "Yüklenen / dışarıdan bir görsel URL'si yapıştırın, ya da dosya yükleyin.",
    },
    youtube: {
      title: "YouTube Videosu",
      placeholder: "https://www.youtube.com/watch?v=… veya https://youtu.be/…",
      hint: "watch?v=…, youtu.be/… veya /shorts/… biçimindeki linkler desteklenir.",
    },
    tiktok: {
      title: "TikTok Videosu",
      placeholder: "https://www.tiktok.com/@kullanici/video/1234567890",
      hint: "tiktok.com/@kullanıcı/video/… linkini yapıştırın (kısa vm.tiktok linkleri desteklenmez).",
    },
    instagram: {
      title: "Instagram Gönderisi / Reels",
      placeholder: "https://www.instagram.com/reel/ABC123…/ veya /p/ABC123…/",
      hint: "instagram.com/p/… veya instagram.com/reel/… linkini yapıştırın.",
    },
  };

  const insertMediaFromPanel = () => {
    const url = mediaUrl.trim();
    if (!mediaPanel || !url) return;
    const fail = (msg: string) => setFeedback({ text: msg, isError: true });
    if (mediaPanel === "youtube" && !youtubeEmbedSrc(url)) return fail("Geçerli bir YouTube linki değil.");
    if (mediaPanel === "tiktok" && !tiktokEmbedSrc(url)) return fail("Geçerli bir TikTok video linki değil (ör. tiktok.com/@kullanıcı/video/…).");
    if (mediaPanel === "instagram" && !instagramEmbedSrc(url)) return fail("Geçerli bir Instagram linki değil (ör. instagram.com/p/… veya /reel/…).");
    if (mediaPanel === "image" && !isSafeImageSrc(url)) return fail("Görsel adresi https://… veya /uploads/… ile başlamalı.");
    insertAtCursor(`[media:${mediaPanel}]${url}[/media]`);
    setMediaPanel(null);
    setMediaUrl("");
    setFeedback({ text: "Medya içeriğe eklendi.", isError: false });
  };

  const uploadInlineImage = async (file: File) => {
    setUploading(true);
    setFeedback(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body: fd });
      const d = await res.json();
      if (d.success) {
        insertAtCursor(`[media:image]${d.data.url}[/media]`);
        setMediaPanel(null);
        setMediaUrl("");
        setFeedback({ text: "Görsel yüklendi ve içeriğe eklendi.", isError: false });
      } else {
        setFeedback({ text: d?.error || "Görsel yüklenemedi.", isError: true });
      }
    } catch {
      setFeedback({ text: "Görsel yüklenemedi (sunucu).", isError: true });
    } finally {
      setUploading(false);
    }
  };

  const mediaBtn = (kind: "image" | "youtube" | "tiktok" | "instagram") =>
    `flex items-center gap-1 px-2 py-1.5 rounded-lg border text-[10px] font-bold transition ${
      mediaPanel === kind
        ? "border-amber-800 bg-amber-800 text-white"
        : "border-stone-200 bg-stone-50 text-stone-700 hover:border-amber-500 hover:text-amber-900"
    }`;

  const save = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      setFeedback({ text: "Başlık ve içerik zorunludur.", isError: true });
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        category: form.category,
        author: form.author.trim() || "Tuhafiye Uzmanı",
        imageUrl: form.imageUrl.trim() || null,
        excerpt: form.excerpt.trim() || null,
        content: form.content,
        isPublished: form.isPublished,
        seoTitle: form.seoTitle.trim(),
        seoDescription: form.seoDescription.trim(),
        seoKeywords: form.seoKeywords.trim(),
        seoNoindex: form.seoNoindex,
      };
      if (form.publishedAt) {
        const d = new Date(form.publishedAt);
        if (Number.isFinite(d.getTime())) payload.publishedAt = d.toISOString();
      }
      const res = editing
        ? await fetch("/api/blog-posts", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: editing.id, ...payload }),
          })
        : await fetch("/api/blog-posts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const d = await res.json();
      if (!d.success) {
        setFeedback({ text: d?.error?.message || "Kaydedilemedi.", isError: true });
        return;
      }
      load();
      setView("list");
      setFeedback({ text: editing ? "İçerik güncellendi." : "İçerik eklendi.", isError: false });
    } catch {
      setFeedback({ text: "Sunucuya ulaşılamadı.", isError: true });
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async (post: BlogPost) => {
    const scheduled = post.isPublished && new Date(post.publishedAt).getTime() > Date.now();
    const bodyPayload = scheduled
      ? { id: post.id, publishedAt: new Date().toISOString() }
      : { id: post.id, isPublished: !post.isPublished };
    try {
      const res = await fetch("/api/blog-posts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload),
      });
      const d = await res.json();
      if (d.success) {
        setPosts((prev) => prev.map((p) => (p.id === post.id ? d.data : p)));
        setFeedback({
          text: scheduled ? "Planlanan içerik hemen yayına alındı." : d.data.isPublished ? "İçerik yayına alındı." : "İçerik taslağa çekildi.",
          isError: false,
        });
      } else {
        setFeedback({ text: d?.error?.message || "İşlem başarısız.", isError: true });
      }
    } catch {
      setFeedback({ text: "Sunucuya ulaşılamadı.", isError: true });
    }
  };

  const remove = async (post: BlogPost) => {
    if (typeof window !== "undefined" && !window.confirm(`"${post.title}" silinsin mi? Bu işlem geri alınamaz.`)) return;
    try {
      const res = await fetch(`/api/blog-posts?id=${post.id}`, { method: "DELETE" });
      const d = await res.json();
      if (d.success) {
        setPosts((prev) => prev.filter((p) => p.id !== post.id));
        setFeedback({ text: "İçerik silindi.", isError: false });
      } else {
        setFeedback({ text: d?.error?.message || "Silinemedi.", isError: true });
      }
    } catch {
      setFeedback({ text: "Sunucuya ulaşılamadı.", isError: true });
    }
  };

  const uploadImage = async (file: File) => {
    setUploading(true);
    setFeedback(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body: fd });
      const d = await res.json();
      if (d.success) {
        setForm((f) => ({ ...f, imageUrl: d.data.url }));
      } else {
        setFeedback({ text: d?.error || "Görsel yüklenemedi.", isError: true });
      }
    } catch {
      setFeedback({ text: "Görsel yüklenemedi (sunucu).", isError: true });
    } finally {
      setUploading(false);
    }
  };

  if (view === "editor") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-800">İÇERİK YÖNETİMİ</span>
            <h2 className="text-xl font-black text-stone-900 flex items-center gap-2">
              <Newspaper className="w-5 h-5 text-amber-800" />
              {editing ? "İçeriği Düzenle" : "Yeni İçerik Ekle"}
            </h2>
            {editing && <p className="text-[11px] text-stone-400 font-mono">/blog/{editing.slug}</p>}
          </div>
          <button onClick={() => setView("list")} className="flex items-center gap-1.5 px-3 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold rounded-xl transition">
            <ArrowLeft className="w-4 h-4" /> Listeye Dön
          </button>
        </div>

        {feedback && (
          <div className={`p-3 rounded-xl text-xs font-medium border ${feedback.isError ? "bg-rose-50 border-rose-200 text-rose-800" : "bg-emerald-50 border-emerald-200 text-emerald-800"}`}>
            {feedback.text}
          </div>
        )}

        <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4">
          <div>
            <label className={labelCls}>Başlık *</label>
            <input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="örn. Doğru Fermuar Boyunu Seçme Rehberi" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Kategori</label>
              <select className={inputCls} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Yazar</label>
              <input className={inputCls} value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 self-end pb-0.5 cursor-pointer select-none">
              <input type="checkbox" className="w-4 h-4 accent-amber-800" checked={form.isPublished} onChange={(e) => setForm({ ...form, isPublished: e.target.checked })} />
              <span className="text-xs font-bold text-stone-800">Yayında (gizli taslak değil)</span>
            </label>
          </div>
          <div>
            <label className={labelCls}>Kapak Görseli</label>
            <div className="flex gap-2">
              <input className={inputCls} value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} placeholder="https://… veya yükleme sonrası /uploads/products/…" />
              <label className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-sky-50 border border-sky-200 hover:bg-sky-100 text-sky-900 text-xs font-bold rounded-xl cursor-pointer transition">
                <ImagePlus className="w-4 h-4" />
                {uploading ? "Yükleniyor…" : "Yükle"}
                <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadImage(f); e.target.value = ""; }} />
              </label>
            </div>
            {form.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.imageUrl} alt="Kapak önizleme" className="mt-2 h-32 w-auto rounded-xl object-cover border border-stone-200" />
            )}
          </div>
          <div>
            <label className={labelCls}>Özet (listelerde görünür)</label>
            <textarea className={inputCls} rows={2} value={form.excerpt} onChange={(e) => setForm({ ...form, excerpt: e.target.value })} placeholder="1-2 cümlelik özet" />
          </div>
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <label className="text-[10px] font-bold text-stone-500 uppercase">İçerik * <span className="normal-case font-semibold text-stone-400">(medya eklemek için aşağıdaki düğmeleri kullanın)</span></label>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button type="button" onClick={() => { setMediaPanel(mediaPanel === "image" ? null : "image"); setMediaUrl(""); }} className={mediaBtn("image")} title="Görsel ekle">
                  <ImagePlus className="w-3.5 h-3.5" /> Görsel
                </button>
                <button type="button" onClick={() => { setMediaPanel(mediaPanel === "youtube" ? null : "youtube"); setMediaUrl(""); }} className={mediaBtn("youtube")} title="YouTube videosu ekle">
                  <Play className="w-3.5 h-3.5" /> YouTube
                </button>
                <button type="button" onClick={() => { setMediaPanel(mediaPanel === "tiktok" ? null : "tiktok"); setMediaUrl(""); }} className={mediaBtn("tiktok")} title="TikTok videosu ekle">
                  <Music2 className="w-3.5 h-3.5" /> TikTok
                </button>
                <button type="button" onClick={() => { setMediaPanel(mediaPanel === "instagram" ? null : "instagram"); setMediaUrl(""); }} className={mediaBtn("instagram")} title="Instagram içeriği ekle">
                  <Camera className="w-3.5 h-3.5" /> Instagram
                </button>
                <button type="button" onClick={() => setShowPreview((v) => !v)} className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-stone-200 bg-white text-[10px] font-bold text-stone-600 hover:border-amber-500 hover:text-amber-900 transition" title="Önizlemeyi aç/kapat">
                  {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />} {showPreview ? "Önizlemeyi Kapat" : "Önizleme"}
                </button>
              </div>
            </div>

            {mediaPanel && (
              <div className="mb-2 p-3 rounded-xl border border-sky-200 bg-sky-50 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-black text-sky-900 uppercase tracking-wider">{MEDIA_PANEL_META[mediaPanel].title} Ekle</p>
                  <button type="button" onClick={() => { setMediaPanel(null); setMediaUrl(""); }} className="p-1 rounded-lg text-sky-800 hover:bg-sky-100 transition" title="Vazgeç">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    autoFocus
                    className={inputCls}
                    value={mediaUrl}
                    onChange={(e) => setMediaUrl(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); insertMediaFromPanel(); } }}
                    placeholder={MEDIA_PANEL_META[mediaPanel].placeholder}
                  />
                  {mediaPanel === "image" && (
                    <label className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-white border border-sky-300 hover:bg-sky-100 text-sky-900 text-xs font-bold rounded-xl cursor-pointer transition">
                      <ImagePlus className="w-4 h-4" />
                      {uploading ? "Yükleniyor…" : "Dosya Yükle"}
                      <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadInlineImage(f); e.target.value = ""; }} />
                    </label>
                  )}
                  <button type="button" onClick={insertMediaFromPanel} disabled={uploading} className="shrink-0 px-4 py-2 bg-sky-800 hover:bg-sky-900 disabled:opacity-60 text-white text-xs font-bold rounded-xl transition">
                    İçeriğe Ekle
                  </button>
                </div>
                <p className="text-[10px] text-sky-800/80">{MEDIA_PANEL_META[mediaPanel].hint} Medya, imlecin bulunduğu satıra eklenir.</p>
              </div>
            )}

            <textarea ref={contentRef} className={`${inputCls} font-mono leading-relaxed`} rows={14} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="Makale içeriği… (satır sonları korunur, medya satırları [media:…] etiketleriyle işaretlenir)" />

            {showPreview && (
              <div className="mt-2 p-4 rounded-2xl border border-amber-200 bg-amber-50/40">
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-900 mb-2">Önizleme</p>
                <div className="text-sm leading-relaxed text-stone-700 space-y-3 max-h-[480px] overflow-y-auto">
                  {form.content.trim() ? <BlogContent content={form.content} /> : <p className="text-stone-400">Önizlenecek içerik henüz yok.</p>}
                </div>
              </div>
            )}
          </div>
          {/* YAYIN PLANLAMA */}
          <div className="border-t border-stone-100 pt-4">
            <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-800 flex items-center gap-1.5">
                  <CalendarClock className="w-3.5 h-3.5" /> Yayın Planlama
                </p>
                <p className="text-[10px] text-stone-400 mt-0.5">İleri bir tarih/saat seçerseniz içerik o zamana kadar vitrinde görünmez, zamanı gelince otomatik yayına alınır.</p>
              </div>
              <button type="button" onClick={() => setForm((f) => ({ ...f, publishedAt: toLocalInput(new Date()) }))} className="px-2.5 py-1.5 text-[10px] font-bold rounded-lg border border-stone-200 bg-stone-50 hover:border-amber-500 hover:text-amber-900 text-stone-700 transition" title="Yayın tarihini şimdiye ayarla">
                Şimdi
              </button>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <input
                type="datetime-local"
                className={`${inputCls} max-w-xs`}
                value={form.publishedAt}
                onChange={(e) => setForm({ ...form, publishedAt: e.target.value })}
              />
              {form.publishedAt && new Date(form.publishedAt).getTime() > Date.now() && (
                <span className="text-[11px] font-semibold text-sky-900 bg-sky-50 border border-sky-200 rounded-lg px-3 py-1.5">
                  Bu içerik {new Date(form.publishedAt).toLocaleString("tr-TR", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })} tarihinde otomatik yayına alınacak.
                </span>
              )}
            </div>
          </div>

          {/* SEO AYARLARI */}
          <div className="border-t border-stone-100 pt-4 space-y-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-800 flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5" /> SEO Ayarları
              </p>
              <p className="text-[10px] text-stone-400 mt-0.5">Arama motorlarında nasıl görüneceğini belirleyin. Boş alanlar makale başlığı/özetinden otomatik doldurulur.</p>
            </div>

            <div>
              <label className={labelCls}>
                SEO Başlığı{" "}
                <span className={`normal-case font-bold ${(form.seoTitle || form.title).length > 60 ? "text-rose-600" : "text-stone-400"}`}>
                  ({(form.seoTitle || form.title).length}/60)
                </span>
              </label>
              <input
                className={inputCls}
                maxLength={70}
                value={form.seoTitle}
                onChange={(e) => setForm({ ...form, seoTitle: e.target.value })}
                placeholder={form.title || "Google arama sonucunda görünecek başlık"}
              />
            </div>

            <div>
              <label className={labelCls}>
                SEO Açıklaması{" "}
                <span className={`normal-case font-bold ${(form.seoDescription || form.excerpt).length > 160 ? "text-rose-600" : "text-stone-400"}`}>
                  ({(form.seoDescription || form.excerpt).length}/160)
                </span>
              </label>
              <textarea
                className={inputCls}
                rows={2}
                maxLength={200}
                value={form.seoDescription}
                onChange={(e) => setForm({ ...form, seoDescription: e.target.value })}
                placeholder={form.excerpt || "Arama sonucunda görünecek 1-2 cümlelik açıklama"}
              />
            </div>

            <div>
              <label className={labelCls}>Anahtar Kelimeler</label>
              <input
                className={inputCls}
                value={form.seoKeywords}
                onChange={(e) => setForm({ ...form, seoKeywords: e.target.value })}
                placeholder="fermuar, ykk, dikiş rehberi, tuhafiye"
              />
              <p className="text-[10px] text-stone-400 mt-1">Virgülle ayırın (ör. fermuar, ykk, dikiş rehberi).</p>
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="w-4 h-4 accent-amber-800"
                checked={form.seoNoindex}
                onChange={(e) => setForm({ ...form, seoNoindex: e.target.checked })}
              />
              <span className="text-xs font-semibold text-stone-700">noindex — Arama motorları bu içeriği indekslemesin (görünür ama aramada çıkmaz)</span>
            </label>

            {/* Google arama sonucu önizlemesi */}
            <div className="rounded-xl border border-stone-200 bg-white p-3 shadow-xs">
              <p className="text-[9px] font-black uppercase tracking-widest text-stone-400 mb-1.5">Google Önizleme</p>
              <p className="text-[11px] text-emerald-800 truncate">ipektuhafiye.com <span className="text-stone-400">›</span> blog <span className="text-stone-400">›</span> {editing?.slug || "yeni-makale"}</p>
              <p className="text-[17px] leading-snug text-[#1a0dab] truncate">{(form.seoTitle.trim() || form.title.trim() || "Makale başlığı").slice(0, 70)}</p>
              <p className="text-xs text-stone-600 leading-snug line-clamp-2">
                {(
                  form.seoDescription.trim() ||
                  form.excerpt.trim() ||
                  form.content.replace(/\[media:[^\]]+\][^\[]*\[\/media\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 160)
                ) || "Açıklama girilmedi — Google içeriğin ilk 160 karakterini kullanır."}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button onClick={() => setView("list")} className="px-4 py-2.5 text-xs font-bold text-stone-600 hover:bg-stone-100 rounded-xl transition">
              Vazgeç
            </button>
            <button onClick={save} disabled={saving || uploading} className="flex items-center gap-1.5 px-5 py-2.5 bg-amber-800 hover:bg-amber-900 disabled:opacity-60 text-white text-xs font-bold rounded-xl transition">
              <Save className="w-4 h-4" />
              {saving ? "Kaydediliyor…" : "Kaydet"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <span className="text-[10px] font-black uppercase tracking-widest text-amber-800">İÇERİK YÖNETİMİ</span>
          <h2 className="text-xl font-black text-stone-900 flex items-center gap-2">
            <Newspaper className="w-5 h-5 text-amber-800" /> İçerik Yönetimi
          </h2>
          <p className="text-xs text-stone-500">
            Vitrindeki “Dikiş Rehberi” bölümünün makaleleri: ekleyin, düzenleyin, yayına alın veya silin.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="px-3 py-2 bg-stone-200 hover:bg-stone-300 text-stone-800 text-xs font-bold rounded-xl flex items-center gap-1.5 transition" title="Yenile">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Yenile</span>
          </button>
          <button onClick={() => openEditor(null)} className="px-3.5 py-2 bg-amber-800 hover:bg-amber-900 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition">
            <Plus className="w-4 h-4" />
            <span>Yeni İçerik</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div className={`p-3 rounded-xl text-xs font-medium border ${feedback.isError ? "bg-rose-50 border-rose-200 text-rose-800" : "bg-emerald-50 border-emerald-200 text-emerald-800"}`}>
          {feedback.text}
        </div>
      )}

      <div className="flex items-center gap-1.5">
        {([
          { id: "all", label: `Tümü (${posts.length})` },
          { id: "published", label: `Yayında (${liveCount})` },
          { id: "scheduled", label: `Planlanan (${scheduledCount})` },
          { id: "draft", label: `Taslak (${draftCount})` },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${filter === t.id ? "bg-amber-800 text-white" : "bg-white text-stone-600 border border-stone-200 hover:border-amber-300"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-xs">
        <table className="w-full text-xs text-left table-fixed">
            <thead className="bg-stone-50 text-stone-500 uppercase border-b border-stone-200">
              <tr>
                <th className="py-3 px-3 w-[38%]">Başlık</th>
                <th className="py-3 px-3 w-[17%]">Kategori</th>
                <th className="py-3 px-3 w-[13%]">Yayın</th>
                <th className="py-3 px-3 w-[12%]">Durum</th>
                <th className="py-3 px-3 w-[20%] text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-stone-50/50 align-middle">
                  <td className="py-3 px-3">
                    <span className="font-bold text-stone-900 block leading-snug break-words" title={p.title}>{p.title}</span>
                    <span className="text-[10px] text-stone-400 font-mono break-all">/blog/{p.slug}</span>
                  </td>
                  <td className="py-3 px-3">
                    <span className="bg-amber-50 text-amber-900 px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap">{p.category || "Dikiş Rehberi"}</span>
                  </td>
                  <td className="py-3 px-3 text-stone-500 whitespace-nowrap">{new Date(p.publishedAt).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                  <td className="py-3 px-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${!p.isPublished ? "bg-stone-200 text-stone-600" : isScheduledPost(p) ? "bg-sky-100 text-sky-900" : "bg-emerald-100 text-emerald-800"}`}>
                      {!p.isPublished ? "Taslak" : isScheduledPost(p) ? "Planlandı" : "Yayında"}
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <button onClick={() => openEditor(p)} title="Düzenle" className="p-2 rounded-lg border border-stone-200 bg-white hover:border-amber-400 hover:text-amber-800 text-stone-600 transition">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => void togglePublish(p)} title={isScheduledPost(p) ? "Hemen yayınla" : p.isPublished ? "Taslağa çek" : "Yayına al"} className={`p-2 rounded-lg border transition ${p.isPublished ? "border-stone-200 bg-stone-50 text-stone-600 hover:bg-stone-100" : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"}`}>
                        <Power className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => void remove(p)} title="Sil" className="p-2 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 transition">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-stone-400">
                    {loading ? "Yükleniyor…" : filter === "all" ? "Henüz içerik yok — “Yeni İçerik” ile ilk makaleyi ekleyin." : "Bu filtrede kayıt yok."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
      </div>
    </div>
  );
}
