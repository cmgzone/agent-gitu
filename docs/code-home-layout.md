# Code home layout — 20 October 2026

Version 0.4.12 adds expandable project chats, project actions, per-project drafts
and shared navigation inside Code chats. See [current behavior and validation](project-navigation.md).

The sections below record the 0.4.11 layout checkpoint.

The 0.4.11 home screen puts projects in the Code sidebar and centers the task
composer in the remaining workspace. The welcome text stays above the composer.
The main mode switch contains Code and Cowork; Profile, Sessions and Settings
are available from the sidebar. The sidebar shares the main page’s light/dark colors and soft blue selection
highlights. The softer light background and smaller mascot
keep the task area clear.

The sidebar shows four recent projects, with the selected project first, a New
project control and View all projects. Selecting a project preserves the task
draft. The arrow beside a project continues its latest conversation. View all
opens the searchable complete project list, including projects outside the
recent list. Separate folders with the same name remain distinct. Project and
conversation loading retain independent error recovery and a Retry control.

On desktop, the top sidebar arrow switches between the 248-pixel sidebar and a
64-pixel icon rail. This preference is stored locally and restored on reload.
The composer recenters for either width. Search, Sessions, Projects, Profile
and Settings remain accessible in the icon rail with labels and tooltips.
On mobile, the menu opens the sidebar; selecting a project, starting navigation,
clicking outside or pressing Escape closes it. Short viewports use a scrolling
layout to keep the heading and composer accessible.

The existing attachment limit is shown in the attachment menu rather than
under the composer. Upload enforcement and Cowork attachment behavior retain
the existing policy. The shared search close control has an explicit stacking
order so its hit target works on mobile.

## Validation

- Forty focused checks pass across home project identity, draft preservation,
  session routing, file handling, workspace search and model loading.
- The production UI browser fixture passes at 1600×900 and 1360×768 on desktop,
  and 390×844 and 360×740 on mobile, covering light and dark themes. It checks
  sidebar project placement, selected-project task routing, recent-session
  continuation, selection beyond the recent list, draft preservation, attachment
  policy visibility, navigation actions, mobile closing, composer centering,
  desktop collapse/expand and preference restoration after reload.
- The source build and targeted ESLint checks pass. Browser screenshots are in
  `.qa/code-home/`; run the fixture with
  `npx tsx scripts/code-home-ui-smoke.ts`.

Browser API responses and task submission are fixtures; these checks do not
exercise live providers or native installation/update/uninstall. Historical
Company validation is recorded separately in `cowork-company-chat.md` and
`company-coordination-validation.md`.

## Local Windows delivery

The 0.4.11 portable archive passed CRC and current-payload checks, including
21 critical modules compared with the compiled build. Its SHA-256 sidecar and
build manifest are in `release/windows-0.4.11/`. The unpacked Windows app also
passed startup, isolated server health, Company coordination, shared roster and
shared memory checks; all 360 runtime/desktop/asset files match current source.

Setup assembly remains blocked: NSIS reported `can't write 67108864 bytes to
output` while C: was low on space. Automatic approval review rejected deleting
the older unpacked build copy without a detailed reason. The incomplete Setup
output is marked `.incomplete`; the verified portable and unpacked app remain
available. Free at least 2 GB before retrying Setup or extracting the portable
runtime. Native installation/update/uninstall remain unverified.
