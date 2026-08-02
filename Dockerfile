# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=1panel/node:22.22.2@sha256:4cb7297e1c72cac9ee17659f28807f4756cefd4a13cf7bc2c0ba7254c616bb28

FROM ${NODE_IMAGE} AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN --mount=type=cache,id=frontmind-website-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .
ARG FRONTMIND_BUILD_SHA
ENV FRONTMIND_BUILD_SHA=$FRONTMIND_BUILD_SHA
RUN test "${#FRONTMIND_BUILD_SHA}" -eq 40 \
    && ! printf '%s' "$FRONTMIND_BUILD_SHA" | grep -q '[^0-9a-f]' \
    && pnpm build:release \
    && pnpm prune --prod

FROM ${NODE_IMAGE} AS runtime

ARG FRONTMIND_BUILD_SHA
ENV NODE_ENV=production
ENV PORT=8888
ENV HOME=/home/frontmind
WORKDIR /app

LABEL org.opencontainers.image.source="https://github.com/xiafanzeng/frontmind-website" \
      org.opencontainers.image.revision="$FRONTMIND_BUILD_SHA"

RUN groupadd --gid 10002 frontmind \
    && useradd --uid 10002 --gid 10002 --create-home --home-dir /home/frontmind \
      --shell /usr/sbin/nologin frontmind

COPY --from=build --chown=10002:10002 /app/package.json /app/pnpm-lock.yaml ./
COPY --from=build --chown=10002:10002 /app/node_modules ./node_modules
COPY --from=build --chown=10002:10002 /app/dist ./dist

USER 10002:10002
EXPOSE 8888
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=4 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8888/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "dist/index.js"]
