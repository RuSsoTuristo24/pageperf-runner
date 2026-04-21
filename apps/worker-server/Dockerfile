FROM debian:bookworm-slim

# System deps + Xvfb + x11vnc + noVNC + websockify + Chrome + supervisord
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl gnupg xvfb x11vnc supervisor \
      novnc websockify \
      x11-utils \
      fonts-liberation libasound2 libnss3 libgbm1 libxss1 \
      libxtst6 libxrandr2 libxdamage1 libxcomposite1 libxfixes3 \
      libpango-1.0-0 libcairo2 libcups2 libatk1.0-0 libatk-bridge2.0-0 \
      libgtk-3-0 libxkbcommon0 libxcursor1 libxi6 \
      && rm -rf /var/lib/apt/lists/*

# Google Chrome stable
RUN mkdir -p /etc/apt/keyrings \
 && curl -fsSL https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /etc/apt/keyrings/google-chrome.gpg \
 && echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/google-chrome.gpg] https://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
 && apt-get update && apt-get install -y --no-install-recommends google-chrome-stable \
 && rm -rf /var/lib/apt/lists/*

# Node 22
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*

# pnpm via corepack
RUN corepack enable

WORKDIR /app

# Copy workspace
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY apps/worker-server/package.json apps/worker-server/
COPY apps/worker/package.json apps/worker/
COPY packages/shared/package.json packages/shared/

RUN corepack pnpm install --frozen-lockfile

COPY apps/worker-server apps/worker-server
COPY apps/worker apps/worker
COPY packages/shared packages/shared

COPY apps/worker-server/supervisord.conf /etc/supervisor/conf.d/worker.conf

ENV DISPLAY=:99
ENV WORKER_PORT=4311
ENV CHROME_PATH=/usr/bin/google-chrome

EXPOSE 6080 4311

CMD ["/usr/bin/supervisord", "-n", "-c", "/etc/supervisor/supervisord.conf"]
