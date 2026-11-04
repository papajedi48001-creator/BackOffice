FROM node:24-alpine
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json eslint.config.mjs ./
COPY apps/worker ./apps/worker
COPY packages/contracts ./packages/contracts
COPY packages/db ./packages/db
# The daily HOSxP holiday sync (@backoffice/core/holidays).
COPY packages/core ./packages/core
RUN pnpm install --frozen-lockfile
ENV NODE_ENV=production
CMD ["pnpm", "--filter", "@backoffice/worker", "start"]
