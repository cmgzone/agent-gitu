import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type {
  FollowUpClassificationKind,
  FollowUpRecord,
  InstructionConstraint,
  InstructionVerification,
  TargetHints,
  UserInstruction,
} from '../types.js';
import type { TaskLedger } from '../ledger/task-ledger.js';
import { shortId } from '../util.js';

export interface FollowUpClassificationResult {
  kind: FollowUpClassificationKind;
  confidence: 'high' | 'medium' | 'low';
  goalDelta?: string;
  extractedInstructions: Array<Omit<UserInstruction, 'id' | 'createdAt'>>;
  targetHints: TargetHints;
  supersedePreviousHypothesis?: boolean;
}

const CONTINUE_PATTERNS = [
  /^(?:continue|proceed|keep going|finish it|go ahead|next step|carry on|resume|do it|yes please|yes proceed|ok proceed)\b/i,
  /^ok$/i,
  /^yes$/i,
  /^sure$/i,
  /^go$/i,
  /^next$/i,
];

/**
 * Questions about the agent's live progress are conversation steering, not a
 * new engineering requirement. Treating "are you stuck on step 1?" as the
 * new currentGoal overwrote the real task, bumped instruction epochs, and
 * could make the recovery loop even less coherent. These questions stay in
 * conversation history for the next model turn, but they do not mutate task
 * authority, target hints, or specialist validity.
 */
const NON_MUTATING_STATUS_PATTERNS = [
  /\b(?:are you|you are|you're)\s+(?:stuck|still working|still on|working on|doing)\b/i,
  /\b(?:why are you|why're you)\s+(?:still\s+)?(?:on|reading|checking|working|doing)\b/i,
  /\b(?:what|which)\s+(?:step|stage|part)\s+(?:are you|you are|you're)\s+(?:on|at|doing)\b/i,
  /\b(?:what(?:'s| is) happening|what(?:'s| is) going on|how far are you|how far along are you)\b/i,
  /^(?:status|progress|status update|progress update)\??$/i,
];

export function isNonMutatingStatusQuestion(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed || trimmed.length > 220) return false;
  return NON_MUTATING_STATUS_PATTERNS.some((pattern) => pattern.test(trimmed));
}

const CONSTRAIN_PATTERNS = [
  /\b(?:don't|do not|never|must not|cannot|should not)\s+(?:modify|touch|edit|change|install|delete|remove|browse|use)\b/i,
  /\b(?:only edit|only modify|restricted to|limit edits to)\b/i,
  /\b(?:no npm install|no package install|no subagents|no specialists|no external requests)\b/i,
];

const CORRECT_PATTERNS = [
  /^(?:no[,.\s]|nope|actually|wrong|incorrect|that's not|stop doing)\b/i,
  /\b(?:instead of|rather than|not the backend|backend is fine|frontend is fine|is actually)\b/i,
];

const EXTEND_PATTERNS = [
  /^(?:also\b|in addition|additionally|plus\b|and also\b|and support\b)/i,
  /\b(?:also support|also add|additionally support|and also add)\b/i,
];

const VISUAL_PATTERNS = [
  /\b(?:this image|the screenshot|attached image|look like this|like the photo|like the mockup|match the image|see attached)\b/i,
];

const NEW_TASK_PATTERNS = [
  /^(?:now (?:add|build|create|implement)|start over|new task|reset and|from scratch)\b/i,
];

export function extractTargetHints(message: string): TargetHints {
  const files = new Set<string>();
  const symbols = new Set<string>();
  const errors = new Set<string>();

  // Extract file paths like foo.ts, src/agent/gitu.ts, /path/to/file.tsx, etc.
  const fileRegex = /(?:[a-zA-Z0-9_\-./\\]+\.(?:ts|tsx|js|jsx|json|mjs|cjs|html|css|scss|md|py|go|rs|c|cpp|h|java|sql|prisma|yml|yaml|toml))\b/g;
  let fileMatch: RegExpExecArray | null;
  while ((fileMatch = fileRegex.exec(message)) !== null) {
    const matched = fileMatch[0].replace(/[\\/]+/g, '/');
    if (matched && !matched.startsWith('http')) {
      files.add(matched);
    }
  }

  // Extract code symbols e.g. functionName(), `ClassName`, #symbol, ClassName
  const symbolRegex = /`([a-zA-Z0-9_$]+)`|\b([a-zA-Z0-9_$]+)\(\)/g;
  let symMatch: RegExpExecArray | null;
  while ((symMatch = symbolRegex.exec(message)) !== null) {
    const sym = symMatch[1] ?? symMatch[2];
    if (sym && sym.length >= 2 && !['and', 'the', 'for', 'this', 'with', 'from'].includes(sym.toLowerCase())) {
      symbols.add(sym);
    }
  }

  // Extract quoted strings or explicit error tokens
  const errorRegex = /(?:error:\s*([^\n]+)|"([^"\n]{4,60})"|'([^'\n]{4,60})')/gi;
  let errMatch: RegExpExecArray | null;
  while ((errMatch = errorRegex.exec(message)) !== null) {
    const err = (errMatch[1] ?? errMatch[2] ?? errMatch[3] ?? '').trim();
    if (err && (err.includes('Error') || err.includes('failed') || err.includes('exception') || err.length > 5)) {
      errors.add(err);
    }
  }

  return {
    files: Array.from(files),
    symbols: Array.from(symbols),
    errors: Array.from(errors),
  };
}

/**
 * Admission-time structured constraint parsing. Runs ONCE when a follow-up
 * arrives — never per tool execution. Returns the machine-readable constraint
 * when the wording resolves cleanly; `undefined` leaves the instruction on the
 * conservative legacy path rather than guessing broad semantics.
 */
export function parseStructuredConstraint(text: string): InstructionConstraint | undefined {
  const t = text.trim();

  // "only edit src/llm/llm.ts" / "only modify X and Y" → file_scope allow list.
  const onlyMatch = /^(?:only edit|only modify|restricted to|limit edits to)\s+(.+)$/i.exec(t);
  if (onlyMatch) {
    const allow = onlyMatch[1]!
      .split(/,|\band\b/)
      .map((s) => s.trim().replace(/['"`]/g, '').replace(/\\/g, '/'))
      .filter((s) => s.length > 1 && /[.\w]/.test(s));
    if (allow.length > 0) return { kind: 'file_scope', allow };
    return undefined;
  }

  // "don't modify X" / "do not touch X" / "don't change X" → deny_paths.
  const forbidMatch = /(?:don't|do not|never)\s+(?:modify|edit|touch|change)\s+([^\n,;]+)/i.exec(t);
  if (forbidMatch) {
    const raw = forbidMatch[1]!.trim()
      .replace(/^(?:the|a|an|our|your)\s+/i, '')
      .replace(/[.!]+$/, '')
      .replace(/['"`]/g, '')
      .replace(/\\/g, '/')
      .toLowerCase();
    const deny = new Set<string>();
    if (/^backend\b|backend code/.test(raw)) ['backend/', 'server/', 'api/'].forEach((d) => deny.add(d));
    else if (/^database\b|^db\b/.test(raw)) ['db/', 'database/', 'migrations/', 'prisma/', 'schema.prisma', '.sql'].forEach((d) => deny.add(d));
    else if (/[\w/]+\.\w{1,6}$|[\w-]+\//.test(raw)) deny.add(raw);
    else deny.add(raw); // conservative: the user's own token, nothing broader
    return { kind: 'deny_paths', deny: [...deny] };
  }

  const lower = t.toLowerCase();
  if (/\b(?:don't|do not|never|no)\s+(?:use\s+)?(?:specialists|subagents|delegat)/.test(lower) || /\bno (?:specialists|subagents|delegation)\b/.test(lower)) {
    return { kind: 'delegate' };
  }
  if (/\b(?:don't|do not|never)\s+(?:browse|fetch|use the web)|\bno web (?:search|browsing)|\bno external requests\b/.test(lower)) {
    return { kind: 'network' };
  }
  if (/\b(?:don't|do not|never)\s+install\b|\bno (?:npm |package )?install\b|\bdo not add dependencies\b/.test(lower)) {
    return { kind: 'package_install' };
  }
  if (/\b(?:don't|do not|never)\s+(?:delete|remove)\b|\bno file deletion\b/.test(lower)) {
    return { kind: 'file_delete' };
  }
  return undefined;
}

export function extractInstructionsFromFollowUp(message: string): Array<Omit<UserInstruction, 'id' | 'createdAt'>> {
  const instructions: Array<Omit<UserInstruction, 'id' | 'createdAt'>> = [];
  const lines = message.split(/(?<=[.!?])\s+|\n+|;\s*/).map((l) => l.trim().replace(/[.!?]+$/, '')).filter(Boolean);

  for (const line of lines) {
    // Check hard constraint — parse the structured form once, here.
    if (CONSTRAIN_PATTERNS.some((p) => p.test(line))) {
      const constraint = parseStructuredConstraint(line);
      instructions.push({
        text: line,
        type: 'constraint',
        enforcement: 'hard',
        status: 'active',
        source: 'follow-up',
        ...(constraint ? { constraint } : {}),
      });
      continue;
    }

    // Check correction — corrections often carry implicit constraints ("the
    // problem is frontend only" → deny backend); parse the structured form.
    if (CORRECT_PATTERNS.some((p) => p.test(line))) {
      const constraint = parseStructuredConstraint(line);
      instructions.push({
        text: line,
        type: 'correction',
        enforcement: 'hard',
        status: 'active',
        source: 'follow-up',
        ...(constraint ? { constraint } : {}),
      });
      continue;
    }

    // Check requirement
    if (/\b(?:must|ensure|make sure|always|needs to|require)\b/i.test(line)) {
      const verification = parseRequirementVerification(line);
      instructions.push({
        text: line,
        type: 'requirement',
        enforcement: 'completion',
        status: 'active',
        source: 'follow-up',
        ...(verification ? { verification } : {}),
      });
      continue;
    }

    // Check preference
    if (/\b(?:prefer|cleaner|better if|if possible|optional)\b/i.test(line)) {
      instructions.push({
        text: line,
        type: 'preference',
        enforcement: 'advisory',
        status: 'active',
        source: 'follow-up',
      });
    }
  }

  return instructions;
}

/**
 * Admission-time verification parsing for completion requirements. "You must
 * run `npm test`" becomes a command verification the completion gate can
 * actually check; vague wording stays unstructured (conservative legacy
 * behavior) instead of inventing proof semantics.
 */
export function parseRequirementVerification(text: string): InstructionVerification | undefined {
  // Explicit backticked command: the most precise form.
  const backtick = /`([^`]+)`/.exec(text);
  if (backtick?.[1]) return { type: 'command', command: backtick[1].trim() };

  // Common concrete runner commands named inline.
  const runner =
    /\b((?:npm|pnpm|yarn|bun)\s+(?:test|run\s+[\w:@/.-]+)|(?:pytest|python\s+-m\s+pytest|go\s+test|cargo\s+test|vitest|jest|node\s+--test)(?:\s+[\w:@/.=-]+)*)\b/i.exec(
      text,
    );
  if (runner?.[1]) return { type: 'command', command: runner[1].trim() };

  // A test-suite demand without a concrete command: any passing test/command
  // evidence after the instruction's epoch qualifies (still far stronger than
  // "any successful action").
  if (/\b(?:full\s+)?(?:test\s+suite|tests|test\s+run)\b/i.test(text)) return { type: 'command' };
  return undefined;
}

export function classifyFollowUp(message: string, hasImages = false): FollowUpClassificationResult {
  const trimmed = message.trim();
  const lower = trimmed.toLowerCase();
  const targetHints = extractTargetHints(message);
  const extractedInstructions = extractInstructionsFromFollowUp(message);

  // 1. Image reference
  if (hasImages || VISUAL_PATTERNS.some((p) => p.test(trimmed))) {
    return {
      kind: 'VISUAL_REFERENCE',
      confidence: 'high',
      goalDelta: trimmed,
      extractedInstructions,
      targetHints,
    };
  }

  // 2. Pure continuation
  if (CONTINUE_PATTERNS.some((p) => p.test(trimmed)) && trimmed.length < 60) {
    return {
      kind: 'CONTINUE',
      confidence: 'high',
      extractedInstructions: [],
      targetHints: { files: [], symbols: [], errors: [] },
    };
  }

  // 2b. Live status/progress question: preserve the engineering goal and
  // instruction epoch. The raw message still rides in conversation so the
  // model can answer it on the next turn.
  if (isNonMutatingStatusQuestion(trimmed)) {
    return {
      kind: 'CONTINUE',
      confidence: 'high',
      extractedInstructions: [],
      targetHints: { files: [], symbols: [], errors: [] },
    };
  }

  // 3. New Task
  if (NEW_TASK_PATTERNS.some((p) => p.test(trimmed))) {
    return {
      kind: 'NEW_TASK',
      confidence: 'high',
      goalDelta: trimmed,
      extractedInstructions,
      targetHints,
    };
  }

  // 4. Correction
  if (CORRECT_PATTERNS.some((p) => p.test(trimmed))) {
    return {
      kind: 'CORRECT',
      confidence: 'high',
      goalDelta: trimmed,
      extractedInstructions,
      targetHints,
      supersedePreviousHypothesis: true,
    };
  }

  // 5. Constrain
  if (CONSTRAIN_PATTERNS.some((p) => p.test(trimmed))) {
    return {
      kind: 'CONSTRAIN',
      confidence: 'high',
      goalDelta: trimmed,
      extractedInstructions,
      targetHints,
    };
  }

  // 6. Extend
  if (EXTEND_PATTERNS.some((p) => p.test(trimmed))) {
    return {
      kind: 'EXTEND',
      confidence: 'high',
      goalDelta: trimmed,
      extractedInstructions,
      targetHints,
    };
  }

  // 7. Default to Refine
  return {
    kind: 'REFINE',
    confidence: 'medium',
    goalDelta: trimmed,
    extractedInstructions,
    targetHints,
  };
}

export function applyFollowUpToLedger(
  ledger: TaskLedger,
  rawMessage: string,
  hasImages = false,
  imagePaths: string[] = [],
): FollowUpRecord {
  const classification = classifyFollowUp(rawMessage, hasImages || imagePaths.length > 0);

  // Update target hints
  ledger.setTargetHints(classification.targetHints);

  const addedInstructions: string[] = [];
  const supersededInstructions: string[] = [];

  // A meaningful authority change (correction, refinement, constraint, scope
  // extension, or a new binding visual) bumps the instruction epoch BEFORE the
  // new instructions are stamped, so they carry the epoch they became active
  // in. Specialist results launched under an older epoch become stale history,
  // not current direction.
  const epochBumping =
    classification.extractedInstructions.length > 0 ||
    classification.kind === 'CORRECT' ||
    classification.kind === 'CONSTRAIN' ||
    classification.kind === 'EXTEND' ||
    classification.kind === 'REFINE' ||
    classification.kind === 'VISUAL_REFERENCE';
  if (epochBumping) {
    ledger.bumpInstructionEpoch(`follow-up ${classification.kind}: "${rawMessage.slice(0, 120)}"`);
  }

  // If correction or constraint, add extracted instructions
  for (const inst of classification.extractedInstructions) {
    const created = ledger.addInstruction(inst);
    addedInstructions.push(created.id);
  }

  // If correction, invalidate previous hypothesis and supersede conflicting
  // authority (instructions and plan steps targeting the negated area). The
  // instructions this same message just added are exempt — a user may negate
  // an area and re-state a constraint in one breath.
  if (classification.supersedePreviousHypothesis) {
    ledger.data.currentHypothesis = undefined;
    supersededInstructions.push(...supersedeConflictingAuthority(ledger, rawMessage, addedInstructions));
  }

  // Update goal delta if relevant
  if (classification.goalDelta && classification.kind !== 'CONTINUE') {
    if (classification.kind === 'CORRECT' || classification.kind === 'REFINE' || classification.kind === 'EXTEND') {
      ledger.setCurrentGoal(classification.goalDelta, `Follow-up ${classification.kind}`);
    }
  }

  // Register image references if provided. Durable paths (persisted under
  // .hermes/task-assets/) are deduped so re-runs carrying the same asset do
  // not pile up duplicate active references.
  const knownPaths = new Set(ledger.activeVisualReferences().map((v) => v.path));
  for (const imgPath of imagePaths) {
    if (knownPaths.has(imgPath)) continue;
    knownPaths.add(imgPath);
    const vref = ledger.addVisualReference({
      path: imgPath,
      kind: 'user-reference',
      status: 'active',
      pinned: true,
    });
    addedInstructions.push(`vref:${vref.id}`);
  }

  // Record follow-up entry
  return ledger.recordFollowUp({
    kind: classification.kind,
    rawMessage,
    extractedGoalDelta: classification.goalDelta,
    addedInstructions,
    supersededInstructions,
  });
}

export interface InstructionGateFinding {
  /** Completion-type requirements whose proof has not been produced since
   *  they were issued. */
  unmetRequirements: string[];
  /** True when the latest action was blocked by the instruction policy and no compliant action followed. */
  denialUnrecovered: boolean;
}

interface GateAction {
  tool?: string;
  status: string;
  createdAt: string;
  observation?: string;
}

interface GateEvidence {
  kind: string;
  command?: string;
  passed: boolean;
  createdAt: string;
  stale?: boolean;
}

function commandMatches(required: string, actual: string | undefined): boolean {
  if (!actual) return false;
  const a = actual.trim().toLowerCase();
  const b = required.trim().toLowerCase();
  return a === b || a.startsWith(b) || a.includes(b);
}

/**
 * Instruction-aware completion gate. A task may not conclude while:
 *  - a completion-type requirement lacks the proof its verification semantics
 *    demand, produced AFTER the instruction was issued ("must run `npm test`"
 *    needs a passing `npm test` evidence record, not a read_file); or
 *  - the most recent action was a blocked instruction violation with no
 *    compliant action after it.
 * Hard constraints are enforced at execution time, so the only completion-time
 * check they need is the unrecovered-denial case.
 */
export function evaluateInstructionGate(
  instructions: { text: string; enforcement: string; status: string; createdAt: string; verification?: { type: string; command?: string } }[],
  actions: GateAction[],
  evidence: GateEvidence[] = [],
): InstructionGateFinding {
  const findings: InstructionGateFinding = { unmetRequirements: [], denialUnrecovered: false };

  for (const inst of instructions) {
    if (inst.status !== 'active' || inst.enforcement !== 'completion') continue;

    const verification = inst.verification;
    if (verification?.type === 'command') {
      const matching = evidence.some(
        (e) =>
          e.passed &&
          !e.stale &&
          e.createdAt > inst.createdAt &&
          ['test', 'command', 'build', 'lint', 'typecheck'].includes(e.kind) &&
          (verification.command ? commandMatches(verification.command, e.command) : true),
      );
      if (!matching) findings.unmetRequirements.push(inst.text);
      continue;
    }
    if (verification?.type === 'file_change') {
      if (!actions.some((a) => a.status === 'success' && ['write_file', 'apply_edit'].includes(a.tool ?? '') && a.createdAt > inst.createdAt)) {
        findings.unmetRequirements.push(inst.text);
      }
      continue;
    }
    if (verification?.type === 'browser' || verification?.type === 'visual') {
      if (!actions.some((a) => a.status === 'success' && ['browse', 'screenshot'].includes(a.tool ?? '') && a.createdAt > inst.createdAt)) {
        findings.unmetRequirements.push(inst.text);
      }
      continue;
    }
    if (verification?.type === 'specialist') {
      if (!actions.some((a) => a.status === 'success' && (a.tool ?? '').startsWith('delegate') && a.createdAt > inst.createdAt)) {
        findings.unmetRequirements.push(inst.text);
      }
      continue;
    }
    if (verification?.type === 'user_approval') {
      // Never auto-satisfiable: the user must approve explicitly.
      findings.unmetRequirements.push(inst.text);
      continue;
    }

    // Legacy requirement (no structured verification): any successful action
    // after issuance counts as work toward it.
    const workedAfter = actions.some((a) => a.status === 'success' && a.createdAt > inst.createdAt);
    if (!workedAfter) findings.unmetRequirements.push(inst.text);
  }

  let lastDeniedAt: string | undefined;
  for (const a of actions) {
    if (a.status === 'denied' && (a.observation ?? '').includes('user instruction policy')) lastDeniedAt = a.createdAt;
  }
  if (lastDeniedAt) {
    findings.denialUnrecovered = !actions.some((a) => a.status === 'success' && a.createdAt > lastDeniedAt);
  }

  return findings;
}

/**
 * CORRECT-follow-up supersession: when a correction negates an area ("backend
 * is fine", "not the backend", "instead of the backend"), the instructions and
 * plan steps that targeted that area become superseded history. Instructions
 * added by the SAME correction message are excluded — the user may negate an
 * area and simultaneously re-state a constraint. Returns the ids of superseded
 * instructions.
 */
export function supersedeConflictingAuthority(ledger: TaskLedger, correctionText: string, excludeIds: string[] = []): string[] {
  const negated = new Set<string>();
  const fine = /([a-z][\w-]*)\s+is\s+(?:fine|good|correct|ok)\b/gi;
  const notThe = /\bnot\s+(?:the\s+)?([a-z][\w-]*)/gi;
  const instead = /\b(?:instead of|rather than)\s+(?:the\s+)?([a-z][\w-]*)/gi;
  for (const re of [fine, notThe, instead]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(correctionText)) !== null) {
      const token = m[1]!.toLowerCase();
      if (!['the', 'a', 'an', 'this', 'that', 'it', 'is', 'was'].includes(token)) negated.add(token);
    }
  }
  if (negated.size === 0) return [];

  // Conventional module roots a negated noun may stand for ("backend" covers
  // server/, "database" covers migrations/ ...).
  const roots = new Set<string>(negated);
  if (negated.has('backend')) ['server', 'api'].forEach((r) => roots.add(r));
  if (negated.has('database') || negated.has('db')) ['migrations', 'prisma', 'schema'].forEach((r) => roots.add(r));

  const textHits = (text: string): boolean => {
    const lower = text.toLowerCase();
    return [...roots].some((r) => lower.includes(r));
  };

  const superseded: string[] = [];
  const excluded = new Set(excludeIds);
  const auth = ledger.ensureTaskAuthority();
  for (const inst of auth.instructions) {
    if (inst.status !== 'active' || excluded.has(inst.id)) continue;
    if (textHits(inst.text) || (inst.constraint?.deny ?? []).some((d) => textHits(d)) || (inst.constraint?.allow ?? []).some((d) => textHits(d))) {
      ledger.supersedeInstruction(inst.id, `Superseded by correction: "${correctionText.slice(0, 120)}"`);
      superseded.push(inst.id);
    }
  }
  for (const step of ledger.data.plan) {
    if (step.status === 'done' || step.status === 'blocked') continue;
    if (textHits(step.description)) {
      step.status = 'blocked';
      if (!step.description.startsWith('[SUPERSEDED]')) step.description = `[SUPERSEDED] ${step.description}`;
    }
  }
  if (superseded.length > 0) ledger.save();
  return superseded;
}

/**
 * Persist user-supplied images for the lifetime of the task under
 * `.hermes/task-assets/<task-id>/` and return their durable repo-relative
 * paths. Session-scoped temp storage dies with the run; these files let
 * visual references survive follow-ups, compaction, and restarts.
 */
export function persistVisualAssets(
  images: { name: string; dataUrl: string }[],
  ledger: TaskLedger,
  repoRoot: string,
  onEvent?: (text: string) => void,
): string[] {
  if (images.length === 0) return [];
  const dir = path.join(repoRoot, '.hermes', 'task-assets', ledger.data.taskId);
  const persisted: string[] = [];
  for (const image of images) {
    const match = /^data:image\/(png|jpeg|jpg|gif|webp);base64,([A-Za-z0-9+/=\r\n]+)$/i.exec(image.dataUrl);
    if (!match?.[2]) {
      onEvent?.(`visual-ref could not decode image ${image.name} — skipping`);
      continue;
    }
    const normalized = match[1]!.toLowerCase();
    const ext = normalized === 'jpeg' || normalized === 'jpg' ? 'jpg' : normalized;
    const refId = shortId('vref');
    const target = path.join(dir, `${refId}.${ext}`);
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(target, Buffer.from(match[2].replace(/\s+/g, ''), 'base64'));
    } catch (err) {
      onEvent?.(`visual-ref could not persist image ${image.name}: ${(err as Error).message}`);
      continue;
    }
    persisted.push(path.relative(repoRoot, target).replace(/\\/g, '/'));
  }
  return persisted;
}
