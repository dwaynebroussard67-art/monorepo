# Build context is the monorepo root (workspace deps are required).
FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /workspace
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps/eventbrite-matchmaking ./apps/eventbrite-matchmaking
RUN pnpm install --frozen-lockfile
EXPOSE 4009
CMD ["pnpm", "--filter", "eventbrite-matchmaking", "start"]
