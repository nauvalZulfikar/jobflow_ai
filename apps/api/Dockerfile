FROM node:20-alpine AS base
RUN apk add --no-cache openssl chromium nss freetype harfbuzz ca-certificates ttf-freefont
RUN npm install -g pnpm@9

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

FROM base AS runner
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.json ./
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @jobflow/db run db:generate
RUN addgroup -S jobflow && adduser -S jobflow -G jobflow && chown -R jobflow:jobflow /app
USER jobflow
EXPOSE 3001
CMD ["pnpm", "--filter", "@jobflow/api", "start"]
