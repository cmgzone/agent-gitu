FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends nginx tini git curl ca-certificates python3 \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production AGENT_GITU_HOME=/data AGENT_GITU_TRUST_LOCAL_PROXY=1
WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY assets ./assets
COPY voice-worker/agent.mjs voice-worker/package.json voice-worker/package-lock.json voice-worker/Dockerfile ./voice-worker/
COPY deploy/nginx.conf /etc/nginx/nginx.conf
COPY deploy/start.sh /usr/local/bin/start-gitu
COPY deploy/verify-hosted-runtime.mjs ./deploy/verify-hosted-runtime.mjs
RUN chmod +x /usr/local/bin/start-gitu && mkdir -p /data && chown node:node /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD curl -fsS http://127.0.0.1:8080/healthz || exit 1
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/usr/local/bin/start-gitu"]
