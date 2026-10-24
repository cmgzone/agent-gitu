# Coolify deployment

Use the repository `Dockerfile` on branch `main`, with exposed port `8080`,
HTTPS forced, and health check path `/healthz`. Do not publish a host port for
8080: Coolify's private Docker network and TLS proxy are the only entry point.
Nginx passes the original Host and forwarded HTTPS scheme to the loopback-only
Agent Gitu process. Both processes must stay running for the container to live.

Mount a dedicated persistent volume at `/data`. It holds the account password
hash, projects, SQLite state, chats, and settings. Keep the same volume on
redeployments. The agent runs as the unprivileged `node` user.

During a rolling update, the new container can share `/data` with the previous
container while it passes `/healthz`. Its company scheduler stays in standby
without recovering or executing the old container's jobs. It retries every five
seconds and takes over after the old scheduler releases its lease, or after the
60-second lease expires following a crash. Keep health checks enabled; `curl`
is included in the image. Do not delete the scheduler lock or reset the data
volume to resolve a deployment failure.

Connection credentials and profile metadata use atomic saves with protected
`.bak` files in `/data/Settings`. Back up this directory as private data.
Unreadable files recover from the last good backup; if both copies are damaged,
Gitu reports a storage error and preserves them. SQLite `.lock.sqlite` files
coordinate concurrent writers and contain no credentials. Adding another server
or account for the same provider keeps its keys in a separate profile.

Set these environment variables as runtime-only values in Coolify:

- `AGENT_GITU_PUBLIC_ORIGIN=https://your-gitu-app-domain`
- `AGENT_GITU_REGISTRATION_TOKEN`: a cryptographically random private code of
  at least 32 characters, used only to register the first workspace owner.
- `AGENT_GITU_SECRETS_KEY`: a persistent 32-byte hexadecimal encryption key,
  stored only in Coolify's runtime environment. Enables encrypted Composio API
  key entry over authenticated HTTPS in the Connections page. Keep this key
  unchanged across redeployments and back it up separately from `/data`.
- `COMPOSIO_API_KEY`: optional alternative to entering the key in Connections.

Open `/auth`, enter the private setup code, and create the owner account with
your name, email, and password. Registration then closes automatically. The
code cannot replace the owner or sign in. Remove it from Coolify after setup.
Use Cowork's model settings to add your model provider. The Coolify API key
is a deployment credential and must not be added to the app's environment.

This deployment serves the web workspace. Electron's native browser and
desktop-only controls need the desktop app. The separate Expo mobile web
bundle is not built into this server image.

## Deployment fails with "no space left on device"

If compilation succeeds but Docker fails while exporting or unpacking the image
under `/var/lib/containerd`, the deployment server has exhausted storage or
inodes. A subsequent failure writing Coolify's `docker-compose.yaml` confirms
that the host also cannot save deployment configuration. Fix host capacity
before retrying the deployment.

Run these checks on the deployment server over SSH:

```sh
df -h / /var/lib/containerd /data/coolify
df -i / /var/lib/containerd /data/coolify
docker system df -v
```

When no builds are running, reclaim unused build cache older than 24 hours:

```sh
docker builder prune --all --filter 'until=24h'
```

Review the confirmation before proceeding. This removes build cache; future
builds may take longer. It does not remove application containers or volumes.
See [Docker's builder prune reference](https://docs.docker.com/reference/cli/docker/builder/prune/).
If this frees too little space, expand the full filesystem or inspect other host
storage consumers. Do not delete files directly from `/var/lib/containerd` or
`/var/lib/docker`, or prune persistent volumes containing application data.

Check free space again, leaving room for both the image layers and their
unpacked contents, then redeploy in Coolify. The Dockerfile removes APT package
lists after installing Playwright dependencies to reduce each new image's size;
this cannot recover space already consumed by old images or build cache.

## Private desktops on a VPS

Deploy a separate private application using `deploy/Dockerfile.computer-broker`
on the same Coolify network, without a public domain or published host port.
Mount `/var/run/docker.sock` only in this trusted broker container. The web app
and desktop workers do not receive that socket. Set a stable container name
for the broker, exposed port `8787`, and health check `/healthz`.
Use an existing host-file mount in Coolify's Persistent Storage settings,
with `/var/run/docker.sock` as both source and destination. Through the API,
use a file storage with `is_host_file: true` and `fs_path: /var/run/docker.sock`.

Give the broker `AGENT_GITU_COMPUTER_BROKER_OWNER` (a stable workspace ID) and
`AGENT_GITU_COMPUTER_BROKER_KEY` (a random private key of at least 32 characters).
Give the web app the same private key and
`AGENT_GITU_COMPUTER_BROKER_URL=http://your-private-broker-name:8787`.

Redeploy the broker and web application from the same Git revision. Update the
broker first when the desktop image changes. The broker deliberately rejects
images outside its bundled version; updating only the web app can produce
`Unsupported desktop operation: build -t agent-gitu-cowork:...` even while both
applications have healthy containers. A restart alone keeps the old broker code.
Keep the existing broker owner, shared key, socket mount, and web data volume.

After updating, run `node /app/deploy/verify-computer-broker.mjs` inside the
broker, or temporarily use it as its Coolify post-deployment command. It starts
a separate test desktop, verifies the worker user, screenshot, browser and
authenticated stream, then stops that test desktop. The first run may build the
desktop image. This leaves existing teammates and their saved files untouched.
Broker HTTP requests follow the operation's deadline, including the fifteen-minute
first image build, rather than Fetch's separate five-minute header timeout.

The broker is a privileged control service because it uses the Docker socket;
keep it private and trusted. Its API accepts only the bundled desktop image,
bounded unprivileged containers with private volumes, and lifecycle/exec
operations on containers bearing this workspace's ownership label. It rejects
host bind mounts, port publication, root exec, arbitrary images and Docker
daemon operations. Only the broker's deployment administrator can change its
code or socket mount. Worker volumes persist when a desktop or the app stops.

Private workers include XFCE, a file manager, terminal, text editor, and the
agent's persistent Chromium profile. Both the owner and agent can operate the
same desktop. The authenticated app streams screen updates and keyboard/mouse
input using noVNC over a same-origin WebSocket. Nginx must forward the Upgrade
header as in the bundled configuration. The broker verifies workspace ownership
and relays only to loopback port 5900 inside that unprivileged worker. No VNC
port or desktop control service is published. Locking the app closes the stream.
Click the desktop
to focus keyboard input; use Browser, Files, or Terminal to open apps. Agent GUI
input requires its shell permission, since a desktop can open a terminal.
