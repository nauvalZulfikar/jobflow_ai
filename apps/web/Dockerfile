FROM node:20-alpine AS base
RUN apk add --no-cache openssl
RUN npm install -g pnpm@9

FROM base AS builder
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.json ./
COPY packages/ ./packages/
COPY apps/web/ ./apps/web/
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @jobflow/db run db:generate
RUN pnpm --filter @jobflow/web build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S jobflow && adduser -S jobflow -G jobflow
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
USER jobflow
EXPOSE 3000
ENV PORT=3000
CMD ["node", "apps/web/server.js"]
