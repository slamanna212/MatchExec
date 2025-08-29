# Support multi-platform builds
FROM --platform=$BUILDPLATFORM node:24-alpine AS base

WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci --only=production

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

FROM node:24-alpine AS runner
WORKDIR /app

# Install build dependencies for native modules in runner stage
RUN apk add --no-cache python3 make g++

RUN npm install -g pm2

# Copy minimal package.json for processes and install only required dependencies
COPY --from=builder /app/processes-package.json ./package.json
RUN npm install --only=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

COPY --from=builder /app/processes ./processes
COPY --from=builder /app/lib ./lib
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

# Add health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node scripts/health-check.js

CMD ["pm2-runtime", "ecosystem.config.js"]