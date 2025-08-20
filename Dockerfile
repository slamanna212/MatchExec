FROM node:24-alpine AS base

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

FROM base AS builder
RUN npm ci
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app

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

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

CMD ["pm2-runtime", "ecosystem.config.js"]