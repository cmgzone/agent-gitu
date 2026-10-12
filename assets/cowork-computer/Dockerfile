FROM debian:bookworm-slim AS quota-guard
RUN apt-get update && apt-get install -y --no-install-recommends gcc libc6-dev && rm -rf /var/lib/apt/lists/*
COPY quota-guard.c /quota-guard.c
RUN gcc -O2 -Wall -Wextra -Werror -Wl,-z,relro,-z,now -o /quota-guard /quota-guard.c
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git python3 ca-certificates xvfb openbox xterm scrot x11-utils x11-xserver-utils fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
WORKDIR /computer
COPY --from=quota-guard /quota-guard /computer/quota-guard
RUN npm init -y && npm install --save-exact playwright@1.58.2 && npx playwright install --with-deps chromium
RUN useradd --create-home --uid 1001 agent && mkdir -p /workspace && chown agent:agent /workspace
COPY server.cjs /computer/server.cjs
COPY start-desktop.sh /computer/start-desktop.sh
COPY open-browser.cjs /computer/open-browser.cjs
COPY open-agent-browser.cjs /computer/open-agent-browser.cjs
COPY gitu-wallpaper.svg /computer/gitu-wallpaper.svg
RUN sed -i 's/\r$//' /computer/start-desktop.sh && chmod 755 /computer/start-desktop.sh
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV DISPLAY=:99
RUN mv /root/.cache/ms-playwright /ms-playwright && chmod -R a+rX /ms-playwright
RUN apt-get update && apt-get install -y --no-install-recommends xfce4 xfce4-terminal dbus-x11 xdotool mousepad adwaita-icon-theme xdg-utils x11vnc arc-theme papirus-icon-theme fonts-inter && rm -rf /var/lib/apt/lists/*
# ARM64 uses the matching Playwright Chromium installed above. Google's Linux
# desktop package is available only for AMD64.
RUN if [ "$(dpkg --print-architecture)" = amd64 ]; then \
      node --input-type=module -e "import fs from 'node:fs'; const response=await fetch('https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb',{signal:AbortSignal.timeout(120000)}); if(!response.ok) throw Error('Chrome download failed: '+response.status); fs.writeFileSync('/tmp/gitu-chrome.deb',Buffer.from(await response.arrayBuffer()));" \
      && apt-get update && apt-get install -y --no-install-recommends /tmp/gitu-chrome.deb \
      && rm -f /tmp/gitu-chrome.deb && rm -rf /var/lib/apt/lists/*; fi
RUN mkdir -p /tmp/.X11-unix /tmp/.ICE-unix && chmod 1777 /tmp/.X11-unix /tmp/.ICE-unix
USER agent
WORKDIR /workspace
CMD ["/computer/quota-guard", "/bin/sh", "/computer/start-desktop.sh"]
