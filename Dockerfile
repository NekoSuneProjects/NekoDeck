# Build the web bundle on the native GitHub runner platform. NekoDeck's
# production dependencies are currently pure JavaScript, so they can be
# prepared once and copied into both target runtime images without executing
# Node under target-platform QEMU.
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build:web
RUN mkdir -p /empty-data

FROM --platform=$BUILDPLATFORM node:22-alpine AS prod-deps
WORKDIR /deps
COPY package*.json ./
RUN npm install --omit=dev --ignore-scripts && npm cache clean --force

# Root's package builder launches a native publishing executable. Use a glibc
# runtime (Debian) rather than Alpine/musl so on-demand Root .pkg builds have a
# compatible native runtime. This target stage intentionally has no RUN
# commands, so amd64/arm64 images can still be assembled without executing
# target binaries under QEMU.
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3210 NEKODECK_DATA_DIR=/data
WORKDIR /app
COPY --chown=node:node package.json ./package.json
COPY --chown=node:node --from=prod-deps /deps/node_modules ./node_modules
COPY --chown=node:node --from=build /app/dist ./dist
COPY --chown=node:node server ./server
COPY --chown=node:node shared ./shared
COPY --chown=node:node --from=build /empty-data /data
USER node
EXPOSE 3210
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:3210/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "server/start.cjs"]
