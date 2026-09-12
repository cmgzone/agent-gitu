FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git python3 ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /computer
RUN npm init -y && npm install --save-exact playwright@1.58.2 && npx playwright install --with-deps chromium
RUN useradd --create-home --uid 1001 agent && mkdir -p /workspace && chown agent:agent /workspace
COPY server.cjs /computer/server.cjs
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN mv /root/.cache/ms-playwright /ms-playwright && chmod -R a+rX /ms-playwright
USER agent
WORKDIR /workspace
CMD ["node", "/computer/server.cjs"]
