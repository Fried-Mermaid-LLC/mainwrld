# Multi-stage build for the NestJS API in a pnpm workspace.
# Build context is the REPO ROOT: `docker build -f apps/api/Dockerfile .`

FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /repo

# ---- deps: install workspace deps using only manifests (better layer cache) ----
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/types/package.json packages/types/
RUN pnpm install --frozen-lockfile --filter @mainwrld/api... --filter @mainwrld/types

# ---- build: compile types then api, then produce a self-contained deploy ----
FROM deps AS build
COPY packages/types packages/types
COPY apps/api apps/api
RUN pnpm --filter @mainwrld/types build \
 && pnpm --filter @mainwrld/api build
# `pnpm deploy` flattens the workspace into a standalone node_modules tree.
RUN pnpm --filter @mainwrld/api deploy --prod --legacy /app

# ---- runtime ----
FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
# Cloud Run injects PORT; main.ts listens on it (default 8080).
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
EXPOSE 8080
CMD ["node", "dist/main.js"]
