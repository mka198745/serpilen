# İpek Tuhafiye — Next.js + SQLite (drizzle) üretim imajı
# better-sqlite3 native modülü derlenebilsin diye araç zinciri deps aşamasına eklenir.
FROM node:22-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
# better-sqlite3 header indirme (nodejs.org) kapalı ortamlarda yerel Node başlıkları kullanılır
ENV npm_config_nodedir=/usr/local
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV DATABASE_URL=sqlite:/app/data/tuhafiye.db

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/drizzle-sqlite ./drizzle-sqlite
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/drizzle.mysql.config.ts ./drizzle.mysql.config.ts
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# SQLite veritabanı volume'ü (kalıcı)
VOLUME ["/app/data"]

EXPOSE 3000
CMD ["node", "scripts/docker-entrypoint.mjs"]
