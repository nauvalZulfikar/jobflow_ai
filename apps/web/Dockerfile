FROM node:20-slim AS base
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
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN groupadd -r jobflow && useradd -r -g jobflow jobflow
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/packages/db/src/generated/client/*.so.node ./packages/db/src/generated/client/
RUN mkdir -p /app/apps/web/.next/cache && chown -R jobflow:jobflow /app/apps/web/.next/cache
USER jobflow
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "apps/web/server.js"]
