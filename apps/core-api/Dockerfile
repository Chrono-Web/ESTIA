FROM node:24.18.0-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

WORKDIR /workspace

FROM base AS dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/core-api/package.json apps/core-api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/testing/package.json packages/testing/package.json

RUN pnpm install --frozen-lockfile

FROM dependencies AS build

COPY tsconfig.base.json tsconfig.json ./
COPY apps/core-api apps/core-api
COPY apps/web apps/web
COPY packages packages

RUN pnpm run build \
    && pnpm --filter @estia/core-api deploy --legacy --prod /opt/estia

FROM node:24.18.0-bookworm-slim AS runtime

ENV NODE_ENV=production

WORKDIR /app

RUN groupadd --system --gid 10001 estia \
    && useradd --system --uid 10001 --gid estia --create-home --shell /usr/sbin/nologin estia

# Database and instance identity live here. Created with the right ownership so
# that a volume mounted on top inherits it and stays writable for a non-root user.
RUN mkdir -p /data && chown estia:estia /data

ENV ESTIA_DATA_DIR=/data

COPY --from=build --chown=estia:estia /opt/estia ./

USER estia

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:' + (process.env.ESTIA_PORT || '3000') + '/health/ready').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/server.js"]
