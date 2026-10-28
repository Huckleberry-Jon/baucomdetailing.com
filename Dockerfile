ARG NODE_IMAGE=node:24-bookworm-slim
FROM ${NODE_IMAGE} AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

FROM dependencies AS checks
COPY src ./src
COPY public ./public
COPY migrations ./migrations
COPY test ./test
RUN npm test

FROM ${NODE_IMAGE} AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends gosu tini ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=checks --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node public ./public
COPY --chown=node:node migrations ./migrations
COPY --chown=node:node scripts ./scripts
COPY test/fixtures/heic/COPYING /app/licenses/libheif-COPYING
COPY deployment/container-entrypoint.sh /usr/local/bin/docdetailing-entrypoint
RUN chmod 755 /usr/local/bin/docdetailing-entrypoint
ENV NODE_ENV=production
EXPOSE 10000
ENTRYPOINT ["/usr/bin/tini","--","/usr/local/bin/docdetailing-entrypoint"]
CMD ["node","--max-old-space-size=512","src/server.js"]
