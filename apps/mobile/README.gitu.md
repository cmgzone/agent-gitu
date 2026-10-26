# Gitu mobile companion (OpenMuse-derived)

This is Gitu's native mobile companion, built from
[OpenMuse](https://github.com/CopilotKit/openmuse)'s React Native/Expo app
(MIT — see `LICENSE-OPENMUSE`). Setup and architecture are in [README.md](README.md).

Android opens the full Gitu desktop/web UI in a WebView with local-network and
remote HTTPS server choices. The iOS/web companion uses Gitu's authenticated REST API. Original upstream screens
are retained as inactive reference source; they are not part of the app build.
The existing Gitu desktop/web UI remains active. The earlier proposal to replace
it wholesale is still paused: `../../docs/ui-v2-migration.md`.

The companion is served at `/companion/` after `npm run mobile:build:web`.

Android remembers the last server and opens it directly next time. The workspace
fills the screen without an address toolbar. Android Back closes Gitu panels and
returns through Gitu views before using web history; at the root it shows a
Gitu-styled panel for staying, reloading, or opening connection settings. Failed
connections also show Retry and Connection settings. Mobile chat surfaces use solid backgrounds without
glass blur, and LAN HTTP supports sending and copying messages.
Scroll bars stay hidden while touch scrolling remains available. Widget,
computer, gallery, and overlay icons follow the selected teammate's color;
widget cards and panel backgrounds retain their normal appearance.
