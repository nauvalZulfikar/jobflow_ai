FROM node:20-alpine AS base
RUN npm install -g pnpm@9

FROM base AS runner
WORKDIR /app
RUN addgroup -S jobflow && adduser -S jobflow -G jobflow
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.json ./
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @jobflow/db run db:generate
USER jobflow
EXPOSE 3001
CMD ["pnpm", "--filter", "@jobflow/api", "start"]
