# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache python3 make g++ vips-dev libheif-dev
COPY package*.json tsconfig.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --production

FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache vips libheif tini
ENV NODE_ENV=production PORT=3000
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/migrations ./src/migrations
COPY --from=build /app/package.json ./
USER node
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
