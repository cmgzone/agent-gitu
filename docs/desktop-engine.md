# Independent desktop engine

The desktop interface and agent runtime run in separate OS processes. Electron
owns windows, native sign-in, and its interactive browser. A headless engine owns
the existing Gitu HTTP API, sessions, task ledgers, commands, connected tools,
and background schedules. The UI continues using the same authenticated API.

```text
Electron windows -> authenticated Gitu HTTP API -> engine -> agents and tools
Electron browser <- private authenticated WebSocket <- engine browser bridge
```

The packaged Electron executable supplies the engine's Node runtime through
`ELECTRON_RUN_AS_NODE=1`; users do not need a separate Node installation. The
engine is detached, with its own output handles, so it can outlive the interface.
There is no Windows service installation or automatic start at OS login.

## Lifecycle

- Closing a window retains the tray and engine.
- **Exit interface (keep agents running)** closes Electron and leaves the engine
  running. Reopening Agent Gitu attaches to that engine and its existing port.
- **Quit Agent Gitu and stop agents** requests a graceful engine shutdown before
  Electron exits. A shutdown that cannot finish reports its state instead of
  silently claiming success or force-killing saved work.
- A crashed Electron process does not own the engine's lifetime. Agent work that
  does not require its desktop browser can continue. Browser-dependent actions
  fail explicitly on disconnect and are never automatically replayed.
- An engine crash leaves Electron alive and presents **Try again**. Restarting
  recovers durable task state using the existing interrupted-run behavior;
  uncertain tool calls are not replayed automatically.
- Running another build against the same data home reports the existing owner
  rather than stopping it or opening a competing engine. Quit the owning build
  before switching installations or replacing its executable during an update.

## Ownership and control

Each data home has a descriptor, an engine log, and a small ownership database
under `~/.agent-gitu-engines/<home-hash>/`. An exclusive SQLite transaction gives
one engine ownership before workspace databases are opened. OS locks release
after a crash; no stale PID file needs to be deleted by the user.

The private control listener binds only to `127.0.0.1` on an ephemeral port. It
requires a random bearer token stored in the user-private descriptor, rejects
requests carrying a browser Origin, and accepts only health, shutdown, and the
desktop browser bridge. Tokens never appear in URLs or normal logs. This control
plane does not replace or disable the public UI API's authentication or policy.

The interface imports no agent/server modules. Existing CLI/headless server
entry points continue working independently of the desktop launcher.

## Validation

Run `npm run build`, then `node scripts/desktop-engine-smoke.mjs`. The smoke test
uses a fresh temporary profile and local fixture page, never the user's data or
model accounts. It checks distinct processes, single ownership, browser actions
and screenshots, UI crash/reconnect, engine crash/retry, and explicit shutdown.
Its result is written to `.qa/desktop-engine-smoke-result.json`.
