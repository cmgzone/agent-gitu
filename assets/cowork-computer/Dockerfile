FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git python3 ca-certificates xvfb openbox xterm scrot x11-utils x11-xserver-utils fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
WORKDIR /computer
RUN npm init -y && npm install --save-exact playwright@1.58.2 && npx playwright install --with-deps chromium
RUN useradd --create-home --uid 1001 agent && mkdir -p /workspace && chown agent:agent /workspace
COPY server.cjs /computer/server.cjs
COPY start-desktop.sh /computer/start-desktop.sh
RUN sed -i 's/\r$//' /computer/start-desktop.sh && chmod 755 /computer/start-desktop.sh
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV DISPLAY=:99
RUN mv /root/.cache/ms-playwright /ms-playwright && chmod -R a+rX /ms-playwright
USER agent
WORKDIR /workspace
CMD ["/bin/sh", "/computer/start-desktop.sh"]
