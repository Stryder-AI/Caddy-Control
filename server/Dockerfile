# Caddy Control backend: TCP :8800 for iStartek VT-100 trackers,
# HTTP + Socket.io :3001 for the dashboard.

FROM node:20-bookworm-slim AS builder
WORKDIR /app

# Build tools needed for native deps (better-sqlite3)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
RUN npm install --no-audit --no-fund \
  && npx tsc -p tsconfig.json

FROM node:20-bookworm-slim AS runtime
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    dumb-init \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/persistence/schema.sql ./dist/persistence/schema.sql
COPY package.json ./

RUN mkdir -p /app/data /app/logs
VOLUME ["/app/data"]

EXPOSE 3001 8800

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.js"]
