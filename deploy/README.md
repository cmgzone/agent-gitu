# Coolify deployment

Use the repository `Dockerfile` on branch `main`, with exposed port `8080`,
HTTPS forced, and health check path `/healthz`. Do not publish a host port for
8080: Coolify's private Docker network and TLS proxy are the only entry point.
Nginx passes the original Host and forwarded HTTPS scheme to the loopback-only
Agent Gitu process. Both processes must stay running for the container to live.

Mount a dedicated persistent volume at `/data`. It holds the account password
hash, projects, SQLite state, chats, and settings. Keep the same volume on
redeployments. The agent runs as the unprivileged `node` user.

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

The broker is a privileged control service because it uses the Docker socket;
keep it private and trusted. Its API accepts only the bundled desktop image,
bounded unprivileged containers with private volumes, and lifecycle/exec
operations on containers bearing this workspace's ownership label. It rejects
host bind mounts, port publication, root exec, arbitrary images and Docker
daemon operations. Only the broker's deployment administrator can change its
code or socket mount. Worker volumes persist when a desktop or the app stops.

Private workers include XFCE, a file manager, terminal, text editor, and the
agent's persistent Chromium profile. Both the owner and agent can operate the
same desktop. The authenticated app relays bounded keyboard and mouse events;
no VNC port or desktop control service is published. Click the desktop preview
to focus keyboard input; use Browser, Files, or Terminal to open apps. Agent GUI
input requires its shell permission, since a desktop can open a terminal.
