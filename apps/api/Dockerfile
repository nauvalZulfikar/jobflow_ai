FROM node:20-alpine AS base
RUN npm install -g pnpm@9

FROM base AS builder
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.json ./
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @jobflow/db generate
RUN pnpm --filter @jobflow/api build

FROM base AS runner
WORKDIR /app
RUN addgroup -S jobflow && adduser -S jobflow -G jobflow
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
USER jobflow
EXPOSE 3001
CMD ["node", "apps/api/dist/server.js"]
