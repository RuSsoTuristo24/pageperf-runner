FROM node:22-alpine

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/

# Worker is not installed in Docker — exclude its deps
# but pnpm workspace needs the file to exist
RUN mkdir -p apps/worker && echo '{"name":"@webperf/worker","version":"0.0.0","private":true}' > apps/worker/package.json

RUN corepack pnpm install --frozen-lockfile --filter @webperf/api --filter @webperf/shared

COPY packages/shared/ packages/shared/
COPY apps/api/ apps/api/

# Stub worker exports so API can import type-only references
RUN mkdir -p apps/worker/src && \
    echo 'export function captureAuthSession() { throw new Error("worker not available in Docker"); }' > apps/worker/src/index.ts && \
    echo 'export function createRunner() { return { start() { throw new Error("worker not available in Docker"); } }; }' >> apps/worker/src/index.ts && \
    echo 'export function defaultExecuteLiveRun() { throw new Error("worker not available in Docker"); }' >> apps/worker/src/index.ts && \
    echo 'export function validateAuthSession() { throw new Error("worker not available in Docker"); }' >> apps/worker/src/index.ts

EXPOSE 4310

CMD ["corepack", "pnpm", "--filter", "@webperf/api", "dev"]
