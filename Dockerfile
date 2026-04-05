# ─── Stage 1: Dependencies ───────────────────────────────────────────────────
FROM oven/bun:1-alpine AS deps

WORKDIR /app

# Install git (needed by some deps) and build tools
RUN apk add --no-cache libc6-compat

# Copy package files first for better layer caching
COPY package.json bun.lock ./
COPY mini-services/socket-service/package.json ./mini-services/socket-service/
COPY mini-services/realtime-service/package.json ./mini-services/realtime-service/

# Install ALL dependencies (prod + dev — needed for build)
RUN bun install --frozen-lockfile

# ─── Stage 2: Build ──────────────────────────────────────────────────────────
FROM oven/bun:1-alpine AS builder

WORKDIR /app

RUN apk add --no-cache libc6-compat

# Copy node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/mini-services/socket-service/node_modules ./mini-services/socket-service/node_modules

# Copy full source
COPY . .

# Generate Prisma client
RUN bunx prisma generate

# Build Next.js (standalone output already configured in next.config.ts)
RUN bun run build

# ─── Stage 3: Production Runner ──────────────────────────────────────────────
FROM oven/bun:1-alpine AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Install runtime dependencies
RUN apk add --no-cache libc6-compat openssl

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Create required directories
RUN mkdir -p /app/db /app/upload && \
    chown -R nextjs:nodejs /app

# Copy standalone Next.js build
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# Copy static assets (public + .next/static)
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Copy Prisma schema (needed for migrations at runtime)
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# Copy generated Prisma client
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

# Copy mini-services (socket-service)
COPY --from=builder --chown=nextjs:nodejs /app/mini-services/socket-service ./mini-services/socket-service
COPY --from=builder --chown=nextjs:nodejs /app/mini-services/socket-service/node_modules ./mini-services/socket-service/node_modules

# Copy entrypoint script
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# Switch to non-root user
USER nextjs

# Expose the main app port
EXPOSE 3000

# Health check for the main Next.js server
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

# Run the entrypoint script (starts socket-service + Next.js)
ENTRYPOINT ["./docker-entrypoint.sh"]
