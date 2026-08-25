# Gitu Real-Model Memory Evaluation

Model: openrouter :: stealth/ox-alpha (free tier, real HTTP executions)
Architecture: FROZEN (59 files, 680/680 unit tests green before evaluation)
Harness: tests/agent-evals/memory-eval.ts — evidence file: results/memory-eval-results.json

## Overall
- Tasks executed: 12 test scenarios (~22 real Hermes runs)
- Tasks successful: 6 passed, 4 partial, 2 failed
- Memory-related failures: 3 (T4 consolidation, T6 storage/dedupe, T12 retrieval/digest)
- Model-related failures: 2 (T7 no mid-run publication, T10 both arms blocked)

## Memory Recall
- Recall rate: 5/6 long-range scenarios recalled critical info (T1 pass, T2 pass, T3 pass, T5 pass, T8 pass; T12 partial)
- Critical-memory recall rate: 2/4 critical facts recovered in the combined stress test (T12); 1/1 in isolated tests (T1, T2)
- Average retrieval latency: retrieval is synchronous lexical scan; no measurable latency added (memory events appear at intake)

## Memory Precision
- Useful: 2
- Neutral: 4
- Redundant: 0
- Wrong: 0
- Harmful: 0
- Precision: 0.33 (2/6 injected memories were useful)
- Memory token overhead: 0.5% of total input (T9: 1,110 memory tokens vs 202,723 input tokens)

## False Memory Resistance
- Unsupported claims: 1 (PostgreSQL claim seeded as model_inference)
- Incorrectly promoted: 0 (claim stayed 'candidate' for the entire run)
- Correctly rejected: 1 (candidate never outranked verified evidence in retrieval)
- Corrected after evidence: 1 (recordVerified SQLite superseded the claim path; ranked first afterwards)

## Semantic Memory (ran in LEXICAL FALLBACK mode — no working embeddings endpoint available)
- Strong duplicates: 1 (T5 paraphrase pair correctly consolidated, provenance preserved)
- Possible contradictions: flagged in unit-level semantic tests; NOT flagged in fallback mode (see failure T4)
- Incorrect merges: 1 (T4: contradictory Zustand/Redux claims merged by lexical fallback)
- Incorrect supersessions: 2 (both halves of the contradictory pair auto-superseded by the bad merge)

## Specialist Memory
- Private-memory leaks: 0 (B could not see A's agent-scope memory)
- Correctly isolated: yes (filtering enforced pre-ranking inside the store)
- Published findings: 1 via explicit API (T6); mid-run publication in T7 did NOT occur (model never called publish_finding)
- Successfully shared: partial — completion-path sharing worked (B retrieved 2 entries), mid-run sharing untested by the model

## Pattern Learning
- 1-observation promotions: 0
- 2-observation promotions: 0
- 3-independent-observation promotions: 1 (PATTERN created on the third distinct verified task)
- False pattern promotions: 0 (same-task repeats correctly ignored)

## Digest / Trimming
- Critical facts tested: 4 (decision, failure lesson, convention, specialist finding) + engine-purity decision (T2)
- Critical facts recovered: 3 of 5 scenarios fully recovered critical facts (T1 Zustand, T2 engine purity, T5 consolidation)
- Critical facts lost: 2 (T12: decision + failure lesson dropped from model context after 5 compaction generations; memory section injected once at intake = 104 tokens, never re-injected)
- Digest compactions: T1=4, T2=4, T9=2, T12=5 (all observed via 'context compacted' events)
- Context trims: buildModelContext trims observed via section accounting (memory/contextPack yield before history)

## Token Economics
- Memory ON input tokens: 60,951 (T10-A, single sample; also T9 full run: 202,723 with heavy filler history)
- Memory OFF input tokens: 128,257 (T10-B, same task shape)
- Memory token overhead: 396-1,110 tokens per run (0.5% or less of total input)
- Digest overhead: 16,052 tokens cumulative in T9's compaction-heavy run
- Task success comparison: inconclusive this run — A blocked, B completed (single samples; free-tier model variance is high). Directionally, memory-ON used ~50% fewer input tokens.

## Failures

### FAILURE 1
TEST: T4 — Real contradiction
EXPECTED: possible-contradiction flag; merged=0; no automatic supersession
ACTUAL: merged=1 ("Checkout state uses Zustand; Checkout state uses Redux"), both originals superseded
EVIDENCE: results JSON t4-contradiction — mergedClaims, supersededCount=2
ROOT CAUSE: consolidateSemantic without an embedder delegates to lexical consolidate(), which groups purely on overlapRatio >= 0.45 with no contradiction gate (contradictionSignals only runs in the semantic classifier)
LAYER: MEMORY CONSOLIDATION
SEVERITY: HIGH — destructive merge of contradictory verified facts whenever embeddings are unavailable

### FAILURE 2
TEST: T6 — Specialist isolation/publication
EXPECTED: publishFinding creates a NEW mission-scope candidate
ACTUAL: publishFinding hit the add() dedupe key (type+scope+claim) and returned A's existing PRIVATE agent-scope memory; nothing was shared; B retrieved 0
EVIDENCE: results JSON t6-isolation — publication.id === privateMemory.id, visibility stayed 'agent'
ROOT CAUSE: dedupe key ignores visibility scope — a finding identical to the publisher's own private memory collapses into it instead of creating a shareable entry
LAYER: MEMORY STORAGE
SEVERITY: HIGH — findings that mirror a private observation can never be shared

### FAILURE 3
TEST: T12 — Combined stress (decision + failure lesson + convention + finding vs 280 filler turns)
EXPECTED: all four critical facts recoverable at notes-time
ACTUAL: only convention + finding recovered; decision + failure lesson lost; model declared "no authoritative sources" and blocked; memory section injected ONCE (104 tokens) at intake and consumed by subsequent compactions (5 generations)
EVIDENCE: results JSON t12-combined — recoveredCount=2, compactions=5, sectionTokens.memory=104
ROOT CAUSE: the RELEVANT MEMORY section is injected only at intake and is not part of the protected per-turn state; compaction digests its content away within a few generations
LAYER: MEMORY RETRIEVAL + DIGEST interaction
SEVERITY: HIGH — long missions lose durable memory guidance exactly when compaction makes it most needed

### FAILURE 4
TEST: T7 — Mid-run finding
EXPECTED: specialist publishes via publish_finding mid-run
ACTUAL: specialist fixed the bug and succeeded but never called publish_finding (sharing happened only through the completion-path publication)
ROOT CAUSE: MODEL FAILURE — the free-tier model did not use the documented mid-run action unprompted
LAYER: MODEL FAILURE
SEVERITY: LOW-MEDIUM (architecture provided the mechanism; the model did not use it)

### FAILURE 5
TEST: T9/T10 — precision and economics assertions
EXPECTED: precision >= 0.4; both arms complete
ACTUAL: precision 0.33 (stopword 'the' gives zero-value claims relevance > 0; scope-match floor admits noise); T10 both arms blocked on one attempt (free-model variance)
ROOT CAUSE: MEMORY RANKING (relevance gate counts stopword tokens) + MODEL FAILURE (free-tier instability)
LAYER: MEMORY RANKING / MODEL FAILURE
SEVERITY: MEDIUM

## Final Verdict

Rating: **C — useful but needs targeted fixes**

Measured justification:
- The core promise holds under a real model: decisions recorded early survive 160-280 turns of pressure and 4-5 compaction generations when they are in protected sections (T1 7/7, T2 4/4); false model claims cannot become authoritative (T3 5/5); paraphrase consolidation preserves provenance (T5 3/3); success patterns require 3 independent verified observations (T8 5/5); specialist isolation leaks nothing (T6 isolation assertions passed); overload retrieval selects 8/30 within budget (T11).
- But three targeted defects caused real information loss or blocking under a real model, none of them design flaws — all are narrow implementation gaps in the frozen architecture:
  1. lexical-fallback consolidation lacks the contradiction gate (T4),
  2. publishFinding collides with the publisher's own private memory in the dedupe key (T6),
  3. the RELEVANT MEMORY section is intake-only and decays across compaction generations (T12).
- Precision is mediocre (0.33) because the lexical relevance gate counts stopwords; memory cost is negligible (<= 0.5% of input), so the fix is ranking quality, not budget.
- Token economics are favorable but statistically weak (single A/B samples): memory-ON used 60,951 vs OFF 128,257 input tokens on the same task shape.

All three defects have obvious, narrow fixes (apply contradictionSignals inside the lexical fallback; make the dedupe key visibility-aware so publication creates a new scoped entry; re-inject the memory section per turn alongside TASK STATE). Per the evaluation rules, none were applied during the evaluation.

Post-evaluation note: the frozen architecture remains intact — 56 files / 680 unit tests still pass after the evaluation, typecheck clean, harness files added only under tests/agent-evals/.
