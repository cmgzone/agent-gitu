# Agent Gitu for Android

The Android app connects to your existing Agent Gitu computer or to a hosted
Agent Gitu server. Version 0.2 uses native React Native screens for chats,
Cowork, teammate profiles and topics, projects and files, task progress,
permissions, Git, Browser, scheduled work, skills, MCP, model selection and
service connections. It has SVG navigation and the same character artwork as
desktop, a phone composer with attachments, and immersive Android display.
Back returns through screens and then backgrounds the app; it never signs out.
The agent executes work on the connected server.

Connections are saved with Expo SecureStore. Computer connections support HTTP
on private networks; hosted connections require HTTPS. The connection key is
sent in an Authorization header, never in a URL or injected page script. The
native client uses authenticated requests and incremental foreground polling.
Keys remain saved when the app is backgrounded. File edits require explicit
confirmation and reject stale revisions. No WebView is used by the phone app.
The server retains its cookie-based preview route for older clients, with
Origin checks applied to those requests.

## Connect to your computer

Use the server source from this checkout (the 0.3.6 desktop installer predates
mobile support). Build it with `npm run build`, then run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-mobile-server.ps1
```

Install `release/Agent-Gitu-Android-0.2.0.apk`. Select **My computer**, enter the
network address printed by the script and the access key from the file it
identifies. Both devices must be on the same network; allow the Node server on
your private network if Windows Firewall prompts. The computer must remain on.
This server shares the existing Agent Gitu data. Stop the original desktop
process first so scheduled jobs are not run by two server processes.
Restart an older mobile server with this updated script: native clients check
for the `native-workspace` capability before opening their workspace screens.
Connection controls are in **Settings**, rather than above each conversation.

Browser controls require a connected Agent Gitu browser bridge. A standalone
server without one reports this limitation in the native Browser screen.

If the phone connection times out, allow the mobile port in Windows Firewall.
Run the following once in PowerShell **as Administrator** (use your chosen
port if it differs from 8421):

```powershell
New-NetFirewallRule -Name 'AgentGitu-Mobile-WiFi-8421' -DisplayName 'Agent Gitu mobile on local Wi-Fi' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8421 -RemoteAddress LocalSubnet -Program 'C:\Program Files\nodejs\node.exe' -Profile Private,Public -EdgeTraversalPolicy Block
```

This also works when Windows labels your home Wi-Fi Public. The rule allows
only local subnet connections to the mobile port; the server still requires
the access key. The server setup builds the current source before starting.

## Connect to a hosted server

Set `AGENT_GITU_ACCESS_KEY` to a random key of at least 32 characters, then run
`node dist/cli.js serve --host 0.0.0.0 --port 8421`. Put an HTTPS reverse proxy
in front of it, preserve the original Host header, forward
`X-Forwarded-Proto: https`, and support long-lived SSE responses. Keep the
upstream port private. In the app, select **Hosted server**, enter the HTTPS
address and access key. Hosting is supported but no server is deployed by this
repository. Existing tool and write permissions apply in both connection modes.

## Build

From this directory run `npm ci`, then `npm run build:apk`. This requires
Android Studio's SDK, JDK 17 or newer, and internet access for Gradle packages.
The script creates a bundled release APK for 64-bit Android phones and emulators; Metro is
not needed to run it. This preview uses the generated Android debug signing
key. Preserve that key for preview updates; configure a private release signing
key before publishing to Google Play. No store publishing is performed.

On Windows, the build uses a short native cache under `%LOCALAPPDATA%\GituCxx`
to avoid Windows file path limits. It reuses an installed compatible NDK when
available instead of downloading a duplicate.

The earlier OpenMuse UI experiment remains separate in `apps/mobile`.

## Verification

`npm run typecheck` checks the native screens. Root tests in
`tests/mobile-native.test.ts` exercise real HTTP authentication, project scope,
write permission and conflicts, topic isolation, message update/deletion, and
paged task history. `expo export --platform web --output-dir dist-web` can render
the same React components for phone-sized layout checks; browser preview keys
are kept in memory only. Browser checks do not replace Android device testing.
