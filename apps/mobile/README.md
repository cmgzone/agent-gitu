# Agent Gitu mobile companion

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
Provider and connection setup remains in the desktop interface. Push notifications
and offline task execution are not implemented.

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

## Android and iOS

```powershell
npm run mobile:android
# On macOS with Xcode:
npm run mobile:ios
```

Enter the server address, access key, registered email, and app password in the app. The Android emulator defaults
to `http://10.0.2.2:8321`; a physical phone needs your computer's reachable network
address. `EXPO_PUBLIC_API_URL` can set a build-time default address. It is public
configuration; never put a key there.

To produce a local Android preview APK after installing Java 17 and the Android SDK:

```powershell
cd apps/mobile
npx expo prebuild --platform android --no-install
# Include the upstream notice in the preview binary.
New-Item -ItemType Directory android/app/src/main/assets -Force | Out-Null
Copy-Item LICENSE-OPENMUSE android/app/src/main/assets/OPENMUSE-LICENSE.txt
cd android
.\gradlew.bat assembleRelease --no-daemon
```

The generated release build uses Expo's development signing key. It is suitable
for local preview; use your own signing configuration for store distribution.
The APK is at `android/app/build/outputs/apk/release/app-release.apk`.
Generated native projects are ignored; keep native configuration in `app.json`.
On Windows, use a short checkout path if native compilation exceeds the filename
length limit. The Android SDK must include the NDK version selected by React Native.

## Validation

```powershell
npm run mobile:typecheck
npm run mobile:build:web
npm run mobile:build:android
npm run mobile:build:ios
npx vitest run tests/mobile-companion.test.ts tests/mobile-access.test.ts tests/mobile-cli.test.ts
```

`build:android` and `build:ios` export JavaScript/Hermes bundles, not installable
apps. Native iOS builds require macOS/Xcode and signing.

## Upstream source and architecture

Based on [CopilotKit/OpenMuse](https://github.com/CopilotKit/openmuse), MIT licensed.
Retain `LICENSE-OPENMUSE` when distributing derived source or binaries.
`src/ui.tsx` supplies the adapted OpenMuse components; `App.openmuse.tsx`,
`README.openmuse.md` and the original inactive screens are retained as reference.
The active entry is `App.tsx` → `src/gitu/app.tsx`.

`src/gitu/client.ts` uses Gitu's authenticated REST endpoints, including bounded
cursor pages at `/api/mobile/runs/:id/events`. Polling is serial, catches up all
pages, pauses in the background, resumes on foreground, and retries connection
failures. No fake OpenMuse workspace or OpenMuse-specific domain packages are
required. Gitu's existing AG-UI translator remains available for future clients;
this companion uses the current REST contract.
