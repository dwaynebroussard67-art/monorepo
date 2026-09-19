# Build context is the monorepo root (workspace deps are required).
FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /workspace
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps/patreon-coownership ./apps/patreon-coownership
RUN pnpm install --frozen-lockfile
EXPOSE 4003
CMD ["pnpm", "--filter", "patreon-coownership", "start"]
