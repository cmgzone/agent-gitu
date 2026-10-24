# Native mailbox inbox and sending diagnostics

On 21 October 2026, the user clarified that the expiry complaint also affects the native IMAP/SMTP mailbox. The prior OAuth sign-in patch did not investigate this native inbox problem.

A read-only check of both saved native accounts found IMAP `CONNECT_TIMEOUT` and successful SMTP `verify()` results. These checks select INBOX but do not fetch message content, alter flags, or send mail. Both accounts use the saved `mail.pikpam.com:993` IMAP endpoint. A separate TCP probe established a socket connection but the TLS/greeting probe did not complete; socket reachability alone does not establish a working IMAP session. DNS publication matched the saved incoming endpoint for one address; the other address had no complete published discovery result. No credentials or saved server settings were changed. SMTP verification does not prove message delivery.

The saved Coolify API was reachable for a registered read operation, but its applications listing did not identify a mail-server application. The saved Mailcow management endpoint was unreachable when checking its documented container status route. No infrastructure was modified. Server management information is required to investigate the remaining live IMAP failure.

## Application fixes

- The Connections page previously cleared `cw.mail` and never hydrated it from `data.mail`. Saved native accounts could be absent even though the API returned them. Native mailbox data now loads before either the OAuth setup or connected-services view renders.
- Native mailbox cards distinguish teammate assignment from live connectivity, expose a Check connection action, and display incoming IMAP and outgoing SMTP results separately.
- The shared `mailConnectionFailure` classifier reports timeout, DNS, TLS, refused connection, rejected authentication or unavailable status using fixed messages. Raw server responses and credentials are never surfaced. A TLS certificate expiry is a certificate failure, not evidence that the mailbox password expired.
- `MailConnections.check` verifies IMAP INBOX access and SMTP sign-in without message retrieval or delivery. Concurrent checks for the same configuration share one request. Results are discarded after removal/settings changes and expire from account metadata after five minutes.
- The agent-facing `mail_check` tool is a native read operation. It retains existing account assignment, review, and company policy boundaries. UI checks require the existing secure owner session boundary; Company checks additionally require a granted native mailbox.
- Inbox-monitor reconnect status retains its fixed failure classification. Agents receive explicit guidance that native `ACTIVE` denotes saved configuration and that incoming and outgoing health require separate verification.
- An expired/used action review now explicitly describes an action-review problem, so it cannot reasonably be mistaken for evidence of expired mailbox credentials. Send review and duplicate-delivery protections are preserved.

## Validation and delivery

Focused provider, route, native-mail, inbox-monitor, storage, company, agent-awareness and UI checks are recorded in `.qa/native-mail-tests-final.json`, `.qa/native-mail-ui-final.json`, and `.qa/native-mail-company-policy.json`. The last policy run intentionally selects only the native mailbox policy case. Production UI browser checks cover loading native accounts without Composio, checking both protocols, Company account checks, and mobile layout with no horizontal overflow. TypeScript build, targeted ESLint, and diff whitespace checks pass.

The compiled patch is staged alongside the previous fixes in `release/question-replies-preview/win-unpacked/Agent Gitu.exe`. Its manifest records unique passing checks and module hashes. Released 0.4.13 installers remain unchanged. Quit the current app through **Quit Agent Gitu and stop agents** before opening the preview, then use **Apps & accounts → Email → Check inbox and outgoing connection**. Real IMAP access remains unresolved until the mail server/network path is repaired; no real email delivery has been tested.

The Mailcow health probe used the documented [container status endpoint](https://docs.mailcow.email/third_party/prometheus_exporter/third_party-prometheus_exporter/). Byterover tools requested by the parent workspace instructions were unavailable; findings are retained here.
