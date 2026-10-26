# Pikpam public website

This directory is the committed static website root for `https://pikpam.com`. The site keeps its existing generated HTML/CSS architecture and serves through the included Node runtime on port 3000.

## Build and checks

From this directory:

```sh
npm run website:build
npm test
npm run lint
```

The website has no dependency install step. `build.cjs` regenerates the committed HTML, `sitemap.xml`, and `robots.txt`.

## Customer problem support

Every page includes the **Pikpam Support** problem-intake widget. It accepts only website/service problems and collects a name, contact email, affected product/page, problem description, start time, and safe reproduction details. The UI and `support-ticket.cjs` both reject out-of-scope requests and secrets.

The server persists sanitized tickets as JSONL and creates one notification event per accepted ticket. Set these non-secret Coolify environment values on the existing website application before accepting production tickets:

- `SUPPORT_TICKET_DIR=/var/lib/pikpam/support-tickets` and mount that path as persistent storage.
- `SUPPORT_NOTIFICATION_EMAIL=support@example.com` (replace with the owner’s configured support destination; do not hard-code it).
- Optional: `SUPPORT_NOTIFICATION_URL=https://internal.example/support-hook` to POST the sanitized notification event to an internal workflow. Without this URL, the event remains in `notifications.jsonl` for the configured support workflow to process.

If `SUPPORT_NOTIFICATION_EMAIL` is missing, the API returns a temporary-unavailable response and does not report a ticket as accepted. Development and tests use a temporary directory and a non-delivery queued notification; no real email is sent by this code.

The API never logs ticket fields. It logs only a stable error code when an unexpected request failure occurs. Do not put credentials, API keys, payment data, one-time codes, private keys, or other secrets in a support report.
