# syntax=docker/dockerfile:1.7

# ---- Build -------------------------------------------------------------------
FROM oven/bun:1.4 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# ---- Migration runtime deps (tiny) -------------------------------------------
FROM node:24-slim AS migrate-deps
WORKDIR /migrate
RUN npm init -y >/dev/null && npm install --omit=dev --no-audit --no-fund drizzle-orm@0.45.4 postgres@4.0.0

# ---- Runtime -----------------------------------------------------------------
FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0
COPY --from=build /app/.output ./.output
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts/migrate.ts ./scripts/migrate.ts
COPY --from=migrate-deps /migrate/node_modules ./node_modules
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "node --experimental-strip-types scripts/migrate.ts && node .output/server/index.mjs"]
