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
