FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates dumb-init \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY worker ./worker

# Normalize source permissions so the unprivileged runtime user can
# traverse/read worker code regardless of host workspace ACLs.
RUN find /app/worker -type d -exec chmod 755 {} + \
 && find /app/worker -type f -exec chmod 644 {} +

USER node

HEALTHCHECK --interval=60s --timeout=20s --start-period=30s --retries=3 \
  CMD ["node","worker/evidence-worker.mjs","--media-check"]

ENTRYPOINT ["dumb-init","--"]
CMD ["node","worker/evidence-worker.mjs","--run"]
