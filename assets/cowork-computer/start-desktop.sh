#!/bin/sh
set -eu

# No display or control ports leave the container. Gitu retrieves screen frames
# through the existing authenticated computer service over docker exec.
# Container restarts preserve /tmp, but the previous X server is gone.
rm -f /tmp/.X99-lock /tmp/.X11-unix/X99
# The old container is stopped before reusing its home volume. Chromium's
# hostname/PID lock symlinks can survive that stop; profile data stays intact.
rm -f "$HOME/browser/SingletonLock" "$HOME/browser/SingletonSocket" "$HOME/browser/SingletonCookie"
Xvfb "$DISPLAY" -screen 0 1280x800x24 -nolisten tcp -noreset > /tmp/gitu-display.log 2>&1 &
display_pid=$!
cleanup() { kill ${service_pid:-} ${manager_pid:-} "$display_pid" 2>/dev/null || true; }
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
Name=Gitu Browser
Exec=node /computer/open-browser.cjs %u
Icon=web-browser
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
node /computer/server.cjs &
service_pid=$!
wait "$service_pid"
