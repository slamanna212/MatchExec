# Builder stage - uses TARGETPLATFORM by default for correct musl binaries
FROM node:24-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache python3 py3-setuptools make g++ git

# Copy package files and install all dependencies
COPY package*.json ./
RUN npm ci

# Copy source code files in order of change frequency (least to most likely to change)
COPY shared ./shared
COPY lib ./lib
COPY data ./data
COPY migrations ./migrations
COPY scripts ./scripts
COPY processes ./processes
COPY processes-package.json ./
COPY src ./src
COPY public ./public
COPY *.config.* ./
COPY tsconfig.json ./

# Build Next.js app and bundle processes
RUN npm run build

# Prune dev dependencies while we still have build tools (needed for native modules on ARM)
RUN npm prune --omit=dev

FROM node:24-alpine AS runner
WORKDIR /app

# Install required packages for s6-overlay and runtime
RUN apk add --no-cache \
    bash \
    coreutils \
    shadow \
    tzdata \
    git \
    curl \
    ffmpeg \
    && npm install -g pm2 tsx \
    && npm cache clean --force

# Install s6-overlay
ARG S6_OVERLAY_VERSION=3.2.0.3
ARG S6_OVERLAY_ARCH=x86_64

RUN curl -L "https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-noarch.tar.xz" | tar -C / -Jxpf - && \
    curl -L "https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-${S6_OVERLAY_ARCH}.tar.xz" | tar -C / -Jxpf -

# Set s6-overlay environment variables
ENV S6_BEHAVIOUR_IF_STAGE2_FAILS=2
ENV S6_CMD_WAIT_FOR_SERVICES_MAXTIME=0
ENV S6_SYNC_DISKS=1
ENV S6_RC_STARTUP_TIMEOUT=30000
ENV S6_VERBOSITY=2

# Create abc user (standard for s6-overlay containers)
RUN addgroup -g 1001 abc && \
    adduser -u 1001 -G abc -h /config -s /bin/bash -D abc

# Copy built Next.js application (includes minimal node_modules)
COPY --from=builder /app/public ./public
COPY --from=builder --chown=abc:abc /app/.next/standalone ./
COPY --from=builder --chown=abc:abc /app/.next/static ./.next/static

# Copy bundled process files (optimized with esbuild)
COPY --from=builder /app/dist ./dist

# Copy runtime dependencies and application files (needed by processes and migrations)
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/src ./src
COPY --from=builder /app/shared ./shared
COPY --from=builder --chown=abc:abc /app/data ./data
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/scripts ./scripts

# Copy migration runner script directly from host with execute permissions
COPY --chmod=755 scripts/run-migrations.sh ./scripts/

# Copy package files for reference
COPY --from=builder /app/package.json /app/package-lock.json ./

# Copy ONLY the process-specific dependencies that aren't in Next.js standalone
# Standalone already has: sqlite3, and other common packages
# We need to add: Discord.js ecosystem and their dependencies
COPY --from=builder /app/node_modules/discord.js ./node_modules/discord.js
COPY --from=builder /app/node_modules/@discordjs ./node_modules/@discordjs
COPY --from=builder /app/node_modules/@snazzah ./node_modules/@snazzah
COPY --from=builder /app/node_modules/bufferutil ./node_modules/bufferutil
COPY --from=builder /app/node_modules/node-cron ./node_modules/node-cron

# Copy Discord.js dependencies (all of them to avoid missing module errors)
COPY --from=builder /app/node_modules/@sapphire ./node_modules/@sapphire
COPY --from=builder /app/node_modules/@vladfrangu ./node_modules/@vladfrangu
COPY --from=builder /app/node_modules/discord-api-types ./node_modules/discord-api-types
COPY --from=builder /app/node_modules/ws ./node_modules/ws
COPY --from=builder /app/node_modules/prism-media ./node_modules/prism-media
COPY --from=builder /app/node_modules/magic-bytes.js ./node_modules/magic-bytes.js
COPY --from=builder /app/node_modules/fast-deep-equal ./node_modules/fast-deep-equal
COPY --from=builder /app/node_modules/lodash ./node_modules/lodash
COPY --from=builder /app/node_modules/lodash.snakecase ./node_modules/lodash.snakecase
COPY --from=builder /app/node_modules/ts-mixer ./node_modules/ts-mixer

# Common dependencies (may be duplicated with standalone but needed for processes)
COPY --from=builder /app/node_modules/undici ./node_modules/undici
COPY --from=builder /app/node_modules/tslib ./node_modules/tslib

# Native addon and build dependencies
COPY --from=builder /app/node_modules/node-addon-api ./node_modules/node-addon-api
COPY --from=builder /app/node_modules/node-gyp-build ./node_modules/node-gyp-build
COPY --from=builder /app/node_modules/bindings ./node_modules/bindings
COPY --from=builder /app/node_modules/file-uri-to-path ./node_modules/file-uri-to-path

# Copy s6-overlay configuration
COPY --chmod=755 s6-overlay/s6-rc.d /etc/s6-overlay/s6-rc.d/
COPY --chmod=755 s6-overlay/cont-init.d /etc/cont-init.d/

# Create app_data directory and set ownership
RUN mkdir -p /app/app_data/data /app/logs && \
    chown -R abc:abc /app/app_data /app/logs

# Note: PUID/PGID can be set at runtime (defaults to 1001:1001 in cont-init.d/10-adduser)
# Unraid users should set -e PUID=99 -e PGID=100 when running the container

EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0

# Add health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Use s6-overlay init system
ENTRYPOINT ["/init"]