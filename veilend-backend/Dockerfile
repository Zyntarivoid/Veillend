# ─────────────────────────────────────────────────────────────
# VeilLend Backend – Multi-stage Docker Build
# ─────────────────────────────────────────────────────────────

# ── Stage 1: Dependencies (all, for build) ───────────────────
FROM node:20-alpine AS deps

WORKDIR /app

# OpenSSL required by Prisma's native query engine on Alpine
RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
COPY prisma ./prisma/

RUN npm ci

# ── Stage 2: Build ───────────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

RUN apk add --no-cache openssl

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json tsconfig.build.json nest-cli.json ./
COPY prisma ./prisma/
COPY src ./src/
COPY scripts ./scripts/

RUN npx nest build

# ── Stage 3: Production ─────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

RUN apk add --no-cache openssl && \
    addgroup -S appuser && adduser -S appuser -G appuser

ENV NODE_ENV=production \
    PORT=3000

COPY package.json package-lock.json ./
COPY prisma ./prisma/

# Install production-only dependencies and generate Prisma Client
RUN npm ci --omit=dev && \
    npx prisma generate

# Copy the built application from the build stage
COPY --from=build /app/dist ./dist

# Entrypoint runs migrations then starts the app
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', r => process.exit(r.statusCode === 200 ? 0 : 1))"

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "dist/main"]
