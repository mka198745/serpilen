/**
 * Kısa ömürlü, tek kullanımlık dosya-indirme biletleri.
 *
 * Neden: önizleme/iframe gibi çerezlerin engellendiği ortamlarda indirmeyi
 * başlatan belge kullanılamıyor. Çözüm: staff oturumuyla (authFetch) bir bilet
 * alınır; dosyanın kendisi bu biletle yeni sekmede açılır. Bilet ayrıca
 * Authorization başlığı taşımaz — tarayıcı adres çubuğuyla gider.
 *
 * Biletler bellek-içidir (tek proses standalone), 2 dakika geçerlidir ve
 * tek kullanımlıktır; hedef dosya adı bilete gömülüdür.
 */
import crypto from "node:crypto";

type Ticket = { name: string; exp: number };

const TTL_MS = 2 * 60 * 1000;
const STORE_KEY = "__ipek_download_tickets__";

function store(): Map<string, Ticket> {
  const g = globalThis as unknown as Record<string, Map<string, Ticket> | undefined>;
  if (!g[STORE_KEY]) g[STORE_KEY] = new Map<string, Ticket>();
  return g[STORE_KEY];
}

function gc(now: number) {
  const m = store();
  for (const [k, v] of m) if (v.exp < now) m.delete(k);
}

/** `name` (yedek dosya adı) için tek kullanımlık bilet üretir. */
export function issueDownloadTicket(name: string): string {
  const now = Date.now();
  gc(now);
  const ticket = crypto.randomBytes(32).toString("hex");
  store().set(ticket, { name, exp: now + TTL_MS });
  return ticket;
}

/** Bileti doğrular ve tüketir (tek kullanım). Başarılıysa true. */
export function consumeDownloadTicket(ticket: string, name: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(ticket)) return false;
  const now = Date.now();
  gc(now);
  const m = store();
  const t = m.get(ticket);
  if (!t) return false;
  if (t.name !== name) return false;
  m.delete(ticket); // tek kullanım — sonuca bakılmaksızın tüketilir
  return t.exp >= now;
}
