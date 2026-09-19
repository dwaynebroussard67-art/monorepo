# Build context is the monorepo root (workspace deps are required).
FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /workspace
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps/notion-living-docs ./apps/notion-living-docs
RUN pnpm install --frozen-lockfile
EXPOSE 4004
CMD ["pnpm", "--filter", "notion-living-docs", "start"]
