# Company coordination validation — 20 October 2026

Follow-up: the 0.4.12 focused audit now passes all earlier failing cases and
includes the persistent-autonomy policy checks. See [the current audit](project-navigation.md).
The full repository run below is historical and has not been repeated.

Version 0.4.8 is a local Windows release candidate. The requested Company
coordination features are implemented and validated below. Full-project release
acceptance is still incomplete.

## Implemented behavior

- Active permanent employees can request a meeting without file-write,
  configuration or shell access. The durable request wakes the company lead.
- The lead or director reviews the exact saved request. Approval schedules one
  meeting atomically and retains the requester, agenda and participants.
- The existing meeting runtime executes and saves the participants' actual
  discussions. No new external-action or resource permissions are granted.
- Employees can propose typed workflow drafts without designer authority.
  Native retries reuse their saved proposal; director approval remains required
  before live execution.
- Overview, Your decisions, Boardroom and Company Chat expose requests,
  discussions, workflow drafts and live-run links. Navigation opens the exact
  saved meeting, workflow or run.

## Passed checks

- Application compilation/build, repository lint and repository format checks.
  Final edited modules and packaging scripts also passed targeted lint.
- All **28 Company-related test suites** passed in the full repository run.
  These include the ten new coordination cases, actual Company chat tool
  dispatch, an employee request that wakes the lead, and a two-participant
  meeting that completes without owner scheduling.
- The expanded Boardroom browser flow passed scoped persistence, request
  approval/decline, requester labels, exact workflow/discussion navigation,
  chat notices, floor ownership, draft preservation, director review,
  light/dark themes and mobile layout. This uses isolated fixture data.
- The packaged Electron 43.4.0 / Node 24.18.1 runtime started an isolated
  server, exposed the employee tools, saved coordination records and returned
  them through the Company API. All 357 checked compiled runtime, desktop and
  asset files matched this workspace; declarations and source maps are
  intentionally excluded by Electron Builder.
- Both Windows executable archives and their application payloads passed CRC
  checks. The embedded Boardroom, workflows, coordination UI and meeting-view
  modules matched the final compiled files by SHA-256.

Builds are in `release/windows-0.4.8`. Setup is 271,954,983 bytes; Portable is
271,665,510 bytes. SHA-256 sidecars and
`Agent-Gitu-0.4.8-build-manifest.json` accompany the executables. Local builds
include the pre-existing unrelated working-tree changes, which were preserved.
No release was published and no owner installation was replaced.

## Full regression result

`npm test` completed in 1,812 seconds:

- 305 suites passed; 6 suites failed.
- 3,308 tests passed; 18 failed; 20 were skipped.

Failures were outside the Company-specific suites:

| Suite                                      | Failed cases | Observed failure                                                             |
| ------------------------------------------ | -----------: | ---------------------------------------------------------------------------- |
| `tests/hermes.test.ts`                     |            9 | Older stop/status, review text, follow-up and specialist-budget expectations |
| `tests/agent-evals/traps.test.ts`          |            2 | Older rigor-rejection and effort-extension expectations                      |
| `tests/reliability-effort-planner.test.ts` |            2 | Specialist-budget and blocked-status expectations                            |
| `tests/browser.test.ts`                    |            3 | Digest-length cap, vision image delivery and text-only prompt wording        |
| `tests/mobile-cli.test.ts`                 |            1 | Source CLI startup exceeded its 20-second deadline                           |
| `tests/cowork-message-http.test.ts`        |            1 | Windows denied temporary-directory cleanup after the assertions              |

On the isolated rerun after installer assembly, the Cowork HTTP identity test
passed. The mobile source CLI still exceeded its 20-second startup deadline.
That leaves 17 unresolved failing cases from this audit. No clean-baseline run
was performed, so this report does not assert that every broad-suite failure
predates the Company changes. The existing failing test files and legacy
engine sources were not edited to suppress these failures.

## Remaining release acceptance

Resolve the broad-suite failures and verify native installation/update/
uninstallation, tray lifecycle, live external providers and cross-platform
behavior. Real Linux private-computer quota/process enforcement and authorized
live Calendar/provider recovery checks remain separate gates. The scripted
model and browser-fixture checks above do not replace those checks.
