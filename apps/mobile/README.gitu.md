# Gitu mobile companion (OpenMuse-derived)

This is Gitu's native mobile companion, built from
[OpenMuse](https://github.com/CopilotKit/openmuse)'s React Native/Expo app
(MIT — see `LICENSE-OPENMUSE`). Setup and architecture are in [README.md](README.md).

The active entry uses Gitu's authenticated REST API. Original upstream screens
are retained as inactive reference source; they are not part of the app build.
The existing Gitu desktop/web UI remains active. The earlier proposal to replace
it wholesale is still paused: `../../docs/ui-v2-migration.md`.

The companion is served at `/companion/` after `npm run mobile:build:web`.
