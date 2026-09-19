# Build context is the monorepo root (workspace deps are required).
FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /workspace
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps/calendly-meeting-intel ./apps/calendly-meeting-intel
RUN pnpm install --frozen-lockfile
EXPOSE 4002
CMD ["pnpm", "--filter", "calendly-meeting-intel", "start"]
