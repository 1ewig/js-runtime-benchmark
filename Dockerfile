FROM oven/bun:1.4.2-alpine
WORKDIR /app

ENV NODE_ENV=production

COPY package.json bun.lock* ./
RUN bun install --production --frozen-lockfile

COPY . .

USER bun

ENV PORT=3000
EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
