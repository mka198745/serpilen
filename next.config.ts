import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Üretim çıktısı `.next/standalone/server.js` olarak da üretilir;
  // Docker imajı ve doğrudan Node dağıtımı için gereklidir.
  output: "standalone",
  // Standalone çıktısına yerel gizli/veri dosyaları girmesin
  // (NFT izlemesi path.resolve yüzünden projeyi geniş izliyor).
  outputFileTracingExcludes: {
    "*": [".env", ".env.*", ".env.local", "data/**", "backups/**", "image-search/**"],
  },
};

export default nextConfig;
