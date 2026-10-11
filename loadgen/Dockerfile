# Stage 1: Dependency resolution and caching
FROM oven/bun:1.4.3-alpine AS deps
WORKDIR /app

ENV NODE_ENV=production

COPY package.json bun.lock* ./
RUN bun install --production --frozen-lockfile --ignore-scripts

# Stage 2: Minimal runtime image
FROM oven/bun:1.4.3-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY --chown=bun:bun --from=deps /app/node_modules ./node_modules
COPY --chown=bun:bun package.json ./
COPY --chown=bun:bun *.ts ./

USER bun

EXPOSE 8080

CMD ["bun", "run", "index.ts"]
