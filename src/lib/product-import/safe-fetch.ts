import { promises as dns } from "node:dns";
import https from "node:https";
import net from "node:net";
import ipaddr from "ipaddr.js";

const MAX_HTML_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 12000;
const MAX_REDIRECTS = 3;
export class ProductImportError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}

/** Only ordinary HTTPS domain names on the standard port; no credentials, local hosts or IP literals. */
export function publicHttpsUrl(value: string, base?: string): URL {
  let url: URL;
  try { url = new URL(value, base); } catch { throw new ProductImportError("INVALID_URL", "Geçerli bir HTTPS ürün bağlantısı girin."); }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (url.protocol !== "https:" || url.username || url.password || url.port || !hostname || hostname.length > 253 || !hostname.includes(".") || hostname.endsWith(".local") || hostname.endsWith(".localhost") || hostname.endsWith(".internal") || hostname.endsWith(".home.arpa") || net.isIP(hostname.replace(/^\[|\]$/g, "")) || !/^[a-z0-9.-]+$/.test(hostname) || url.href.length > 2048) {
    throw new ProductImportError("INVALID_URL", "Yalnız herkese açık HTTPS alan adları kullanılabilir.");
  }
  url.hash = "";
  return url;
}

/** Refuse all special-purpose ranges; mapped IPv4 is checked as IPv4. */
export function isPublicAddress(address: string): boolean {
  try {
    const ip = ipaddr.process(address);
    if (ip.range() !== "unicast") return false;
    if (ip.kind() === "ipv6" && !ip.match(ipaddr.parse("2000::"), 3)) return false;
    return true;
  } catch { return false; }
}

type Address = { address: string; family: number };
type Resolve = (hostname: string) => Promise<Address[]>;
const resolveDefault: Resolve = hostname => dns.lookup(hostname, { all: true, verbatim: true });
function timed<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new ProductImportError("TIMEOUT", "Ürün sayfası zamanında yanıt vermedi.")); return; }
    const stop = () => reject(new ProductImportError("TIMEOUT", "Ürün sayfası zamanında yanıt vermedi."));
    signal.addEventListener("abort", stop, { once: true });
    promise.then(value => { signal.removeEventListener("abort", stop); resolve(value); }, error => { signal.removeEventListener("abort", stop); reject(error); });
  });
}
export async function resolvePublicHost(hostname: string, signal: AbortSignal, resolve: Resolve = resolveDefault): Promise<Address> {
  let addresses: Address[];
  try { addresses = await timed(resolve(hostname), signal); }
  catch (error) { if (error instanceof ProductImportError) throw error; throw new ProductImportError("NETWORK", "Ürün sitesi adresi çözümlenemedi."); }
  if (!addresses.length || addresses.some(a => !isPublicAddress(a.address) || ![4, 6].includes(a.family))) throw new ProductImportError("UNSAFE_HOST", "Bu site adresine güvenli bağlantı kurulamadı.");
  return addresses[0];
}

type PageResponse = { status: number; location?: string; contentType: string; contentEncoding: string; body: Buffer };
type GetPage = (url: URL, address: Address, signal: AbortSignal) => Promise<PageResponse>;
const getPage: GetPage = (url, address, signal) => new Promise((resolve, reject) => {
  const req = https.request(url, {
    method: "GET", agent: false, family: address.family, signal,
    // Pin the validated address while preserving original hostname for TLS and Host header.
    lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
    headers: { "User-Agent": "SerpilenProductImport/1.0", "Accept": "text/html,application/xhtml+xml", "Accept-Encoding": "identity" },
  }, res => {
    const status = res.statusCode || 0;
    if (status >= 300 && status < 400) { res.destroy(); resolve({ status, location: res.headers.location, contentType: "", contentEncoding: "", body: Buffer.alloc(0) }); return; }
    const contentType = String(res.headers["content-type"] || ""), contentEncoding = String(res.headers["content-encoding"] || "");
    if (status !== 200 || !/^\s*(text\/html|application\/xhtml\+xml)(?:\s*;|\s*$)/i.test(contentType) || (contentEncoding && contentEncoding.toLowerCase() !== "identity")) {
      res.destroy(); reject(new ProductImportError("RESPONSE", "Site HTML ürün sayfası döndürmedi veya erişimi engelledi.")); return;
    }
    const length = Number(res.headers["content-length"] || 0);
    if (length > MAX_HTML_BYTES) { res.destroy(); reject(new ProductImportError("TOO_LARGE", "Ürün sayfası çok büyük.")); return; }
    const chunks: Buffer[] = []; let size = 0;
    res.on("data", (chunk: Buffer) => { size += chunk.length; if (size > MAX_HTML_BYTES) { res.destroy(new ProductImportError("TOO_LARGE", "Ürün sayfası çok büyük.")); return; } chunks.push(chunk); });
    res.on("end", () => resolve({ status, contentType, contentEncoding, body: Buffer.concat(chunks) }));
    res.on("error", reject);
    res.on("aborted", () => reject(new ProductImportError("NETWORK", "Site bağlantısı kesildi.")));
  });
  req.on("error", reject);
  req.end();
});

/** Redirects are separately DNS-validated and pinned. No cookies, credentials or JS execution. */
export async function fetchPublicProductPage(input: string, options: { resolve?: Resolve; get?: GetPage; timeoutMs?: number } = {}): Promise<{ html: string; url: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? TIMEOUT_MS);
  try {
    let url = publicHttpsUrl(input);
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
      const address = await resolvePublicHost(url.hostname, controller.signal, options.resolve);
      const page = await timed((options.get ?? getPage)(url, address, controller.signal), controller.signal);
      if (page.status >= 300 && page.status < 400) {
        if (!page.location || redirects === MAX_REDIRECTS) throw new ProductImportError("REDIRECT", "Site çok fazla yönlendirme yaptı.");
        url = publicHttpsUrl(page.location, url.href);
        continue;
      }
      if (page.status !== 200 || !/^\s*(text\/html|application\/xhtml\+xml)(?:\s*;|\s*$)/i.test(page.contentType) || (page.contentEncoding && page.contentEncoding.toLowerCase() !== "identity")) throw new ProductImportError("RESPONSE", "Site HTML ürün sayfası döndürmedi veya erişimi engelledi.");
      if (page.body.length > MAX_HTML_BYTES) throw new ProductImportError("TOO_LARGE", "Ürün sayfası çok büyük.");
      const charset = /charset\s*=\s*["']?([^;\s"']+)/i.exec(page.contentType)?.[1] || "utf-8";
      try { return { html: new TextDecoder(charset, { fatal: false }).decode(page.body), url: url.href }; }
      catch { throw new ProductImportError("CHARSET", "Bu sayfanın karakter kodlaması desteklenmiyor."); }
    }
    throw new ProductImportError("REDIRECT", "Site çok fazla yönlendirme yaptı.");
  } catch (error) {
    if (error instanceof ProductImportError) throw error;
    throw new ProductImportError(controller.signal.aborted ? "TIMEOUT" : "NETWORK", controller.signal.aborted ? "Ürün sayfası zamanında yanıt vermedi." : "Ürün sitesine ulaşılamadı.");
  } finally { clearTimeout(timer); }
}
