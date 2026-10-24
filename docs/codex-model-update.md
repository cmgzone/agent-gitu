# Codex model catalog update — 21 October 2026

Gitu's ChatGPT subscription provider uses its bundled Codex executable. Updating
the desktop Codex application alone does not update that separate executable.
The bundled 0.155.1 runtime returned an older model list without GPT-6.1 Sol,
while the newer desktop runtime listed GPT-6.1 Sol for the same signed-in account.

This update moves the official Codex SDK and its platform runtime to 0.163.0.
The subscription fallback list includes `gpt-6.1-sol`, `gpt-6-sol` and
`gpt-6-luna` alongside Astra and the retained 5.6 models. The live runtime list
still controls discovery and its own reported default. Saved model choices,
sign-in and workspace permissions retain their existing behavior. The OpenAI
API-key provider is separate and is not changed by this update.

The exact model ID is `gpt-6.1-sol`; availability is determined by the signed-in
account, client and workspace settings. See the official
[Codex model documentation](https://learn.chatgpt.com/docs/models) and
[GPT-6.1 Sol model page](https://developers.openai.com/api/docs/models/gpt-6.1-sol).

## Validation

- Source build, targeted ESLint and whitespace checks pass.
- All 189 checks in `.qa/codex-model-update-tests.json` pass, covering Codex
  runtime transport, lifecycle, instructions, native execution, provider routing,
  catalog resolution and the shared model selectors.
- A real request through the bundled stable `codex-cli 0.163.0` returned exactly
  `GITU_CODEX_6_1_OK` from `gpt-6.1-sol`. This used the subscription bridge's
  isolated reasoning directory with no application tools or project files.
  The resolved catalog included GPT-6.1 Sol and followed the runtime's default.
  The result is `.qa/codex-model-update-live.json`.
- The staged Electron app contains the same Codex binary as the updated
  dependency, verified by SHA-256. Under Electron's Node runtime it reports
  Codex 0.163.0, finds the existing sign-in and lists GPT-6.1 Sol. See
  `.qa/codex-model-update-package.json`.
- A real native Codex turn also completed using GPT-6.1 Sol, with Gitu's
  permission profile and human approval policy confirmed by the runtime. It
  requested no tools and returned `GITU_CODEX_NATIVE_6_1_OK` in an isolated
  temporary project. See `.qa/codex-model-update-native-turn.json`.
- The package startup/Company smoke check passes and all 362 compiled runtime,
  desktop and asset files match source. See `.qa/codex-model-update-native.log`.

Native installation/update/uninstall, a full repository rerun and other-platform
packaging are outside these checks. The earlier Alibaba provider restriction is
separate from this verified ChatGPT subscription connection.

## Applying the update

Before installing or switching to the new unpacked app, use the existing Gitu
tray menu's **Quit Agent Gitu and stop agents** action. The interface can exit
while retaining its independent engine, so an interface-only restart can retain
the earlier runtime at the same installation path. Switching installations also
requires stopping the older build's engine before the new build can own it.
After opening 0.4.13, choose **ChatGPT subscription → gpt-6.1-sol** in the model
picker. Existing model selections are preserved until changed.

## Local Windows delivery

The Setup and Portable downloads in `release/windows-0.4.13/` both passed
archive-integrity checks. Twelve embedded files, including the actual Codex
executable, SDK metadata and compiled model catalog, match the verified source
dependencies/build by SHA-256. Each executable has an adjacent `.sha256` file;
`Agent-Gitu-0.4.13-build-manifest.json` records both hashes and validation results.
The unpacked app is in `release/windows-0.4.13/win-unpacked/`.
No existing installation was modified or launched by this delivery check.
