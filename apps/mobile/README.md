# Agent Gitu mobile

## Android: full Gitu interface

Android opens the **same desktop/web interface** directly from your selected Gitu
server, including chats, projects, Cowork, companies, and settings. It uses an
embedded WebView; interface updates arrive from the server. Android's Back
button navigates workspace history, then offers Reload and Connection settings
at the root. The workspace fills the screen without a URL toolbar and reopens
the last server automatically. HTTPS links to other sites open in your browser.

Choose **Local network** for a private IP address on the same Wi-Fi, or
**Remote server** for your hosted HTTPS address. Sign in using the email and
password registered on that server. The Android full interface does not need
the companion access key in its login form. Each server has its own account;
accounts are shared only when both addresses point to the same Gitu instance.
Tasks execute on the server, which must remain running and reachable.

The installed desktop app starts local phone access automatically with its
existing engine. Open **Settings → General → Phone access**, or the tray menu's
**Connect Android phone**, to find the current address. Sign in using the same
workspace account. Windows asks once to permit the application's TCP port from
the local subnet; accept that prompt. **Allow Wi-Fi access** in Settings retries
the permission setup if it was cancelled. No terminal or second server is needed.
The private access key is generated once in the workspace's `Settings` directory.
`AGENT_GITU_DESKTOP_PHONE_ACCESS=0` disables desktop phone access at startup.

For a standalone server without the desktop app, start it from the repository root:

```powershell
.\scripts\start-mobile-server.ps1 -Port 8421 -AllowLanLogin
```

Register the first account at `http://localhost:8421` on the computer. On your
phone, enter the private IP address printed by the script, for example
`http://192.168.1.10:8421`. The emulator uses `http://10.0.2.2:8421`.
Allow the server port through your computer's firewall on the private network.

`-AllowLanLogin` explicitly enables `AGENT_GITU_ALLOW_LAN_LOGIN=1` alongside the
server access key. It permits HTTP password sign-in only when both the request
peer and Host are private IP addresses (or loopback). Registration remains local.
HTTP sends passwords and workspace data unencrypted: use only trusted Wi-Fi.
Without this option, phone sign-in requires HTTPS even on Wi-Fi. Use a trusted
HTTPS certificate for encrypted local access.

For remote access, run the server behind an HTTPS reverse proxy. Set
`AGENT_GITU_PUBLIC_ORIGIN=https://your-gitu-host` and
`AGENT_GITU_TRUST_LOCAL_PROXY=1` when that proxy connects from loopback, along
with `AGENT_GITU_ACCESS_KEY` for network listening. The proxy must overwrite
forwarded headers. Select **Remote server** in Android and enter that HTTPS
origin. Android must trust the certificate.

Passwords are entered in the server's existing sign-in page, with form saving
disabled. Sign-in cookies and workspace preferences remain scoped to each
server; the device stays signed in until logout. On Android, use **Settings →
General → Log out** to return to the local/remote server chooser. Mobile surfaces avoid glass blur, and LAN HTTP supports
message sending and Copy. Desktop-only native integrations still depend on the host computer.
Android keeps a bounded local copy of the most recently opened main Agent run
and Cowork transcripts for offline reading. Sending messages and running tasks
still require a reachable server.

Run `npm run mobile:android` to install a development build. The APK instructions
below also apply to this Android interface. `EXPO_PUBLIC_API_URL` sets the initial
server address; never include credentials in it.

## iOS and web companion

An OpenMuse-derived React Native/Expo app for Android, iOS and web. It connects
to your existing Gitu server: tasks continue there when the app closes. The
current Gitu desktop and web interfaces remain active.

The companion supports new agent tasks and chat, saved conversations, live
activity, stop/steer/resume, plan review, tool approvals, clarification answers,
completion reports, and project text files with reviewed, revision-checked edits.
The Teams tab connects to desktop Cowork: view/add/edit teammates, open direct
and group conversations, choose a chief of staff, use topic threads, follow live
replies and activity, stop work, and answer questions or review permission requests.
Saved message edits and deletions from desktop are reflected on the phone.
Provider and connection setup remains in the desktop interface. Android supports
opt-in FCM push notifications through the full workspace; see
[Firebase setup](../../docs/android-fcm.md). iOS/web push notifications and offline
task execution are not implemented.

## Start the server and web companion

From the repository root:

```powershell
npm run mobile:install
npm run mobile:build:web
npm run build
# Keep this key private. Use the same key in the companion's connection form.
$env:AGENT_GITU_ACCESS_KEY = node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
# Copy the displayed key into the companion before starting the server.
$env:AGENT_GITU_ACCESS_KEY
node dist/cli.js serve --host 0.0.0.0 --port 8321
```

Open `http://localhost:8321/companion/` on the server computer, or
`http://YOUR-COMPUTER-IP:8321/companion/` on the same network. The web companion
must be served from Gitu's own origin. The app password protects its assets and
workspace APIs. Register your account locally in the original UI at `/` first.
Remote password sign-in requires HTTPS; a plain HTTP LAN address cannot log in.

Remote listening requires `AGENT_GITU_ACCESS_KEY` with at least 32 characters.
Use a reachable HTTPS server address for access over the internet. Access keys
stay in app memory and never go into URLs, chat, or persistent app storage.
Enter your registered email and app password as well as the access key. Passwords are discarded after
sign-in; the session cookie stays in memory. Disconnecting locks that session
and clears the local connection; it does not stop server tasks.

## Native builds

```powershell
npm run mobile:android
# On macOS with Xcode:
npm run mobile:ios
```

Android uses the full workspace described above. iOS uses the companion's
server address, access key, registered email, and app password form.
Its default is `http://localhost:8321`. `EXPO_PUBLIC_API_URL` can set a build-time
default address. It is public configuration; never put a key there.

Android voice calls use the workspace's existing call buttons. Android asks for
microphone permission when you start your first call; allow it to speak to the
agent. Use your server's HTTPS address for calls. Plain HTTP LAN connections
support text workspaces, but Android WebView requires a secure origin for the
microphone. Incoming call audio plays without an extra tap.

To produce a local Android preview APK after installing Java 17 and the Android SDK:

```powershell
cd apps/mobile
npx expo prebuild --platform android --no-install
# Include the upstream notice in the preview binary.
New-Item -ItemType Directory android/app/src/main/assets -Force | Out-Null
Copy-Item LICENSE-OPENMUSE android/app/src/main/assets/OPENMUSE-LICENSE.txt
cd android
.\gradlew.bat :app:assembleRelease --no-daemon
```

The generated release build uses Expo's development signing key. It is suitable
for local preview; use your own signing configuration for store distribution.
The APK is at `android/app/build/outputs/apk/release/app-release.apk`.
Generated native projects are ignored; keep native configuration in `app.json`.
On Windows, use a short checkout path if native compilation exceeds the filename
length limit. The Android SDK must include the NDK version selected by React Native.
You can also map the repository's `apps` directory to an unused drive letter with
`subst R: C:\path\to\agentgitu\apps`, then build from `R:\mobile\android`.
Map the parent directory so the mobile package is below the drive root.
In the build shell, set
`$env:NODE_OPTIONS = '--preserve-symlinks --preserve-symlinks-main'` before
running Gradle. This keeps Node dependency paths on the mapped drive, matching
Gradle's paths. Expo can still generate autolinking dependency paths on the
original drive. If Gradle reports "this and base files have different roots",
run `node ../scripts/normalize-android-paths.cjs` from the mapped `android`
directory, then retry Gradle. The helper changes only generated autolinking
paths inside this mobile project. Repeat it if autolinking is regenerated.
Set `$env:NODE_ENV = 'production'` for a release build.
Pass `'-Pkotlin.incremental=false'` for a mapped-drive build to avoid Kotlin
incremental caches mixing the original and mapped drive paths.
If the default NDK installation is incomplete, install it using Android SDK
Manager or select another complete installed NDK with `'-PndkVersion=VERSION'`.
Quote the entire argument in PowerShell so the NDK version keeps every component.
Append `'-PreactNativeArchitectures=arm64-v8a'` for an ARM64-only preview APK.
Remove the temporary drive mapping with `subst R: /D` when the build finishes.

## Validation

```powershell
npm run mobile:typecheck
npm run mobile:build:web
npm run mobile:build:android
npm run mobile:build:ios
npx vitest run tests/android-workspace.test.ts tests/mobile-companion.test.ts tests/mobile-access.test.ts tests/mobile-cli.test.ts
```

`build:android` and `build:ios` export JavaScript/Hermes bundles, not installable
apps. Native iOS builds require macOS/Xcode and signing.

## Upstream source and architecture

Based on [CopilotKit/OpenMuse](https://github.com/CopilotKit/openmuse), MIT licensed.
Retain `LICENSE-OPENMUSE` when distributing derived source or binaries.
`src/ui.tsx` supplies the adapted OpenMuse components; `App.openmuse.tsx`,
`README.openmuse.md` and the original inactive screens are retained as reference.
The Android entry is `App.android.tsx` → `src/gitu/workspace-app.tsx`.
The iOS/web entry is `App.tsx` → `src/gitu/app.tsx`.

`src/gitu/client.ts` uses Gitu's authenticated REST endpoints, including bounded
cursor pages at `/api/mobile/runs/:id/events`. Polling is serial, catches up all
pages, pauses in the background, resumes on foreground, and retries connection
failures. No fake OpenMuse workspace or OpenMuse-specific domain packages are
required. Gitu's existing AG-UI translator remains available for future clients;
this companion uses the current REST contract.
