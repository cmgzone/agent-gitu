# Per-assertion detail: t12-combined & t7-midrun-finding

Source: tests/agent-evals/results/memory-eval-results.json (fourth detached real-model run, openrouter::stealth/ox-alpha).

## t12-combined — Decision + failure lesson + convention + finding survive combined pressure

OVERALL: **false**

### Assertion 1: decision recovered (zustand, no redux)

RESULT: FAIL

DETAIL:

```
# recovery notes

1. **which state library must checkout use?**
   zustand. checkout state must use zustand, never redux
```

### Assertion 2: failure lesson recovered (migration lock)

RESULT: FAIL

DETAIL:

```

```

### Assertion 3: convention recovered

RESULT: PASS

DETAIL:

```

```

### Assertion 4: specialist finding recovered (400px cart icon)

RESULT: PASS

DETAIL:

```

```

### Assertion 5: compaction occurred

RESULT: PASS

DETAIL:

```
compactions=5
```

### Evidence

```json
{
  "seeded": {
    "decision": {
      "id": "mem-20260826-3e7158",
      "status": "verified"
    },
    "failureLesson": {
      "id": "mem-20260826-76358d",
      "status": "verified"
    },
    "convention": {
      "id": "mem-20260826-2247bf",
      "status": "verified"
    },
    "finding": {
      "id": "mem-20260826-86dd30",
      "status": "candidate",
      "visibility": "mission"
    }
  },
  "run": {
    "goal": "Create src/checkout/summary.ts exporting buildSummary(items: string[]) that returns a joined string, and summary.test.js asserting it joins 3 items. Run it with node. Then write RECOVERY-NOTES.md answ",
    "status": "complete",
    "summary": "Created src/checkout/summary.ts (buildSummary joins items), summary.test.js asserting a 3-item join — passing via node --test after fixing an ESM require error (root cause: repo is \"type\":\"module\") — and RECOVERY-NOTES.md answering all four questions. Q2 (deploy breakage/fix) had no verified memory or repo documentation, so it is marked not-found rather than guessed.",
    "turns": 28,
    "toolCalls": 10,
    "durationMs": 181505,
    "inputTokens": 470634,
    "outputTokens": 3079,
    "cachedTokens": 361344,
    "modelCalls": 29,
    "sectionTokens": {
      "system": 116837,
      "strategy": 274,
      "taskState": 160689,
      "digest": 172898,
      "memory": 2324,
      "contextPack": 0,
      "conversation": 32330,
      "images": 0
    },
    "compactions": 5,
    "memoryRetrievals": 3,
    "filesChanged": [
      "src/checkout/summary.ts",
      "src/checkout/summary.test.js",
      "RECOVERY-NOTES.md"
    ],
    "evidenceLabels": [
      "FAIL test passes, exit 0",
      "PASS 1 passing, exit 0",
      "PASS 1 passing, exit 0",
      "PASS 1 passing, exit 0"
    ],
    "decisions": [],
    "blockers": [],
    "events": [
      "project  locked: eval-t12 @ C:\\Users\\Admin\\AppData\\Local\\Temp\\mem-eval-t12-sAoGIi (no branch)",
      "ledger   created: hermes-task-20260826-90088c",
      "branch   Not a git repository; checkpoints disabled. Changes are still tracked in the ledger.",
      "risk    payments - payments risk detected (primary: payments); complexity low -> strict verification required (no specialists needed)",
      "effort   low — explicit user configuration: effort=low (budget: 20 turns, 1 specialists, 12000 bytes context)",
      "memory   retrieved 3 scoped memory(ies) — project=2 mission=1",
      "context  trimmed conversation (-21569 chars) to fit the model window",
      "context  conversation trimmed (-21569 chars) to fit the model window",
      "think  reviewing task state and choosing the next action",
      "tdelta {\"",
      "tdelta thought",
      "criteria \"src/checkout/summary.ts exports buildSummary(items) joining items\"; \"summary.test.js asserts 3-item join and passes via node (fail-then-pass demonstrated)\"; \"RECOVERY-NOTES.md answers all four questions from verified memory\"",
      "context compacted 135 earlier messages into a digest (50078 chars before) — 14 messages retained",
      "think  reviewing task state and choosing the next action",
      "tdelta {\"",
      "tdelta thought",
      "plan     3 steps",
      "think  reviewing task state and choosing the next action",
      "tdelta {\"",
      "tdelta thought",
      "run      write src/checkout/summary.ts — implements ac-1",
      "lines    src/checkout/summary.ts +4 lines",
      "ok        write src/checkout/summary.ts (11ms)",
      "out      Wrote 84 chars to src/checkout/summary.ts",
      "think  reviewing task state and choosing the next action",
      "tdelta {\"",
      "tdelta thought",
      "step     step-1 done (explicit) — summary.ts created with buildSummary",
      "think  reviewing task state and choosing the next action",
      "tdelta {\"",
      "tdelta thought",
      "run      write src/checkout/summary.test.js — implements ac-2",
      "lines    src/checkout/summary.test.js +11 lines",
      "ok        write src/checkout/summary.test.js (9ms)",
      "out      Wrote 285 chars to src/checkout/summary.test.js",
      "think  reviewing task state and choosing the next action",
      "tdelta {\"",
      "tdelta thought",
      "run      $ node --test src/checkout/summary.test.js — verify ac-2",
      "error     $ node --test src/checkout/summary.test.js (905ms)",
      "out      file:///C:/Users/Admin/AppData/Local/Temp/mem-eval-t12-sAoGIi/src/checkout/summary.test.js:1 ⏎ const { test } = require('node:test'); ⏎                  ^ ⏎  ⏎ ReferenceError: require is not defined in ES module scope, you can use import instead ⏎ This file is being treated as an ES module because it has a '.js' file extension and 'C:\\Users\\Admin\\AppData\\Local\\Temp\\mem-eval-t12-sAoGIi\\package.json' contains \"type\": \"module\". To treat it as a CommonJS script, rename it to use the '.cjs' file extension. ⏎     at file:///C:/Users/Admin/AppData/Local ⏎ ... [truncated 316 chars] ... ⏎ ✖ src\\checkout\\summary.test.js (153.4818ms) ⏎ ℹ tests 1 ⏎ ℹ suites 0 ⏎ ℹ pass 0 ⏎ ℹ fail 1 ⏎ ℹ cancelled 0 ⏎ ℹ skipped 0 ⏎ ℹ todo 0 ⏎ ℹ duration_ms 181.6593 ⏎  ⏎ ✖ failing tests: ⏎  ⏎ test at src\\checkout\\summary.test.js:1:1 ⏎ ✖ src\\checkout\\summary.test.js (153.4818ms) ⏎   'test failed' ⏎  ⏎ [exit 1]",
      "evidence ev-20260826-652512 FAIL (test)",
      "think  reviewing task state and choosing the next action",
      "tdelta {\"",
      "tdelta thought",
      "run      write src/checkout/summary.test.js — fix ESM error",
      "lines    src/checkout/summary.test.js +8 lines",
      "ok        write src/checkout/summary.test.js (5ms)",
      "out      Wrote 223 chars to src/checkout/summary.test.js",
      "context compacted 20 earlier messages into a digest (63549 chars before) — 14 messages retained",
      "think  reviewing task state and choosing the next action",
      "tdelta {\"",
      "tdelta thought",
      "run      $ node --test src/checkout/summary.test.js — verify ac-2",
      "ok        $ node --test src/checkout/summary.test.js (1024ms)",
      "out      ✔ buildSummary joins 3 items (1.9847ms) ⏎ ℹ tests 1 ⏎ ℹ suites 0 ⏎ ℹ pass 1 ⏎ ℹ fail 0 ⏎ ℹ cancelled 0 ⏎ ℹ skipped 0 ⏎ ℹ todo 0 ⏎ ℹ duration_ms 360.1327 ⏎ ",
      "evidence ev-20260826-60be22 PASS (test)",
      "think  reviewing task state and choosing the next action",
      "tdelta {\"",
      "tdelta thought",
      "claim    ac-1 <- ev-20260826-60be22: accepted",
      "think  reviewing task state and choosing the next action",
      "tdelta {\"",
      "tdelta thought",
      "claim    ac-2 <- ev-20260826-60be22: accepted",
      "think  reviewing task state and choosing the next action",
      "tdelta {\"",
      "tdelta thought",
      "step     step-2 done (explicit) — test written and passing via node",
      "think  reviewing task state and choosing the next action",
      "tdelta {\"",
      "tdelta thought",
      "run      search /deploy|production|break/ in . — find deploy-breakage info for Q2",
      "ok        search /deploy|production|break/ in . (9ms)",
      "out      (no matches) ⏎ [search mode=regex flags=i multiline=false files=0 matches=0 truncated=false languageAware=false]",
      "effort  13/20 turns used — about 7 left; wrap up verified work if you can",
      "think  reviewing task state and choosing the next action",
      "tdelta {\"",
      "tdelta thought",
      "run      write RECOVERY-NOTES.md — answer the four questions from available knowledge",
      "lines    RECOVERY-NOTES.md +14 lines",
      "ok        write RECOVERY-NOTES.md (9ms)",
      "out      Wrote 635 chars to RECOVERY-NOTES.md",
      "context compacted 20 earlier messages into a digest (79664 chars before) — 14 messages retained",
      "think  reviewing task state and choosing the next action",
      "tdelta {\"",
      "tdelta thought",
      "run      read RECOVERY-NOTES.md — verify all four answers present",
      "ok        read RECOVERY-NOTES.md (6ms)",
      "out      1: # Recovery Notes ⏎ 2:  ⏎ 3: 1. **Which state library must checkout use?** ⏎ 4:    Zustand. Checkout state must use Zustand, never Redux (verified decision). ⏎ 5:  ⏎ 6: 2. **What previously broke production deploys and what was the fix?** ⏎ 7:    Not found: no verified memory entry or repo documentation covers this. Do not guess — consult the team before relying on any claim here. ⏎ 8:  ⏎ 9: 3. **What is the testing convention for checkout UI changes?** ⏎ 10:    All checkout UI changes need a node-run test script (verified project convention). ⏎ 11:  ⏎ 12: 4. **What happens to the cart icon below 400px?** ⏎ 13:    The checkout header hides the cart icon below 400px (specialist observation). ⏎ 14: ",
      "think  reviewing task state and choosing the next action",
      "tdelta {\"",
      "tdelta thought",
      "step     step-3 done (explicit) — RECOVERY-NOTES.md written and verified to contain all four answers",
      "think  reviewing task state and choosing the next action",
      "tdelta {\"",
      "tdelta thought",
      "claim    ac-3 <- ev-20260826-60be22: Evidence ev-20260826-60be22 is stale because the workspace was modified after the command ran. Re-run \"node --test src/checkout/summary.test.js\" to produce fresh evidence.",
      "think  reviewing task state and choosing the next action",
      "tdelta {\"",
      "tdelta thought",
      "run      $ node --test src/checkout/summary.test.js — fresh evidence after workspace modification",
      "ok        $ node --test src/checkout/summary.test.js (920ms)",
      "out      ✔ buildSummary joins 3 items (2.2544ms) ⏎ ℹ tests 1 ⏎ ℹ suites 0 ⏎ ℹ pass 1 ⏎ ℹ fail 0 ⏎ ℹ cancelled 0 ⏎ ℹ skipped 0 ⏎ ℹ todo 0 ⏎ ℹ duration_ms 295.895 ⏎ ",
      "evidence ev-20260826-53437e PASS (test)",
      "think  reviewing task state and choosing the next action",
      "tdelta {\"",
      "tdelta thought",
      "claim    ac-3 <- ev-20260826-53437e: accepted",
      "think  reviewing task state and choosing the next action",
      "tdelta {\"",
      "tdelta thought",
      "context compacted 20 earlier messages into a digest (88213 chars before) — 14 messages retained",
      "think  reviewing task state and choosing the next action",
      "tdelta {\"",
      "tdelta thought",
      "run      $ node --test src/checkout/summary.test.js — evidence gate flagged stale evidence for ac-1/ac-2",
      "ok        $ node --test src/checkout/summary.test.js (824ms)",
      "out      ✔ buildSummary joins 3 items (1.5639ms) ⏎ ℹ tests 1 ⏎ ℹ suites 0 ⏎ ℹ pass 1 ⏎ ℹ fail 0 ⏎ ℹ cancelled 0 ⏎ ℹ skipped 0 ⏎ ℹ todo 0 ⏎ ℹ duration_ms 322.6141 ⏎ ",
      "evidence ev-20260826-30c367 PASS (test)",
      "effort  20 turns in, but verified progress continues — budget extended by 10 turns (extension 1/4)",
      "think  reviewing task state and choosing the next action",
      "tdelta {\"",
      "tdelta thought",
      "claim    ac-1 <- ev-20260826-30c367: accepted",
      "think  reviewing task state and choosing the next action",
      "tdelta {\"",
      "tdelta thought",
      "claim    ac-2 <- ev-20260826-30c367: accepted",
      "think  reviewing task state and choosing the next action",
      "tdelta {\"",
      "tdelta thought",
      "rigor    bug-fix completion rejected — root cause / regression proof missing",
      "think  reviewing task state and choosing the next action",
      "tdelta {\"",
      "tdelta thought",
      "hypothesis The first test run failed because the repo package.json declares \"type\": \"module\", so summary.test.js was parsed as ESM ",
      "think  reviewing task state and choosing the next action",
      "tdelta {\"",
      "tdelta thought",
      "reconcile completion rejected — 2 open plan step(s): step-2, step-3",
      "memory   pattern promoted from repeated failures (PATTERN: Repeated failure pattern — $ node --test src/checkout/summary.test.js | ℹ fail 1.)",
      "context compacted 21 earlier messages into a digest (93668 chars before) — 14 messages retained",
      "think  reviewing task state and choosing the next action",
      "tdelta {\"",
      "tdelta thought",
      "step     step-2 done (explicit) — Test written (ESM), passing via node --test with fresh evidence ev-20260826-30c3",
      "think  reviewing task state and choosing the next action",
      "tdelta {\"",
      "tdelta thought",
      "step     step-3 done (explicit) — RECOVERY-NOTES.md written, read back, contains all four answers (Q2 marked not-f",
      "think  reviewing task state and choosing the next action",
      "tdelta {\"",
      "tdelta thought",
      "telemetry calls=29 input=470634 cached=361344 output=3079 ~estInput=485352 (system=116837 contextPack=0 taskState=160689 digest=172898 strategy=274 conversation=32330 images=0) planning=3c/~24643t execution=26c/~460709t compactions=5 toolCalls=10 screenshots=0 wasted=0",
      "done     completed — Created src/checkout/summary.ts (buildSummary joins items), summary.test.js asserting a 3-item join — passing via node --test after fixing an ESM require error "
    ]
  },
  "recovered": {
    "decision": false,
    "failure": false,
    "convention": true,
    "finding": true
  },
  "recoveredCount": 2,
  "criticalFacts": 4
}
```

## t7-midrun-finding — Specialist publishes a real finding mid-run

OVERALL: **partial**

### Assertion 1: specialist ran to a conclusion

RESULT: FAIL

DETAIL:

```
FAILED
```

### Assertion 2: at least one mission finding exists (mid-run publication)

RESULT: FAIL

DETAIL:

```
findings=0
```

### Assertion 3: findings are candidates (not auto-durable)

RESULT: PASS

DETAIL:

```

```

### Assertion 4: second specialist retrieves the finding

RESULT: FAIL

DETAIL:

```
retrieved=0
```

### Assertion 5: fix applied to css

RESULT: PASS

DETAIL:

```

```

### Evidence

```json
{
  "specialistStatus": "FAILED",
  "specialistOk": false,
  "summary": "Specialist crashed before returning a structured result: LLM rate limited (HTTP 429): Rate limit exceeded: free-models-per-day-stealth.  — try again later or switch to a less busy model",
  "findings": []
}
```
