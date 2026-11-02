# Builder stage - uses TARGETPLATFORM by default for correct musl binaries
FROM node:26-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache python3 py3-setuptools make g++ git

# Enable pnpm via Corepack (version pinned by "packageManager" in package.json)
COPY package.json ./
# Node 25+ no longer bundles Corepack, so install it first
RUN npm install -g corepack && corepack enable && corepack install

# Fetch dependencies into the pnpm store (cached until the lockfile changes),
# then install from the store without network access
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store pnpm fetch
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile --offline

# Copy source code files in order of change frequency (least to most likely to change)
COPY shared ./shared
COPY lib ./lib
COPY data ./data
COPY migrations ./migrations
COPY drizzle ./drizzle
COPY scripts ./scripts
COPY processes ./processes
COPY src ./src
COPY public ./public
COPY ecosystem.config.js vite.config.mts tsconfig.json ./
COPY esbuild.discord-bot.config.mjs esbuild.scheduler.config.mjs esbuild.migrate.config.mjs esbuild.import-sqlite.config.mjs esbuild.server.config.mjs esbuild.stats-processor.config.mjs eslint.config.mjs ./

# Build the Vite client (dist/client), the Hono server and the process bundles
RUN pnpm run build

# Prune dev dependencies while we still have build tools (needed for native modules on ARM)
RUN pnpm prune --prod

# Collect only the process-specific deps (and their transitive deps) from node_modules
RUN node scripts/collect-process-deps.mjs /tmp/process-deps/node_modules

FROM node:26-alpine AS runner
WORKDIR /app

# Install required packages for s6-overlay and runtime
RUN apk add --no-cache \
    bash \
    coreutils \
    shadow \
    tzdata \
    git \
    curl \
    ffmpeg

# Embedded PostgreSQL 18 (all-in-one mode) plus the client tools (pg_dump / pg_restore for backups, psql, pg_isready).
# Installed from the same Alpine release as the node base image, so musl and every shared library agree. The package
# name pins the MAJOR (a new major is a deliberate edit here plus the upgrade notes in docs/postgres-major-upgrade.md);
# minors/patches arrive with each image rebuild. Dependabot cannot see apk packages, so rebuild regularly.
RUN apk add --no-cache postgresql18 postgresql18-client

# Install s6-overlay
ARG S6_OVERLAY_VERSION=3.2.3.2
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

# Copy bundled server + processes + Vite client (dist/client), built by esbuild/vite
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
RUN chmod -R a-w /app/public /app/dist/client

# Drizzle SQL migrations (applied by dist/migrate.js)
COPY --from=builder /app/drizzle ./drizzle

# Runtime data read from the working directory (cwd = /app): game data for the seeder (read-only), and the legacy
# SQLite migrations used by the one-time importer. Application code itself is fully bundled in dist/.
COPY --from=builder --chown=abc:abc /app/data ./data
RUN chmod -R a-w /app/data
COPY --from=builder /app/migrations ./migrations

# Copy package files for reference
COPY --from=builder /app/package.json /app/pnpm-lock.yaml ./

# Copy process-specific dependencies (auto-collected with transitive deps)
COPY --from=builder /tmp/process-deps/node_modules ./node_modules/

# Copy s6-overlay configuration (service graph, boot scripts, helper scripts)
COPY --chmod=755 s6-overlay/s6-rc.d /etc/s6-overlay/s6-rc.d/
COPY --chmod=755 s6-overlay/cont-init.d /etc/cont-init.d/
COPY --chmod=755 s6-overlay/matchexec /etc/matchexec/

# Create app_data directory and set ownership
RUN mkdir -p /app/app_data/data /app/logs && \
    chown -R abc:abc /app/app_data /app/logs

# Note: PUID/PGID can be set at runtime (defaults to 1001:1001 in cont-init.d/10-adduser)
# Unraid users should set -e PUID=99 -e PGID=100 when running the container

EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production
ENV TZ=UTC

# Docker kills the container 10 s after SIGTERM by default. Apps stop first (they hold the DB), then Postgres does a fast
# shutdown; keep the budget inside that window. Unraid / large databases: also run with `--stop-timeout 30`.
ENV S6_SERVICES_GRACETIME=8000
ENV S6_KILL_GRACETIME=1500

# /api/health reports database connectivity (503 when it is down or the container is in degraded mode).
# The start period covers first-boot initdb + migrations + a possible SQLite import.
HEALTHCHECK --interval=30s --timeout=10s --start-period=180s --retries=3 \
  CMD curl -fsS "http://localhost:${PORT:-3000}/api/health" || exit 1

# Main process: stays idle for the all-in-one container; in a "migrate only" container (MATCHEXEC_SERVICES=migrate, e.g. a
# Kubernetes Job) it exits with the migration's exit code so the Job completes.
CMD ["/etc/matchexec/main"]

# s6-overlay requires root to start its supervision tree; individual services drop to abc (uid 1001) via s6 service config
# nosemgrep: dockerfile.security.missing-user-entrypoint.missing-user-entrypoint
ENTRYPOINT ["/init"]