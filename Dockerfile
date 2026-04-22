FROM node:22-bookworm-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl \
      && rm -rf /var/lib/apt/lists/*

RUN corepack enable

WORKDIR /app

# Copy workspace manifests first for optimal caching
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY apps/worker-server/package.json apps/worker-server/
COPY packages/shared/package.json packages/shared/

RUN corepack pnpm install --frozen-lockfile

# Now copy sources
COPY apps/api apps/api
COPY apps/web apps/web
COPY apps/worker apps/worker
COPY packages/shared packages/shared

# Build web UI (produces apps/web/dist)
RUN corepack pnpm --filter @pageperf-runner/web build

# ----------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates wget \
      && rm -rf /var/lib/apt/lists/*

RUN corepack enable

WORKDIR /app

# Copy installed deps + built sources from builder
COPY --from=builder /app /app

ENV NODE_ENV=production
ENV PORT=4310
ENV WEB_DIST_PATH=/app/apps/web/dist

EXPOSE 4310

CMD ["corepack", "pnpm", "--filter", "@pageperf-runner/api", "exec", "tsx", "src/server.ts"]
