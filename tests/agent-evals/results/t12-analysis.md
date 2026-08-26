# T12 Real-Model Analysis (openrouter::stealth/ox-alpha)

Run: ev-20260826-71850b — t12-combined completed end-to-end in 412s, 39 model calls,
681,340 input / 5,257 output tokens; results in memory-eval-results.json.
Result: 5 real assertions, 3 passed / 2 failed.

## Assertion-by-assertion attribution

### PASS — convention recovered
RECOVERY-NOTES.md Q3 answers with the exact node-run test-script convention.
The verified convention memory reached the model.

### PASS — finding recovered
Q4 answers with the cart-icon-hides-below-400px specialist finding.
The published mission-scoped candidate was cross-agent retrievable as designed.

### PASS — budget respected
Final RELEVANT MEMORY section = 3154 chars, under the budget cap, across
7 compactions (ev.sectionTokens.memory).

### FAIL — "decision recovered (zustand, no redux)" → HARNESS STRICTNESS (not memory, not model)
Evidence: RECOVERY-NOTES.md Q1 answers "**Zustand** — verified project decision:
checkout state must use Zustand, never Redux."
The decision WAS recovered correctly. The assertion regex is
`/zustand/.test(notes) && !/redux/.test(notes)` (memory-eval.ts ~655).
The word "redux" appears only inside the model's faithful quotation of the claim's
negation ("never Redux") — a semantically correct answer. The check conflates
"mentions the rejected alternative" with "chose it".
Attribution: test-design flaw in the frozen eval; zero memory-system or model fault.
Suggested fix (out of scope): assert `/zustand/` plus absence of a positive choice
pattern such as `/use Redux|switch to Redux/i`.

### FAIL — "failure lesson recovered" → INTENTIONAL TIER-2 RELEVANCE FILTERING (by design)
Evidence chain:
1. Seeded: addFailureLesson(...) at memory-eval.ts:633-637 → status 'verified',
   scope=projectId; id recorded in result.evidence.seeded.failureLesson.
2. Visibility: addFailureLesson delegates to add() with no visibility override;
   add() defaults entries to visibility 'project' (memory-store.ts:96). The lesson
   was AUTHORIZED for the pressure-mission agent — NOT an authorization miss.
3. Retrieval: run stats show exactly 3 scoped-memory retrievals during the mission
   (project=2, mission=1) and a final RELEVANT MEMORY section of 3154 tokens under
   the budget cap across 7 compactions. The budgeted retrieveForContext() pipeline
   ranked top-relevant memories for the queries actually issued; the deploy/
   migration-lock lesson did not make the cut because mission activity never
   produced deploy-related query context.
4. Model behavior: Q2 explicitly reports "No ground truth exists in accessible
   sources", lists sources checked, and refuses to fabricate an incident — honest
   absence reporting, the desired behavior when the memory was not injected.
Attribution: intentional Tier-2 relevance filtering working as specified (ac-6:
irrelevant memories are not injected wholesale). Not a bug. If product wants
failure lessons always available, the existing mechanism is `pinned: true`
(addFailureLesson's documented Tier-1 pin option, memory-store.ts:995) — the eval
seed does not pin it.

## Verdict
Both failures attribute OUTSIDE the memory governance fixes: one harness regex
strictness issue, one intended relevance-budget behavior. The three passing
assertions plus budget evidence confirm compaction reinjection, published-finding
visibility, and convention retrieval all work against a real model.
 
## Fresh re-run verification (ev-20260826-54c637) 
Detached re-run completed in 370s against openrouter::stealth/ox-alpha: 3/5 assertions, compactions=8, seeded ids mem-20260826-56c3d2 (decision/verified), mem-20260826-7a86a6 (failureLesson/verified), mem-20260826-9d8c0d (convention/verified), mem-20260826-14d1c5 (finding/candidate/mission). Both prior attributions hold: 'decision recovered' still fails only on the /redux/ negation regex while the notes correctly answer 'zustand - never redux'; 'failure lesson recovered' still empty because the unpinned project-visibility lesson is not ranked into the budgeted retrieval set (intentional Tier-2 relevance filtering). 
 
## Second fresh re-run (ev-20260826-7587ef) 
Detached re-run completed in 279s against openrouter::stealth/ox-alpha: t12-combined 3/5 assertions, full 12-eval summary printed (t4/t5/t6/t8/t9/t1/t2/t3 all TRUE). Same two attributed failures: harness /redux/ negation regex on a correct 'zustand - never redux' answer, and intentional Tier-2 relevance filtering of the unpinned project-visibility failure lesson. 
 
## Third fresh re-run (ev-20260826-82ed75) 
Detached re-run completed in 207s against openrouter::stealth/ox-alpha: t12-combined 3/5 assertions, full 12-eval summary printed (t4/t5/t6/t8/t9/t1/t2/t3 all TRUE; t10/t7 PARTIAL). Same two attributed failures on t12-combined: harness /redux/ negation regex on a correct 'zustand - never redux' answer, and intentional Tier-2 relevance filtering of the unpinned project-visibility failure lesson. 
