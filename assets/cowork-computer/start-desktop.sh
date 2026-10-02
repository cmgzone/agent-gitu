#!/bin/sh
set -eu

# The desktop stream listens only inside this sandbox. The authenticated
# broker carries it over Docker stdio; no VNC port is published on the VPS.
# Container restarts preserve /tmp, but the previous X server is gone.
rm -f /tmp/.X99-lock /tmp/.X11-unix/X99
# The old container is stopped before reusing its home volume. Chromium's
# hostname/PID lock symlinks can survive that stop; profile data stays intact.
for profile in "$HOME/browser" "$HOME/manual-browser"; do
  rm -f "$profile/SingletonLock" "$profile/SingletonSocket" "$profile/SingletonCookie"
done
Xvfb "$DISPLAY" -screen 0 1280x800x24 -nolisten tcp -noreset > /tmp/gitu-display.log 2>&1 &
display_pid=$!
cleanup() { kill ${service_pid:-} ${vnc_pid:-} ${manager_pid:-} "$display_pid" 2>/dev/null || true; }
trap cleanup EXIT
trap 'exit 0' INT TERM
attempt=0
until xdpyinfo -display "$DISPLAY" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 50 ]; then cat /tmp/gitu-display.log >&2; echo 'Desktop display did not start.' >&2; exit 1; fi
  sleep 0.1
done
# The session bus and runtime directory belong only to this private agent.
export XDG_RUNTIME_DIR=/tmp/gitu-runtime
mkdir -p "$XDG_RUNTIME_DIR" "$HOME/Desktop" "$HOME/.local/share/applications"
chmod 700 "$XDG_RUNTIME_DIR"
panel_dir="$HOME/.config/xfce4/xfconf/xfce-perchannel-xml"
if [ ! -f "$panel_dir/xfce4-panel.xml" ] && [ -f /etc/xdg/xfce4/panel/default.xml ]; then
  mkdir -p "$panel_dir"
  cp /etc/xdg/xfce4/panel/default.xml "$panel_dir/xfce4-panel.xml"
fi
cat > "$HOME/.local/share/applications/gitu-browser.desktop" <<'EOF'
[Desktop Entry]
Type=Application
Name=Google Chrome
Exec=node /computer/open-browser.cjs %u
Icon=google-chrome
Terminal=false
MimeType=text/html;x-scheme-handler/http;x-scheme-handler/https;
EOF
cp "$HOME/.local/share/applications/gitu-browser.desktop" "$HOME/Desktop/gitu-browser.desktop"
cat > "$HOME/Desktop/gitu-files.desktop" <<'EOF'
[Desktop Entry]
Type=Application
Name=Workspace Files
Exec=thunar /workspace
Icon=system-file-manager
Terminal=false
EOF
cat > "$HOME/Desktop/gitu-terminal.desktop" <<'EOF'
[Desktop Entry]
Type=Application
Name=Terminal
Exec=xfce4-terminal --working-directory=/workspace
Icon=utilities-terminal
Terminal=false
EOF
chmod 755 "$HOME/Desktop/gitu-browser.desktop" "$HOME/Desktop/gitu-files.desktop" "$HOME/Desktop/gitu-terminal.desktop"
xdg-mime default gitu-browser.desktop x-scheme-handler/http x-scheme-handler/https text/html
dbus-run-session -- sh -c 'umask 077; printf "%s" "$DBUS_SESSION_BUS_ADDRESS" > /tmp/gitu-session-bus; xfce4-session & session=$!; sleep 2; xfce4-terminal --title="Agent Gitu workspace" --working-directory=/workspace; wait "$session"' > /tmp/gitu-window-manager.log 2>&1 &
manager_pid=$!
attempt=0
until xwininfo -root -tree | grep -F 'Agent Gitu workspace' >/dev/null; do
  attempt=$((attempt + 1))
  if ! kill -0 "$manager_pid" 2>/dev/null || [ "$attempt" -ge 200 ]; then
    cat /tmp/gitu-window-manager.log >&2
    echo 'Desktop workspace window did not start.' >&2
    exit 1
  fi
  sleep 0.1
done
export DBUS_SESSION_BUS_ADDRESS="$(cat /tmp/gitu-session-bus)"
x11vnc -display "$DISPLAY" -localhost -rfbport 5900 -forever -shared -nopw -repeat -noxdamage -input_skip 1 -input_eagerly -wait 10 -defer 0 -setdefer -2 -nonap -sb 0 -nowait_bog > /tmp/gitu-desktop-stream.log 2>&1 &
vnc_pid=$!
attempt=0
until node -e "const s=require('node:net').connect(5900,'127.0.0.1');s.on('connect',()=>{s.destroy();process.exit(0)});s.on('error',()=>process.exit(1));s.setTimeout(1000,()=>process.exit(1));"; do
  attempt=$((attempt + 1))
  if ! kill -0 "$vnc_pid" 2>/dev/null || [ "$attempt" -ge 50 ]; then cat /tmp/gitu-desktop-stream.log >&2; echo 'Desktop streaming did not start.' >&2; exit 1; fi
  sleep 0.1
done
node /computer/server.cjs &
service_pid=$!
wait "$service_pid"
