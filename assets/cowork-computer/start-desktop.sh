#!/bin/sh
set -eu

# No display or control ports leave the container. Gitu retrieves screen frames
# through the existing authenticated computer service over docker exec.
# Container restarts preserve /tmp, but the previous X server is gone.
rm -f /tmp/.X99-lock /tmp/.X11-unix/X99
Xvfb "$DISPLAY" -screen 0 1280x800x24 -nolisten tcp -noreset > /tmp/gitu-display.log 2>&1 &
display_pid=$!
cleanup() {
  kill ${service_pid:-} ${terminal_pid:-} ${manager_pid:-} "$display_pid" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 0' INT TERM
attempt=0
until xdpyinfo -display "$DISPLAY" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 50 ]; then cat /tmp/gitu-display.log >&2; echo 'Desktop display did not start.' >&2; exit 1; fi
  sleep 0.1
done
xsetroot -solid '#151821'
openbox > /tmp/gitu-window-manager.log 2>&1 &
manager_pid=$!
xterm -fa 'DejaVu Sans Mono' -fs 11 -title 'Agent Gitu workspace' -geometry 90x24+24+24 -bg '#151821' -fg '#e8e8e8' > /tmp/gitu-terminal.log 2>&1 &
terminal_pid=$!
attempt=0
until xwininfo -root -tree | grep -F 'Agent Gitu workspace' >/dev/null; do
  attempt=$((attempt + 1))
  if ! kill -0 "$manager_pid" "$terminal_pid" 2>/dev/null || [ "$attempt" -ge 100 ]; then
    cat /tmp/gitu-window-manager.log /tmp/gitu-terminal.log >&2
    echo 'Desktop workspace window did not start.' >&2
    exit 1
  fi
  sleep 0.1
done
node /computer/server.cjs &
service_pid=$!
wait "$service_pid"
