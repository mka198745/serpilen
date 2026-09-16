"use client";

import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { X, LogIn, UserPlus, Mail, Lock, User, Phone, MapPin } from "lucide-react";

export function AuthModal() {
  const { user, cookieless, modalOpen, modalTab, setModalTab, closeAuth, login, register, postLoginNext } = useAuth();
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [regForm, setRegForm] = useState({ name: "", email: "", phone: "", city: "", password: "", password2: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!modalOpen) return null;

  const goAfterAuth = () => {
    const next = postLoginNext && postLoginNext.startsWith("/") ? postLoginNext : window.location.pathname + window.location.search;
    window.location.href = next; // tam yükleme: sunucu oturumu görsün
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await login(loginForm.email.trim(), loginForm.password);
      if (r.success) {
        closeAuth();
        goAfterAuth();
      } else {
        setError(r.message || "Giriş yapılamadı.");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (regForm.password !== regForm.password2) {
      setError("Şifreler eşleşmiyor.");
      return;
    }
    setBusy(true);
    try {
      const r = await register({
        name: regForm.name.trim(),
        email: regForm.email.trim(),
        phone: regForm.phone.trim(),
        city: regForm.city.trim() || undefined,
        password: regForm.password,
      });
      if (r.success) {
        closeAuth();
        goAfterAuth();
      } else {
        setError(r.message || "Kayıt oluşturulamadı.");
      }
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    "w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-amber-700 focus:bg-white transition";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={closeAuth} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-amber-950 px-5 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-white font-black text-lg leading-tight">İpek Tuhafiye</h2>
            <p className="text-amber-200/80 text-[11px]">Üye girişi ile siparişlerinizi takip edin</p>
          </div>
          <button onClick={closeAuth} className="p-1.5 text-amber-200/70 hover:text-white hover:bg-white/10 rounded-lg transition" aria-label="Kapat">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-1 p-2 bg-stone-100 mx-5 mt-4 rounded-xl">
          <button
            onClick={() => { setModalTab("login"); setError(null); }}
            className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition ${modalTab === "login" ? "bg-white text-amber-900 shadow-xs" : "text-stone-500 hover:text-stone-700"}`}
          >
            <LogIn className="w-3.5 h-3.5" /> Kullanıcı Girişi
          </button>
          <button
            onClick={() => { setModalTab("register"); setError(null); }}
            className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition ${modalTab === "register" ? "bg-white text-amber-900 shadow-xs" : "text-stone-500 hover:text-stone-700"}`}
          >
            <UserPlus className="w-3.5 h-3.5" /> Üye Ol
          </button>
        </div>

        {error && (
          <div className="mx-5 mt-3 p-3 rounded-xl text-xs font-medium bg-rose-50 border border-rose-200 text-rose-800">
            {error}
          </div>
        )}

        {user && postLoginNext && cookieless ? (
          <div className="p-5 space-y-3">
            <div className="p-4 rounded-xl text-xs bg-amber-50 border border-amber-200 text-amber-900 leading-relaxed">
              <p className="font-bold mb-1">Giriş yaptınız: {user.name} ({user.roleLabel})</p>
              <p>
                Ancak tarayıcınız çerezleri engellediği için <strong>Yönetim Paneli / POS / B2B</strong> gibi
                korumalı sayfalar bu pencerede açılamıyor. Devam etmek için sayfayı yeni sekmede açın —
                orada girişiniz geçerli olacak.
              </p>
            </div>
            <button
              onClick={() => { window.open(postLoginNext, "_blank", "noopener"); closeAuth(); }}
              className="w-full py-2.5 bg-amber-800 hover:bg-amber-900 text-white text-sm font-bold rounded-xl transition"
            >
              Yeni Sekmede Aç →
            </button>
            <button
              onClick={closeAuth}
              className="w-full py-2 text-xs font-semibold text-stone-500 hover:text-stone-800 transition"
            >
              Vazgeç
            </button>
          </div>
        ) : modalTab === "login" ? (
          <form onSubmit={handleLogin} className="p-5 space-y-3">
            <div className="relative">
              <Mail className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
              <input
                type="email" required autoComplete="email"
                placeholder="E-posta adresiniz"
                value={loginForm.email}
                onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                className={inputCls}
              />
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
              <input
                type="password" required autoComplete="current-password"
                placeholder="Şifreniz"
                value={loginForm.password}
                onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                className={inputCls}
              />
            </div>
            <button
              type="submit" disabled={busy}
              className="w-full py-2.5 bg-amber-800 hover:bg-amber-900 disabled:opacity-60 text-white text-sm font-bold rounded-xl transition"
            >
              {busy ? "Giriş yapılıyor…" : "Giriş Yap"}
            </button>
            <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-3">
              <p className="text-[11px] font-bold text-stone-500 mb-2">Test hesapları (tıklayınca doldurur):</p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: "Süper Admin", email: "admin@ipektuhafiye.com", password: "Admin123!" },
                  { label: "Kasiyer", email: "kasiyer@ipektuhafiye.com", password: "Kasiyer123!" },
                  { label: "Depo", email: "depo@ipektuhafiye.com", password: "Depo123!" },
                ].map((a) => (
                  <button
                    key={a.email}
                    type="button"
                    onClick={() => { setLoginForm({ email: a.email, password: a.password }); setError(null); }}
                    className="px-2.5 py-1.5 rounded-lg bg-white border border-stone-200 hover:border-amber-500 text-[11px] font-semibold text-stone-700 transition text-left"
                  >
                    {a.label}
                    <span className="block font-mono text-[10px] text-stone-400">{a.email}</span>
                  </button>
                ))}
              </div>
            </div>
            <p className="text-center text-[11px] text-stone-500">
              Hesabınız yok mu?{" "}
              <button type="button" onClick={() => { setModalTab("register"); setError(null); }} className="text-amber-800 font-bold hover:underline">
                Hemen üye olun
              </button>
            </p>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="p-5 space-y-3">
            <div className="relative">
              <User className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
              <input
                required minLength={2}
                placeholder="Ad Soyad"
                value={regForm.name}
                onChange={(e) => setRegForm({ ...regForm, name: e.target.value })}
                className={inputCls}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="relative">
                <Mail className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
                <input
                  type="email" required autoComplete="email"
                  placeholder="E-posta"
                  value={regForm.email}
                  onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div className="relative">
                <Phone className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
                <input
                  required
                  placeholder="Telefon (05__)"
                  value={regForm.phone}
                  onChange={(e) => setRegForm({ ...regForm, phone: e.target.value })}
                  className={inputCls}
                />
              </div>
            </div>
            <div className="relative">
              <MapPin className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
              <input
                placeholder="Şehir (opsiyonel)"
                value={regForm.city}
                onChange={(e) => setRegForm({ ...regForm, city: e.target.value })}
                className={inputCls}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="relative">
                <Lock className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
                <input
                  type="password" required minLength={6} autoComplete="new-password"
                  placeholder="Şifre (min. 6)"
                  value={regForm.password}
                  onChange={(e) => setRegForm({ ...regForm, password: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
                <input
                  type="password" required minLength={6} autoComplete="new-password"
                  placeholder="Şifre (tekrar)"
                  value={regForm.password2}
                  onChange={(e) => setRegForm({ ...regForm, password2: e.target.value })}
                  className={inputCls}
                />
              </div>
            </div>
            <button
              type="submit" disabled={busy}
              className="w-full py-2.5 bg-emerald-800 hover:bg-emerald-900 disabled:opacity-60 text-white text-sm font-bold rounded-xl transition"
            >
              {busy ? "Kaydediliyor…" : "Üye Ol"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
