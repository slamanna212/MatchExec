# Support multi-platform builds
FROM --platform=$BUILDPLATFORM node:24-alpine AS base

WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache python3 py3-setuptools make g++

COPY package*.json ./
RUN npm ci --omit=dev --production

FROM base AS builder
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

# Create separate stage for production dependencies only
FROM node:24-alpine AS production-deps
WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache python3 py3-setuptools make g++

# Copy and install only production dependencies
COPY production.package.json ./package.json
RUN npm install && \
    rm -rf /app/node_modules/*/test* /app/node_modules/*/tests* /app/node_modules/*/example* /app/node_modules/*/docs* /app/node_modules/*/*.md 2>/dev/null || true && \
    npm cache clean --force

FROM node:24-alpine AS runner
WORKDIR /app

# Only install pm2 - no build tools needed in runner
RUN npm install -g pm2 && npm cache clean --force

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy only production node_modules from production-deps stage
COPY --from=production-deps /app/node_modules ./node_modules

COPY --from=builder /app/processes ./processes
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/src ./src
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/data ./data
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/ecosystem.config.js ./
COPY --from=builder /app/scripts ./scripts

# Create app_data directory and set ownership
RUN mkdir -p /app/app_data/data && chown -R nextjs:nodejs /app/app_data

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0

# Add health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node scripts/health-check.js

CMD ["npx", "tsx", "scripts/docker-start.ts"]