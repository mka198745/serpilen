"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import {
  User,
  Mail,
  Phone,
  Lock,
  ShieldCheck,
  Save,
  KeyRound,
  UserCircle2,
  CheckCircle2,
  AlertCircle,
  BadgeCheck,
  CalendarDays,
} from "lucide-react";

interface Profile {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: string;
  roleLabel: string;
  isStaff: boolean;
  memberSince: string | null;
}

export default function AccountPage() {
  const router = useRouter();
  const { user, loading, authFetch, refresh } = useAuth();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [pwdForm, setPwdForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [changingPwd, setChangingPwd] = useState(false);
  const [pwdMsg, setPwdMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Oturum yoksa giriş penceresine yönlendir (?giris=1&next=/hesabim)
  useEffect(() => {
    if (!loading && !user) {
      router.replace("/?giris=1&next=/hesabim");
    }
  }, [loading, user, router]);

  // Profili API'den çek
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setProfileLoading(true);
      try {
        const res = await authFetch("/api/auth/profile", { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && data?.success) {
          const p: Profile = data.data;
          setProfile(p);
          setForm({ name: p.name, email: p.email, phone: p.phone || "" });
          setLoadError(null);
        } else {
          setLoadError(data?.error || "Profil bilgileri alınamadı.");
        }
      } catch {
        if (!cancelled) setLoadError("Bağlantı hatası: profil alınamadı.");
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // authFetch kimliği her render'da değişmez (useCallback bağımlı) — kullanıcı değişince yeniden çek
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await authFetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        setProfile(data.data);
        setSaveMsg({ ok: true, text: "Kişisel bilgileriniz kaydedildi." });
        await refresh(); // başlıktaki isim güncellensin
      } else {
        setSaveMsg({ ok: false, text: data?.error || "Kaydedilemedi." });
      }
    } catch {
      setSaveMsg({ ok: false, text: "Bağlantı hatası: kaydedilemedi." });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdMsg(null);
    if (pwdForm.newPassword !== pwdForm.confirmPassword) {
      setPwdMsg({ ok: false, text: "Yeni şifreler birbiriyle uyuşmuyor." });
      return;
    }
    if (pwdForm.newPassword.length < 8 || !/[A-Za-z]/.test(pwdForm.newPassword) || !/[0-9]/.test(pwdForm.newPassword)) {
      setPwdMsg({ ok: false, text: "Yeni şifre en az 8 karakter, en az bir harf ve bir rakam içermelidir." });
      return;
    }
    setChangingPwd(true);
    try {
      const res = await authFetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: pwdForm.currentPassword,
          newPassword: pwdForm.newPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        setPwdForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
        setPwdMsg({ ok: true, text: data?.message || "Şifreniz güncellendi." });
      } else {
        setPwdMsg({ ok: false, text: data?.error || "Şifre değiştirilemedi." });
      }
    } catch {
      setPwdMsg({ ok: false, text: "Bağlantı hatası: şifre değiştirilemedi." });
    } finally {
      setChangingPwd(false);
    }
  };

  if (loading || (user && profileLoading && !profile)) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center text-stone-500 text-sm">
        Hesap bilgileriniz yükleniyor…
      </div>
    );
  }
  if (!user) {
    // Yönlendirme effect'te; bu arada boş ekran
    return <div className="max-w-4xl mx-auto px-4 py-16" />;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-6">
      {/* Sayfa başlığı */}
      <div className="space-y-1">
        <nav className="text-[11px] text-stone-400">
          <Link href="/" className="hover:text-amber-800">Ana Sayfa</Link>
          <span className="mx-1.5">/</span>
          <span className="text-stone-600 font-semibold">Hesabım</span>
        </nav>
        <h1 className="text-2xl md:text-3xl font-black text-stone-900 flex items-center gap-2.5">
          <UserCircle2 className="w-7 h-7 text-amber-800" />
          Hesabım
        </h1>
        <p className="text-xs text-stone-500">
          Kişisel bilgilerinizi ve şifrenizi buradan güncelleyebilirsiniz.
        </p>
      </div>

      {loadError && (
        <div className="flex items-center gap-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {loadError}
        </div>
      )}

      {/* Kullanıcı özet kartı */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-xs p-5 flex flex-wrap items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-700 to-amber-900 flex items-center justify-center text-white text-xl font-black shadow-md">
          {(profile?.name || user.name || "?").trim().charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="text-base font-black text-stone-900 truncate">{profile?.name || user.name}</p>
          <p className="text-[11px] text-stone-500 truncate">{profile?.email || user.email}</p>
          <p className="flex flex-wrap items-center gap-2 mt-1.5 text-[10px] font-bold">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-amber-900 uppercase">
              <BadgeCheck className="w-3 h-3" />
              {profile?.roleLabel || user.roleLabel}
            </span>
            {profile?.memberSince && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-stone-100 text-stone-600">
                <CalendarDays className="w-3 h-3" />
                Üye olma: {new Date(profile.memberSince).toLocaleDateString("tr-TR")}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Form 1: Kişisel bilgiler */}
      <form onSubmit={handleSaveProfile} className="bg-white rounded-2xl border border-stone-200 shadow-xs p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 border-b border-stone-100 pb-3">
          <h2 className="text-sm font-black text-stone-800 uppercase tracking-wider flex items-center gap-2">
            <User className="w-4 h-4 text-amber-800" />
            Kişisel Bilgilerim
          </h2>
          {saveMsg && (
            <span className={`flex items-center gap-1.5 text-[11px] font-bold ${saveMsg.ok ? "text-emerald-700" : "text-rose-600"}`}>
              {saveMsg.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {saveMsg.text}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block md:col-span-2">
            <span className="text-[11px] font-bold text-stone-600 mb-1 flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> Ad Soyad</span>
            <input
              type="text"
              required
              minLength={2}
              maxLength={100}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2.5 border border-stone-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-700 focus:border-amber-700"
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-bold text-stone-600 mb-1 flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> E-posta (giriş adınız)</span>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full px-3 py-2.5 border border-stone-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-700 focus:border-amber-700"
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-bold text-stone-600 mb-1 flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> Telefon</span>
            <input
              type="tel"
              required
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="05xx xxx xx xx"
              className="w-full px-3 py-2.5 border border-stone-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-700 focus:border-amber-700"
            />
          </label>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-800 hover:bg-amber-900 text-white text-xs font-bold rounded-xl shadow-sm transition disabled:opacity-60"
          >
            <Save className="w-4 h-4" />
            {saving ? "Kaydediliyor…" : "Bilgilerimi Kaydet"}
          </button>
        </div>
      </form>

      {/* Form 2: Şifre değiştir */}
      <form onSubmit={handleChangePassword} className="bg-white rounded-2xl border border-stone-200 shadow-xs p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 border-b border-stone-100 pb-3">
          <h2 className="text-sm font-black text-stone-800 uppercase tracking-wider flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-amber-800" />
            Şifre Değiştir
          </h2>
          {pwdMsg && (
            <span className={`flex items-center gap-1.5 text-[11px] font-bold ${pwdMsg.ok ? "text-emerald-700" : "text-rose-600"}`}>
              {pwdMsg.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {pwdMsg.text}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="block">
            <span className="text-[11px] font-bold text-stone-600 mb-1 flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> Mevcut Şifre</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={pwdForm.currentPassword}
              onChange={(e) => setPwdForm({ ...pwdForm, currentPassword: e.target.value })}
              className="w-full px-3 py-2.5 border border-stone-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-700 focus:border-amber-700"
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-bold text-stone-600 mb-1 flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> Yeni Şifre</span>
            <input
              type="password"
              required
              autoComplete="new-password"
              minLength={8}
              value={pwdForm.newPassword}
              onChange={(e) => setPwdForm({ ...pwdForm, newPassword: e.target.value })}
              className="w-full px-3 py-2.5 border border-stone-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-700 focus:border-amber-700"
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-bold text-stone-600 mb-1 flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> Yeni Şifre (Tekrar)</span>
            <input
              type="password"
              required
              autoComplete="new-password"
              minLength={8}
              value={pwdForm.confirmPassword}
              onChange={(e) => setPwdForm({ ...pwdForm, confirmPassword: e.target.value })}
              className="w-full px-3 py-2.5 border border-stone-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-700 focus:border-amber-700"
            />
          </label>
        </div>
        <p className="text-[10px] text-stone-400">
          Yeni şifre en az 8 karakter, en az bir harf ve bir rakam içermelidir.
        </p>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={changingPwd}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-stone-900 hover:bg-black text-white text-xs font-bold rounded-xl shadow-sm transition disabled:opacity-60"
          >
            <ShieldCheck className="w-4 h-4" />
            {changingPwd ? "Güncelleniyor…" : "Şifremi Güncelle"}
          </button>
        </div>
      </form>
    </div>
  );
}
