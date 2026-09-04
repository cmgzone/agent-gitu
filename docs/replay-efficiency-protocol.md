# Real-Run Efficiency Replay Protocol

Synthetic tests prove the recovery-control runtime is **correct**. This protocol
proves it is **efficient under a weak/drifty model** — the property the original
Flappy Bird failure actually exposed (110+ actions, repeated reads of unchanged
files, a superseded failure resurrected, never leaving step 1).

## Setup

1. Reset the target project to the same starting state as the broken run
   (`git worktree add ../flappy-baseline <broken-run-base-commit>` or an
   equivalent clean checkout). The comparison is only meaningful when both runs
   start from byte-identical source.
2. Configure the same provider used by the broken run:

   ```
   gitu run "<the same Flappy Bird task prompt>" \
     --provider deepseek --model <deepseek-v4-flash-model-id>
   ```

   The broken run used `effort=max` (high complexity classification, large turn
   budget). Match that in the app's run form when running from the desktop app.
3. During the run, send the same mid-run steering message the broken run
   received ("are you stuck on step 1?") at roughly the same point — after the
   first repair has been applied and verification is failing again.

## What to capture

- The end-of-run **`efficiency`** event line (single greppable `key=value`
  summary — see below).
- The **`telemetry`** event line (token attribution detail).
- `git status` / the project diff after the run (scratch-diagnostic check).
- The saved task ledger (`gitu show <task-id>`) for the step timeline.

## The efficiency line

```
efficiency actions=42 steps=3/4 files=7 dupReadsPrevented=9 cacheHits=4 voiBlocks=3 driftBlocks=1 decisionToAct=1 (reads 0) episodes=2 supersessions=1 reopenings=0 mootSupersessions=0 steers=1 stateReplayAvoided=48.2Kc tokensIn=31.2Kt tokensOut=8.4Kt
```

## Pass gates (broken run vs this run)

| Metric | Broken run | Gate for the controlled run |
| --- | --- | --- |
| `actions` | 110+ | **< 30–40** |
| Semantic duplicate reads executed | many (every re-read succeeded) | near zero executed; work shows up as `dupReadsPrevented` / `cacheHits` instead |
| `reopenings` | 1 (returned to 403.6/406.8 after "fixing" it) | **0** — a superseded failure signature is never resurrected |
| `decisionToAct` | unbounded (5+ reads between diagnosis and repair) | **≤ 2 actions** from decision sufficiency to the first repair |
| Steering | sat behind another diagnostic | `steers=1` and the steer is applied at the next action boundary (visible as a `USER MESSAGE` narration before the next action) |
| Task-state replay | every turn re-sent a full state message | `stateReplayAvoided` substantially > 0; at most one live TASK STATE per turn |
| Scratch diagnostics | `diag-speed.js` etc. in the repo root | **no `diag-*.js` in the project diff** (any scratch lives under `.hermes/tmp/<taskId>/` and is deleted on completion) |
| `supersessions` | 0 (episodes never cleanly replaced) | 1+ — the failure surface moves through clean episode hand-offs |
| `mootSupersessions` | n/a | **rare.** Persistent non-zero values across runs would mean the runtime is spawning recovery episodes around optional/benign actions — investigate before trusting other gates |
| Tokens | baseline | substantially lower in + out |

## Interpreting failure

- `dupReadsPrevented=0` with high action counts → the InvestigationGuard is not
  being consulted (check that reads go through `checkPreAction`, including
  parallel batches).
- `reopenings>0` → the failure-signature normalizer is forking one failure into
  multiple signatures (look for unmasked volatile text) or merging distinct
  ones (look for missing command/expected context).
- `decisionToAct` high with `voiBlocks=0` → the problem never reached
  `decision_sufficient`/`act_now`; check the diagnosis path, not the gate.
- Run ends `stalled` with `mootSupersessions` high → recovery episodes are
  being created for benign failures; tighten the blocking rule, not the gate.
