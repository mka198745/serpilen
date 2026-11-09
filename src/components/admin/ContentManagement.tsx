"use client";

import React, { useEffect, useMemo, useState } from "react";
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
  const [filter, setFilter] = useState<"all" | "published" | "draft">("all");

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

  const filtered = useMemo(
    () =>
      posts.filter((p) =>
        filter === "all" ? true : filter === "published" ? p.isPublished : !p.isPublished
      ),
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
          }
        : EMPTY_FORM
    );
    setFeedback(null);
    setView("editor");
  };

  const save = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      setFeedback({ text: "Başlık ve içerik zorunludur.", isError: true });
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      const payload = {
        title: form.title.trim(),
        category: form.category,
        author: form.author.trim() || "Tuhafiye Uzmanı",
        imageUrl: form.imageUrl.trim() || null,
        excerpt: form.excerpt.trim() || null,
        content: form.content,
        isPublished: form.isPublished,
      };
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
    try {
      const res = await fetch("/api/blog-posts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: post.id, isPublished: !post.isPublished }),
      });
      const d = await res.json();
      if (d.success) {
        setPosts((prev) => prev.map((p) => (p.id === post.id ? d.data : p)));
        setFeedback({ text: d.data.isPublished ? "İçerik yayına alındı." : "İçerik taslağa çekildi.", isError: false });
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
            <label className={labelCls}>İçerik *</label>
            <textarea className={`${inputCls} font-mono leading-relaxed`} rows={14} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="Makale içeriği… (satır sonları korunur)" />
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
          { id: "published", label: `Yayında (${posts.filter((p) => p.isPublished).length})` },
          { id: "draft", label: `Taslak (${posts.filter((p) => !p.isPublished).length})` },
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
                  <td className="py-3 px-3 text-stone-500 whitespace-nowrap">{new Date(p.publishedAt).toLocaleDateString("tr-TR")}</td>
                  <td className="py-3 px-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${p.isPublished ? "bg-emerald-100 text-emerald-800" : "bg-stone-200 text-stone-600"}`}>
                      {p.isPublished ? "Yayında" : "Taslak"}
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <button onClick={() => openEditor(p)} title="Düzenle" className="p-2 rounded-lg border border-stone-200 bg-white hover:border-amber-400 hover:text-amber-800 text-stone-600 transition">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => void togglePublish(p)} title={p.isPublished ? "Taslağa çek" : "Yayına al"} className={`p-2 rounded-lg border transition ${p.isPublished ? "border-stone-200 bg-stone-50 text-stone-600 hover:bg-stone-100" : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"}`}>
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
