FROM oven/bun:1.4.2-alpine
WORKDIR /app

ENV NODE_ENV=production

COPY package.json bun.lock* ./
RUN bun install --production --frozen-lockfile

COPY . .

USER bun

ENV PORT=8080
EXPOSE 8080

CMD ["bun", "run", "index.ts"]
