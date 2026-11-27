# Agent Gitu Native Android App

A native **Kotlin + Jetpack Compose (Material 3)** Android client for **Agent Gitu** (`dev.agentgitu.mobile`).

## Features
- **Connection & Auth**: Local Wi-Fi (LAN) and Remote HTTPS server modes, `AGENT_GITU_ACCESS_KEY` Bearer auth, registered email/password sign-in, an in-app CameraX/ML Kit QR scanner with manual-link fallback (plus `agentgitu://connect?server=...` deep-link pairing), and `/healthz` reachability testing.
- **Agent Mode (Autonomous Coding)**: Project switcher, start Agent/Chat runs with effort & model selection, live cursor-paged event stream (`/api/mobile/runs/:id/events`), collapsible live **Model Reasoning**, interactive **Approval Gates**, **Plan Reviews**, **Clarification Questions**, **Evidence & Completion Reports**, **Git Status + Unified Color Diffs + Commit/Push**, **Git Checkpoints & Restore**, and Steer/Stop controls.
- **Cowork (AI Teams)**: Teammate roster (create/edit teammates with shell/write/chief permissions), DMs & Group Chats, topic threads, live progress, interactive Request Cards (approve/deny/answer/dismiss), delegated missions, and artifact previews.
- **Camera & Large Uploads**: In-app CameraX photo capture plus resumable 5 MB chunk uploads for large photos, videos, and files, with per-file progress, cancel/remove, and artifact-backed inline rendering.
- **Project Files**: Breadcrumb directory browser and revision-checked monospace text editor.
- **Shared Inbox**: Collaborative external rooms, invite creation with tool policies (`chat_only`, `read_only`, `standard`), and room chat.
- **Live Interactive Surfaces**: Authenticated WebView overlay with microphone permissions for **Live Desktop (noVNC)**, **LiveKit Voice Calls**, **Agent Server Browser**, **Safe Artifact Previews**, and full web workspace fallback.
- **Settings & FCM Push**: Light/Dark/System theme, Autonomy persistence & USD spend ceiling, Coding permissions (`ask`/`full`), Chief of Staff policy presets, Schedules & Local PC Link status, and native **Firebase Cloud Messaging (FCM)** push registration & deep-link routing.

## Build & Test

Requires **JDK 17+** (tested with Temurin 21) and Android SDK 35.

```powershell
cd apps/android-native
$env:JAVA_HOME = "C:\Users\Admin\.jdks\temurin-21\jdk-21.0.12.1+1"
.\gradlew.bat testDebugUnitTest assembleDebug
```

Debug APK output: `apps/android-native/app/build/outputs/apk/debug/app-debug.apk`.

### Firebase Push Notifications
Place your `agent-gitu` Android `google-services.json` (package `dev.agentgitu.mobile`) at `apps/android-native/app/google-services.json` (gitignored). The Gradle build automatically applies the Google Services plugin when present and builds cleanly without it in CI.
