# syntax=docker/dockerfile:1

# =============================================================================
# dev stage — for `scripts/dev.sh --docker` / `--compose` with HMR.
# Source tree is bind-mounted at /app by the caller; node_modules lives in a
# named volume so native bindings (@parcel/watcher, node-pty) match the
# container architecture rather than the host's.
# =============================================================================
FROM node:20-bookworm AS dev

RUN apt-get update && apt-get install -y \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=development
ENV HOST=0.0.0.0
ENV PORT=3000
# Next.js / webpack: poll filesystem when inotify events don't propagate
# through the host→container bind mount (mainly Docker Desktop on macOS /
# Windows). Harmless on native Linux where inotify works.
ENV WATCHPACK_POLLING=true
ENV CHOKIDAR_USEPOLLING=1

EXPOSE 3000

# Install-on-boot: first launch populates the node_modules volume with the
# correct per-arch native bindings; subsequent launches short-circuit.
CMD ["sh", "-lc", "\
  if [ ! -f node_modules/.package-lock.json ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then \
    echo '[dev] installing deps inside container...'; \
    npm install --no-audit --no-fund; \
  fi; \
  exec node server.js \
"]

# =============================================================================
# prod build stages
# =============================================================================
FROM node:20-bookworm AS builder

RUN apt-get update && apt-get install -y \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runner

RUN apt-get update && apt-get install -y \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs claudegui

COPY --from=builder /app/next.config.js ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/server.js ./
COPY --from=builder /app/server-handlers ./server-handlers

RUN chown -R claudegui:nodejs /app

USER claudegui

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
