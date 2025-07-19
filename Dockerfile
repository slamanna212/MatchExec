# Multi-stage build for MatchExec
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/frontend/package*.json ./packages/frontend/
COPY apps/web-server/package*.json ./apps/web-server/
COPY apps/discord-bot/package*.json ./apps/discord-bot/
COPY apps/scheduler/package*.json ./apps/scheduler/
COPY apps/ocr/package*.json ./apps/ocr/

# Install all dependencies (including dev dependencies for build)
RUN npm ci && npm cache clean --force

# Copy TypeScript configurations
COPY tsconfig.json ./
COPY packages/shared/tsconfig.json ./packages/shared/
COPY packages/frontend/tsconfig.json ./packages/frontend/
COPY apps/web-server/tsconfig.json ./apps/web-server/
COPY apps/discord-bot/tsconfig.json ./apps/discord-bot/
COPY apps/scheduler/tsconfig.json ./apps/scheduler/
COPY apps/ocr/tsconfig.json ./apps/ocr/

# Copy source code
COPY packages/ ./packages/
COPY apps/ ./apps/

# Generate Prisma client
RUN cd packages/shared && npx prisma generate

# Build all TypeScript projects
RUN npm run build

# Build React frontend
RUN cd packages/frontend && npm run build

# Production stage
FROM node:18-alpine AS production

# Install PM2 globally
RUN npm install -g pm2

# Install system dependencies for potential OCR libraries
RUN apk add --no-cache \
    sqlite \
    curl \
    bash

# Create app user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S matchexec -u 1001

# Set working directory
WORKDIR /app

# Copy built application from builder stage
COPY --from=builder --chown=matchexec:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=matchexec:nodejs /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=matchexec:nodejs /app/packages/shared/src/generated ./packages/shared/src/generated
COPY --from=builder --chown=matchexec:nodejs /app/packages/frontend/build ./packages/frontend/build
COPY --from=builder --chown=matchexec:nodejs /app/apps/web-server/dist ./apps/web-server/dist
COPY --from=builder --chown=matchexec:nodejs /app/apps/discord-bot/dist ./apps/discord-bot/dist
COPY --from=builder --chown=matchexec:nodejs /app/apps/scheduler/dist ./apps/scheduler/dist
COPY --from=builder --chown=matchexec:nodejs /app/apps/ocr/dist ./apps/ocr/dist

# Copy configuration files
COPY --chown=matchexec:nodejs ecosystem.config.js ./
COPY --chown=matchexec:nodejs packages/shared/prisma ./packages/shared/prisma
COPY --chown=matchexec:nodejs environment.example ./.env.example

# Create necessary directories
RUN mkdir -p logs database && \
    chown -R matchexec:nodejs logs database

# Create default environment file if none exists
RUN if [ ! -f .env ]; then cp .env.example .env; fi

# Switch to non-root user
USER matchexec

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Expose ports
EXPOSE 3000

# Default command starts all services with PM2
CMD ["pm2-runtime", "start", "ecosystem.config.js", "--env", "production"] 