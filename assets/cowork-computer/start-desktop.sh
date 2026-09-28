#!/bin/sh
set -eu

# No display or control ports leave the container. Gitu retrieves screen frames
# through the existing authenticated computer service over docker exec.
Xvfb "$DISPLAY" -screen 0 1280x800x24 -nolisten tcp &
display_pid=$!
trap 'kill "$display_pid" 2>/dev/null || true' EXIT
attempt=0
until xdpyinfo -display "$DISPLAY" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 50 ]; then echo 'Desktop display did not start.' >&2; exit 1; fi
  sleep 0.1
done
xsetroot -solid '#151821'
openbox &
xterm -title 'Agent Gitu workspace' -geometry 90x24+24+24 -bg '#151821' -fg '#e8e8e8' &
node /computer/server.cjs
