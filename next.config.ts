import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Üretim çıktısı `.next/standalone/server.js` olarak da üretilir;
  // Docker imajı ve doğrudan Node dağıtımı için gereklidir.
  output: "standalone",
  // Runtime verileri, dağıtım arşivleri ve geliştirme dosyaları
  // uygulamanın çalışma zamanı bağımlılıkları değildir.
  outputFileTracingExcludes: {
    "*": [".env", ".env.*", ".env.local", "data/**", "backups/**", "image-search/**", "hosting/**", "tests/**", "docs/**", "*.zip"],
  },
};

export default nextConfig;
