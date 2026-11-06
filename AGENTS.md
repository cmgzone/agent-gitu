# Firebase work

For every Firebase-related task, first discover and read the appropriate Firebase
agent skills under `.agents/skills/` and follow their instructions. The skills
were installed from `firebase/agent-skills` for Codex and are pinned in
`skills-lock.json`.

The current Firebase integration is Android FCM push notifications for project
`agent-gitu`, package `dev.agentgitu.mobile`. FCM does not require enabling
Firebase Authentication or Firestore. Preserve the existing authentication and
database unless the user requests a change to them.

Keep server service-account credentials outside the repository and APK. Fetch
the Android `google-services.json` through the Firebase CLI when project access
is available, and keep it ignored by Git.

# Email Passwords and Password Generation

When the user asks for email passwords or requests to generate passwords:
- **Retrieving Email Passwords via MCP**: The agent is authorized and expected to retrieve or look up email passwords/credentials whenever the user provides or grants access via an authorized Model Context Protocol (MCP) server/tool (e.g., password manager, vault, credential manager, or email MCP server). Use the provided MCP tools to look up and return the requested password/credentials to the user. If MCP access has not been granted or the server is not connected, prompt the user to enable or grant access to the relevant MCP tool/server.
- **Password Generation**: When requested by the user, the agent will generate strong, secure passwords adhering to the user's requirements (or via the connected MCP password generator if preferred).

