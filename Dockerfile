# Support multi-platform builds
FROM --platform=$BUILDPLATFORM node:24-alpine AS builder

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
    && npm install -g pm2 tsx \
    && npm cache clean --force

# Install s6-overlay
ARG S6_OVERLAY_VERSION=3.2.0.0
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

# Copy runtime dependencies and application files
COPY --from=builder /app/processes ./processes
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/src ./src
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/data ./data
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/scripts ./scripts

# Copy production node_modules from builder (already pruned and includes ARM-compiled binaries)
# Next.js standalone has its own optimized subset, this adds the missing process deps
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules

# Copy s6-overlay configuration
COPY --chmod=755 s6-overlay/s6-rc.d /etc/s6-overlay/s6-rc.d/
COPY --chmod=755 s6-overlay/cont-init.d /etc/cont-init.d/

# Create app_data directory and set ownership
RUN mkdir -p /app/app_data/data /app/logs && \
    chown -R abc:abc /app/app_data /app/logs

# Set default PUID/PGID for Unraid compatibility
ENV PUID=99
ENV PGID=100

EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0

# Add health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Use s6-overlay init system
ENTRYPOINT ["/init"]