# Android push notifications with Firebase

Gitu sends directly through Firebase Cloud Messaging HTTP v1 using the Firebase
Admin SDK. The Android Expo app obtains a native FCM token; it does not use the
Expo Push Service or require EAS. Notifications cover completed/failed coding
tasks, approvals/questions, and Cowork replies, including background work when
the WebView is closed. Tapping opens the task or conversation; company alerts
open the company's Chat tab.

## 1. Connect the Firebase Android app

The existing Firebase project is **`agent-gitu`**. Its registered Android app is
**Agent Gitu Android**, package **`dev.agentgitu.mobile`**. Reuse that app; do not
register another one. Firebase Authentication and Firestore are not needed for
push notifications. Basic FCM does not need an SHA fingerprint.

From the repository root, sign in to the Firebase CLI with an account that has
access to `agent-gitu`, then retrieve the registered app's configuration:

```powershell
npx -y firebase-tools@latest login --reauth
npx -y firebase-tools@latest apps:sdkconfig ANDROID 1:763633238034:android:d8a724892ec2b99c0698cb --project agent-gitu --out apps/mobile/google-services.json
```

`apps/mobile/google-services.json` is ignored by Git. Alternatively set
`GITU_ANDROID_GOOGLE_SERVICES_FILE` to its path when building the Android app.
The app config validates the Android package and rejects server credential files.
In Project settings → Cloud Messaging, confirm the **Firebase Cloud Messaging
API (V1)** is enabled for the project. Do not use a legacy FCM server key.

See [Firebase's Android setup](https://firebase.google.com/docs/android/setup)
and [Expo's native FCM guide](https://docs.expo.dev/push-notifications/sending-notifications-custom/).

## 2. Configure the Gitu server

For Windows and a hosted server, create a dedicated service account for each
environment in Google Cloud IAM for `agent-gitu`. Give each the
[Firebase Cloud Messaging API Admin role](https://docs.cloud.google.com/iam/docs/roles-permissions/firebasecloudmessaging)
(`roles/firebasecloudmessaging.admin`), rather than a broad project admin role.
Use account names `gitu-fcm-windows` and `gitu-fcm-hosted`. In each account,
open **Keys → Add key → Create new key → JSON** to create its credential file.
Download each account's JSON key and keep it only on the corresponding server,
outside the repository and Android build. These are privileged credentials:
never copy them into `apps/mobile`, browser settings, or an APK.

Set the project ID and choose one server credential method. For direct JSON
credentials, set `AGENT_GITU_FCM_SERVICE_ACCOUNT_JSON` to the complete service-
account JSON value. The server checks that the JSON project matches
`AGENT_GITU_FCM_PROJECT_ID`.

For Coolify, set `AGENT_GITU_FCM_PROJECT_ID=agent-gitu` and add
`AGENT_GITU_FCM_SERVICE_ACCOUNT_JSON` as a multiline, runtime-only secret. Paste
the complete JSON file contents into its value; do not add it as a build
variable. This option does not need a file mount. Keep the value out of Git,
build logs, and the Android APK.

For local development, either set the JSON value directly in the process:

```powershell
$env:AGENT_GITU_FCM_PROJECT_ID = 'agent-gitu'
$env:AGENT_GITU_FCM_SERVICE_ACCOUNT_JSON = Get-Content -Raw 'C:\private\gitu-firebase-service-account.json'
```

Or point `GOOGLE_APPLICATION_CREDENTIALS` at a service-account JSON file and
let Application Default Credentials load it:

```powershell
$env:AGENT_GITU_FCM_PROJECT_ID = 'agent-gitu'
$env:GOOGLE_APPLICATION_CREDENTIALS = 'C:\private\gitu-firebase-service-account.json'
```

For Docker, either pass the JSON environment variable at runtime or mount the
service-account JSON as a runtime secret and set
`GOOGLE_APPLICATION_CREDENTIALS` to its path inside the container. Restart or
redeploy the existing server. Keep your existing address, HTTPS, account, and
phone-access settings.
The server needs outbound access to Google authentication and FCM endpoints.

For the file-path option, mount the hosted key at `/run/secrets/gitu-fcm-hosted.json` and set:

```dotenv
AGENT_GITU_FCM_PROJECT_ID=agent-gitu
GOOGLE_APPLICATION_CREDENTIALS=/run/secrets/gitu-fcm-hosted.json
```

The container's `node` user must be able to read the mounted file. Add the
credential as a runtime secret; do not copy it into the Docker image or set it
as a build argument.

Configure these variables separately for both environments. PowerShell variables
apply to programs started from that shell; a desktop app, Windows service, or
container must receive them in its own launch environment. Credentials configured
on Windows do not configure the hosted server.

On Google Cloud, an attached service account with permission to send FCM messages
can supply [Application Default Credentials](https://firebase.google.com/docs/admin/setup#initialize_the_sdk)
instead of a downloaded key. Use a service account with only the permissions
needed for FCM; the sending project must match the Android Firebase app.

Only the Android client configuration belongs in the APK. Service-account
credentials remain on the server. Registered FCM device tokens are encrypted in
Gitu's private Settings directory and are never returned by the registration API.

## 3. Rebuild and enable Android notifications

This requires a **new native APK**; a server or JavaScript-only update cannot add
the native notification module. From `apps/mobile`:

```powershell
npm install
npx expo prebuild --platform android --no-install
npx expo run:android
```

For a release preview APK, follow the existing local APK instructions in
`apps/mobile/README.md` after prebuild. No EAS project is required.
Use a physical Android phone with Google Play services, or a Google Play-enabled
Android emulator. Expo Go is not supported for these remote notifications.

Open your Gitu server in the installed app, sign in, and choose **Settings →
General → Android notifications → Enable**. Allow Android's notification
permission. Choose **Send test** to verify the credentials and device token.

When using both a local and hosted Gitu workspace, repeat Enable and Send test
while signed in to each server in the Android app. One APK uses the same Firebase
Android configuration for both, while each server stores its own opt-in registration.
Test with the app foregrounded, backgrounded, and closed; also finish a real
task and open a question/approval while no phone stream is connected.

Notifications contain generic text, not prompts, replies, or credential details.
Taps open only a workspace previously enabled on this installation. Expired
sign-in sessions still require login before showing the task. Locking the app
does not disable opted-in alerts; use **Disable** to unregister this phone.
The preference is per server, so disable it there before retiring a server or
clearing app data. Token rotation is synchronized on refresh and foregrounding;
Firebase-reported invalid/uninstalled tokens are removed. Registrations expire
after 90 days without refresh. Firebase acceptance does not guarantee delivery:
Android force-stop, notification permission, battery policies, connectivity,
and Google Play services can prevent or delay it. Server work stays independent
of push delivery.

## Troubleshooting

- No Android notifications section: install the new APK and update the Gitu server.
- APK needs Firebase configuration: confirm `google-services.json` belongs to
  `dev.agentgitu.mobile`, then run prebuild and rebuild the APK.
- Server needs configuration: set `AGENT_GITU_FCM_PROJECT_ID` and restart Gitu.
- Test fails: check the server credential path, project match, Cloud Messaging
  API v1, service-account permissions, and network access. Server logs deliberately
  omit provider errors and device tokens.
- Android permission is off: enable notifications for Agent Gitu in Android
  Settings, then re-enable notifications in Gitu.

## Verification without Firebase credentials

```powershell
npx vitest run tests/mobile-push.test.ts tests/mobile-push-bridge.test.ts
npm run build
npm run mobile:typecheck
npm run mobile:build:android
npm audit --omit=dev
```

Automated tests use a fake Firebase sender. End-to-end device delivery requires
your own Firebase configuration and an installed Android build.
