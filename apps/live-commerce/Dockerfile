# Build context is the monorepo root (workspace deps are required).
FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /workspace
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps/live-commerce ./apps/live-commerce
RUN pnpm install --frozen-lockfile
EXPOSE 4001
CMD ["pnpm", "--filter", "live-commerce", "start"]
