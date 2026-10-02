FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git python3 ca-certificates xvfb openbox xterm scrot x11-utils x11-xserver-utils fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
WORKDIR /computer
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
RUN node --input-type=module -e "import fs from 'node:fs'; import {execFileSync} from 'node:child_process'; const arch=execFileSync('dpkg',['--print-architecture'],{encoding:'utf8'}).trim(); if(!['amd64','arm64'].includes(arch)) throw Error('Unsupported Chrome architecture'); const response=await fetch('https://dl.google.com/linux/direct/google-chrome-stable_current_'+arch+'.deb'); if(!response.ok) throw Error('Chrome download failed: '+response.status); fs.writeFileSync('/tmp/gitu-chrome.deb',Buffer.from(await response.arrayBuffer()));" \
    && apt-get update && apt-get install -y --no-install-recommends /tmp/gitu-chrome.deb \
    && rm -f /tmp/gitu-chrome.deb && rm -rf /var/lib/apt/lists/*
RUN mkdir -p /tmp/.X11-unix /tmp/.ICE-unix && chmod 1777 /tmp/.X11-unix /tmp/.ICE-unix
USER agent
WORKDIR /workspace
CMD ["/bin/sh", "/computer/start-desktop.sh"]
