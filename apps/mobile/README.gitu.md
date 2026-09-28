# Gitu UI v2 (OpenMuse-derived)

This app is a vendored copy of [OpenMuse](https://github.com/CopilotKit/openmuse)'s
`apps/mobile` (MIT — see `LICENSE-OPENMUSE`), adopted as the foundation of
Gitu's replacement UI. Plan and event contract: `../../docs/ui-v2-migration.md`.

**Status: not yet runnable in this repo.** Upstream imports reference the
OpenMuse pnpm workspace (`../../packages/domain`, `@copilotkit/*` v2 packages).
Phase 2 of the migration rewires those to Gitu types and the Gitu server
(`EXPO_PUBLIC_API_URL`), rebrands, and replaces the OpenMuse-specific screens
(mail/calendar) with Gitu screens (Cowork, Mission Control, Agent Tree,
Evidence Gate, Budgets, Permissions). Do not `npm install` here until then.

The server-side counterpart (AG-UI adapter) already exists and is tested:
`../../src/server/ag-ui.ts`, `../../tests/ag-ui-translator.test.ts`.
