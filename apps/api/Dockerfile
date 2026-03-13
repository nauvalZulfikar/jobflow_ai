FROM node:20-alpine AS base
RUN apk add --no-cache openssl
RUN npm install -g pnpm@9

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
