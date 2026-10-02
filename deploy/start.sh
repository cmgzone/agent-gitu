#!/bin/bash
set -euo pipefail
if [[ ! "${AGENT_GITU_PUBLIC_ORIGIN:-}" =~ ^https://[^/]+$ ]]; then
    echo 'Set AGENT_GITU_PUBLIC_ORIGIN to the HTTPS application origin.' >&2
    exit 1
fi
mkdir -p "$AGENT_GITU_HOME/Workspace"
chown node:node "$AGENT_GITU_HOME" "$AGENT_GITU_HOME/Workspace"
# Earlier root-run deployment checks created this state directory as root.
# Repair only desktop control files, leaving all other persisted data intact.
mkdir -p "$AGENT_GITU_HOME/Cowork/computer-control"
chown node:node "$AGENT_GITU_HOME/Cowork" "$AGENT_GITU_HOME/Cowork/computer-control"
find -P "$AGENT_GITU_HOME/Cowork/computer-control" -maxdepth 1 -type f -exec chown --no-dereference node:node {} +
cd "$AGENT_GITU_HOME/Workspace"
# Gitu binds only to loopback; the local proxy is its only remote entry point.
# Run the agent as node so its shell tools never run as root.
runuser -u node -- node /app/dist/cli.js ui --host 127.0.0.1 --port 8321 &
agent_pid=$!
nginx -g 'daemon off;' &
proxy_pid=$!
cleanup() {
    kill -TERM "$agent_pid" "$proxy_pid" 2>/dev/null || true
    wait "$agent_pid" "$proxy_pid" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 0' TERM INT
set +e
wait -n "$agent_pid" "$proxy_pid"
exit_code=$?
# A clean exit of either long-running process still requires a container restart.
if [[ "$exit_code" == 0 ]]; then exit_code=1; fi
exit "$exit_code"
