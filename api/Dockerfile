# syntax=docker/dockerfile:1.7
FROM node:22-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ \
      libvips-dev libheif-dev \
    && rm -rf /var/lib/apt/lists/*
COPY package*.json tsconfig.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --production

FROM node:22-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
      libvips libheif1 tini wget \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production PORT=3000
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/migrations ./src/migrations
COPY --from=build /app/package.json ./

# Playwright Chromium + its system deps. --with-deps installs the Debian
# packages Chromium needs (libnss3, libatk-bridge2.0-0, fonts, etc.).
# This adds ~400 MB but is required by the server-side PDF generator at
# /api/admin/print/pdf.
RUN npx playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*

USER node
EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/index.js"]
