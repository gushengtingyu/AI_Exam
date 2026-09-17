FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
RUN sed -i 's|http://deb.debian.org|http://mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources \
    && apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
ARG NEXT_PUBLIC_BASE_PATH
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_BASE_PATH=${NEXT_PUBLIC_BASE_PATH}
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
RUN sed -i 's|http://deb.debian.org|http://mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources \
    && apt-get update \
    && apt-get install -y --no-install-recommends chromium fonts-noto-cjk fonts-noto-color-emoji openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
ARG NEXT_PUBLIC_BASE_PATH
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 NEXT_PUBLIC_BASE_PATH=${NEXT_PUBLIC_BASE_PATH}
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/node_modules/playwright-core ./node_modules/playwright-core
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma/migrations ./prisma/migrations
COPY --from=builder /app/scripts/migrate-sqlite.mjs ./scripts/migrate-sqlite.mjs
RUN mkdir -p /app/data /app/storage
EXPOSE 3000
CMD ["sh", "-c", "node scripts/migrate-sqlite.mjs && node server.js"]
