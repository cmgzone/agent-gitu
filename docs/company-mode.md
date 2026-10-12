# Company mode

Company mode uses the existing Cowork execution engine. Each company has its own SQLite-backed configuration and Cowork snapshot, workspace, memory, connection grants, MCP servers, private computers, and usage records. Existing Coding and Cowork sessions retain their original storage.

Open **Companies**, create a draft, then complete **Identity → Lead → Resources → Operating rules → Review**. Choose a monthly AI budget or Unlimited and a file-size policy explicitly. Starting a company enables scheduled reviews. Archive pauses work and preserves history; Restore leaves it paused until Resume.

The app modes appear in **Code → Cowork → Company** order. Company setup uses the current app theme, provider/model selectors, searchable resource lists and expandable advanced settings. Review shows the lead, model and granted-resource counts. Only pending approvals for the latest direction appear in the decisions box; completed and superseded actions remain in history.

An ordinary Cowork teammate with configuration and write permissions can use `company_manage` to create a draft, list companies and inspect their activity. For example, ask: “Create a company named Research Studio to prepare verified customer research.” The tool clones that teammate into a separate company lead and adds a durable Review company card to the chat. Repeated creation with the same name and purpose in that conversation reuses the draft, including after restart. Creation does not start agents, choose budgets, grant accounts or allow host-computer access. Review resources and operating rules, then select Start. Company agents and temporary helpers cannot create or inspect other companies.

**Live activity** reports the actual worker phase/tool, current missions, queued tasks and next review. The Cowork card also refreshes from saved/runtime state. Status distinguishes working, waiting for approval/input, queued, between reviews, paused and draft; a saved running state is not a claim that a worker is always active. Live refresh preserves focused navigation and uses a small status response rather than repeatedly transferring usage history.

Company Chat uses the shared chat layout and composer. **Follow up** preserves the latest work automatically. **Steer** changes the current direction; **Queue** assigns another request; **Ask** answers a question without replacing the goal. Drafts and delivery mode survive tab changes. Overview displays approvals, agent questions and actions requiring provider reconciliation.

## Runtime and permissions

The coordinator admits durable work fairly between companies. Leads, teammates and temporary helpers use the same worker admission pool; a parent awaiting a helper releases its worker slot. Reviews default to 15 minutes. Missions default to twelve sessions. Monthly AI spending uses estimated reservations and reconciliation with provider-reported usage. Unpriced calls remain visibly unknown; finite budgets require explicit input and output pricing. Each priced attempt preserves the price source and rates used for its reservation and reconciliation.

Reservations use the higher input rate if cached input is more expensive. Image requests against finite budgets reserve the model's known input ceiling; models without a usable image-input ceiling wait for a model choice with suitable metadata. Parallel helpers release the parent's worker once and restore it once after their group settles.

Supervised companies require owner approval for external writes, permanent staff creation, and shell/browser interactions that may submit external actions. Full access remains restricted to resources granted in company settings. Company agents cannot create credentials, change grants or increase budgets. Local MCP processes receive a restricted environment; explicitly supplied environment credentials are stored encrypted.

Wallet grants describe provider operations, execution mode and reliable amount, asset, network and recipient fields. Amounts are decimal strings. Spending limits apply to one asset per grant, independently of AI budgets. Configure the provider's idempotency header or argument when supported. Failed submissions remain uncertain and must be reconciled with provider evidence before retrying.

## Computers and hosted browsers

Each permanent teammate uses a saved private Linux desktop, backed by persistent workspace and home volumes. Choose local Docker or a saved remote computer server. Private-computer failure reports its dependency or connection error. Resources also offers **Use my computer**, off by default: the owner can grant fallback for file, shell and supported browser tools. Chat announces this switch, and computer cards show the last execution location. Revoking the grant interrupts active company work. Human control or a sleeping private desktop never triggers fallback. Private desktop screen and input still require a private desktop.

“My computer” means the computer running Agent Gitu. A hosted installation uses its server host; an unconnected personal computer cannot be controlled through a browser session. Connecting a separate personal desktop to a hosted company is additional work. The company workspace and agent/tool permissions still apply during host execution.

Pause the company and stop or reconcile its private desktops before changing computer servers. Restart stops orphaned helpers on their saved servers before releasing their capacity. CPU and memory limits are applied when a container is created. Company disk limits use a kernel XFS project quota shared by the agent’s saved home and workspace. The desktop has a read-only root and bounded memory-backed temporary storage; process guards prevent changing quota IDs or inheritance. Unsupported quota servers wait with setup guidance before executing work.

For local Linux Docker or a hosted computer broker, configure an existing direct directory on an XFS filesystem mounted with `prjquota` or `pquota`, install `xfsprogs`, and set `AGENT_GITU_COMPUTER_QUOTA_ROOT` for the quota administrator. Run provisioning on the Docker host itself, or use a computer broker on that host. The agent containers receive no quota administration capabilities. Windows and macOS installations can select a configured Linux computer server. A saved SSH computer server has an optional **Private computer quota directory**; its administrator account also needs Node 22.22.3 or newer and `xfsprogs`. Keep one owner workspace per quota directory. Existing unbounded computer volumes are retained and require migration reconciliation before adoption; they are never overwritten or removed automatically.

Desktop actions include Open desktop, Take control, Return control, Start and Stop. Human control survives restarts. Temporary helpers have separate workspaces and computer identities.

CLI and hosted browser automation uses a server-side Playwright browser with persistent company/agent profiles and authenticated handoff. Install the matching dependencies:

```sh
npx playwright install --with-deps chromium
```

See [Playwright browser installation](https://playwright.dev/docs/browsers). A failed browser installation is reported explicitly.

## Files and storage

Settings → Files & storage controls the workspace maximum file size. Existing installations default to Unlimited. Company limits can inherit the workspace policy or choose a lower ceiling. Unlimited removes the application ceiling; disk capacity, provider quotas and channel transport limits still apply.

Any file type can be stored. Supported browser formats have previews; others can be downloaded. Uploads use 5 MiB binary chunks, persisted offsets, retry/resume controls, and final size/checksum verification before publication. Re-select the original file after reopening the application to resume an interrupted upload. Video and download endpoints support byte ranges. Existing artifact IDs, files and legacy base64 artifacts remain readable; new artifact files do not need duplicate base64 sidecars.

The browser computes SHA-256 in one MiB slices. Files & Knowledge shows interrupted uploads with Resume and Cancel, and permits cancellation while checking or transferring a file. Saved uploads are matched to the original bytes; a failed status request preserves their resume state.

Complete or cancel unfinished uploads before changing a storage account or folder. Transfer checkpoints and external references retain the grant they started with. References from a replaced account require reattachment; token refresh preserves account identity and cannot replace a newly authorized account with an old response.

Native storage connections support local folders, S3-compatible buckets, Google Drive, OneDrive and Dropbox. Custom HTTP and MCP connections advertise only configured capabilities. Grant individual operations and select a default output connection. Agents can discover company storage and use the default output connection when exporting an artifact. Existing filenames are kept by creating another copy.

Self-hosted OAuth installations supply their own OAuth application credentials and register the callback URL shown in Connections. Tokens and refresh credentials are encrypted. Storage transfer state and protected resumable checkpoints survive runtime restarts. Cloud-native files are exported using supported provider formats when imported. Two-way synchronization is outside this release.

Connections displays supported and granted operations. Edit a connection to change its folder, grants or protected credentials; blank credential fields retain saved values. Cancel active transfers before editing or disconnecting. Disconnect removes protected credentials, clears a matching default output location and preserves provider files and transfer history. File imports and references require a read grant.

Native mailbox accounts expose their exact actions in chat, missions and read-only questions. Email and inbox searches discover the Mailbox service even without an OAuth provider. Reads require assigned or company-granted access and follow the existing review rules; sending and marking messages also require write access. Using an assigned mailbox does not require shell or account-configuration access, or a running private computer. Pending approvals stop execution without reporting an unsent message as sent. Legacy plaintext mailbox records migrate to encrypted primary and recovery files while retaining their account IDs.

Provider downloads are journaled before their connection handshake begins. Pausing or redirecting a company cancels its active transfers and preserves resumable upload checkpoints. Runtime shutdown drains transfers before closing storage. Account changes and OAuth reconnects wait until active downloads have finished or been cancelled.

Files & Knowledge shows whether each external reference remains connected and readable. Import a copy only while its current read grant permits it, or remove the reference without deleting the provider file or an existing imported copy. Review each teammate’s memory, save a correction against the displayed version, or archive an entry so it no longer guides that teammate.

Empty OneDrive uploads persist their destination before submission and reconcile a lost response there. Conflicts fail instead of replacing provider files, following [Microsoft’s conflict behavior](https://learn.microsoft.com/en-us/graph/api/resources/driveitem?view=graph-rest-1.0).

New Google Drive uploads reserve and persist a provider file ID before creating a resumable session. Expired sessions restart with that ID; uncertain completions are checked against the saved folder, size and provider checksum. Legacy incomplete sessions without a saved folder or file ID require reconciliation rather than starting another upload. This follows [Drive’s guidance for pre-generated IDs](https://developers.google.com/workspace/drive/api/guides/manage-uploads#use_a_pre-generated_id_to_upload_files).

Telegram transport limits are channel-specific. Set `AGENT_GITU_PUBLIC_URL` to the installation’s externally reachable HTTPS origin when providing authenticated download links for files that exceed Telegram transport limits.

Transfer references: [S3 multipart](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html), [Drive resumable uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads), [OneDrive upload sessions](https://learn.microsoft.com/en-us/graph/api/driveitem-createuploadsession), [Dropbox upload sessions](https://docs.dropboxapi.com/dropbox-api/api-reference/user-endpoints/files/upload-session-start).

S3 uploads journal their destination before submission. Expired multipart sessions check for the matching completed object before one bounded restart at the original key; interrupted part acknowledgements reuse the same part number. Conditional completion protects existing provider files. Legacy incomplete S3 checkpoints without account/folder scope require reconciliation. See [AWS conditional multipart writes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html).

## Background operation and installation

Closing the Windows desktop window leaves the runtime in its system tray. Tray → Quit stops it. Hosted services run independently of browser tabs.

```sh
gitu serve --host 127.0.0.1 --port 8321
gitu service install
gitu service start
gitu service status
gitu service stop
gitu service uninstall
```

Linux user services require `loginctl enable-linger USER` to remain running after logout. Linux/macOS server operators can install a system service using `--system --owner ACCOUNT --data-dir PATH --workspace PATH`; prepare a writable data directory owned by that dedicated account first. On macOS this installs a LaunchDaemon; the default installs a login-session LaunchAgent. Use the same flags for subsequent start/stop/status/uninstall commands. Windows uses checksum-pinned WinSW 2.12.0. Configure its service account as the workspace owner before starting, so DPAPI credentials and computer grants remain usable.

Do not run two runtimes against one data directory. The scheduler maintains a database lease, and external action records prevent blind retries after uncertain execution. Back up the entire data directory, including protected encryption keys, while the runtime is stopped. On Windows, DPAPI keys are tied to their owner account. Set `AGENT_GITU_SECRETS_KEY` to a protected 64-character hexadecimal key when an administrator manages a portable server encryption key; do not change it without migrating encrypted records.

Versioned CLI packages include a pinned Node runtime and platform dependencies. The release workflow builds Windows x64 and Linux/macOS x64/arm64 packages, checksum files and installers. Updates use versioned installation directories and preserve the separate owner data directory. These packages must pass release validation before publication.

Local packaging and installer smoke checks each require at least 3 GiB of free staging or temporary disk space. An existing matching package stage can be refreshed with `npm run package:cli -- --resume`; this preserves owner data and avoids reinstalling unchanged staged dependencies.

## Implementation and release tracking

Automated coverage currently includes company boundaries and restart persistence, latest-direction queue behavior, worker admission, approval recovery, mocked wallet limits, 21 MiB web/local-storage transfers, binary broker transfer, range downloads, resumable upload checksums and service manifests. Platform CI and actual Docker/service/installer smoke tests are required in addition to local tests.

Remaining validation and implementation work is tracked in [company-mode-delivery.md](company-mode-delivery.md). Native release checks remain required before publishing the completed app.
