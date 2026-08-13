# Build the web bundle on the native GitHub runner platform. The NekoDeck
# runtime dependencies are pure JavaScript, so they can be prepared once and
# copied into both amd64 and arm64 runtime images without executing Node under
# QEMU (which is unreliable with the current Node 22 Alpine image).
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

# This stage is resolved independently for each TARGETPLATFORM. It intentionally
# contains no RUN commands, so an ARM64 image can be assembled on an x64 runner
# without running npm/node through QEMU.
FROM node:22-alpine AS runtime
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
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD wget -q -O - http://127.0.0.1:3210/api/health >/dev/null || exit 1
CMD ["node", "server/start.cjs"]
