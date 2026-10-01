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
- `COMPOSIO_API_KEY`: optional; required for service connections on Linux.

Open `/auth`, enter the private setup code, and create the owner account with
your name, email, and password. Registration then closes automatically. The
code cannot replace the owner or sign in. Remove it from Coolify after setup.
Use Cowork's model settings to add your model provider. The Coolify API key
is a deployment credential and must not be added to the app's environment.

This deployment serves the web workspace. Electron's native browser and
desktop-only controls need the desktop app. The separate Expo mobile web
bundle is not built into this server image.
