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

<!-- ASTRYX:START -->
Astryx v0.7.16 · 174 components
CLI: run every command as `npx astryx <cmd>` (shown below as `astryx ...`).

SETUP (once, in app entry e.g. main.tsx) — without these, components render unstyled:
  import "@astryxdesign/core/reset.css";
  import "@astryxdesign/core/astryx.css";

WORKFLOW — start every page from a template, never from scratch:
1. `astryx build "<idea>"` — names the template to scaffold from and the parts it lacks.
2. `astryx template <name> <path>` — scaffold it; keep its frame, gap and padding; replace the content.
3. `astryx template <Block>` for parts it lacks; `astryx component <Name>` to read props before using one.
Changing an existing page? Keep it: skip step 2 and add blocks/components inside its sections.
Before you deliver a build, run `astryx doctor --built <dir>`; don't deliver it if it fails.

RULES:
- No <div> — components handle all layout and spacing.
- Read `astryx docs layout` before changing a template's frame.
- Dense data = rows (Table, List/Item), not Card-wrapped lists. Badge = counts only.
- Style with component props first, then tokens (var(--color-*|--spacing-*|--radius-*)). No raw hex/px. No StyleX/Tailwind compiler here — don't use xstyle/utility classes directly. Some templates use StyleX and need a compiler plugin; see `astryx docs styling-overview`.
- THEMES: palettes and custom colors go through the theme, never :root overrides. To make or change a theme (colors, fonts, corners, spacing, a look from a picture), prefer the experimental theme editor over hand-written theme files: `astryx experimental theme editor new <name> --like neutral`, then `editor set <name> <thing> <value>` or `editor how "<what you want>"`; wire it with `astryx theme add <name>`; after each change look at it with `astryx experimental theme editor show <name> --png` and open the PNGs it writes (changes nothing in the app); a theme change is not done until you have looked at the pictures. In code, extend an imported theme to customize it; `theme eject <slug>` only forks source. See `astryx docs theme`.
- SELF-CHECK: re-read the file; replace any raw <div>/<span>, imported .css/@apply, or hardcoded #hex/px with the component or a token.

`astryx help` lists every command. Key ones beyond the workflow:
  search "<query>"   find any component / hook / doc / template
  discover <words>   integrations you could add
  docs <topic>       getting-started, principles, tokens, theme … (`astryx docs` lists all)
  docs cli           commands and API reference
  docs authoring     build an integration package, and every field it holds
  upgrade --from <old version> --apply   run after a dependency bump
<!-- ASTRYX:END -->
