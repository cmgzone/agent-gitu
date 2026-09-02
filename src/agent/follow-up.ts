import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type {
  FollowUpClassificationKind,
  FollowUpRecord,
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

export function extractInstructionsFromFollowUp(message: string): Array<Omit<UserInstruction, 'id' | 'createdAt'>> {
  const instructions: Array<Omit<UserInstruction, 'id' | 'createdAt'>> = [];
  const lines = message.split(/(?<=[.!?])\s+|\n+|;\s*/).map((l) => l.trim().replace(/[.!?]+$/, '')).filter(Boolean);

  for (const line of lines) {
    // Check hard constraint
    if (CONSTRAIN_PATTERNS.some((p) => p.test(line))) {
      instructions.push({
        text: line,
        type: 'constraint',
        enforcement: 'hard',
        status: 'active',
        source: 'follow-up',
      });
      continue;
    }

    // Check correction
    if (CORRECT_PATTERNS.some((p) => p.test(line))) {
      instructions.push({
        text: line,
        type: 'correction',
        enforcement: 'hard',
        status: 'active',
        source: 'follow-up',
      });
      continue;
    }

    // Check requirement
    if (/\b(?:must|ensure|make sure|always|needs to|require)\b/i.test(line)) {
      instructions.push({
        text: line,
        type: 'requirement',
        enforcement: 'completion',
        status: 'active',
        source: 'follow-up',
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

  // If correction or constraint, add extracted instructions
  for (const inst of classification.extractedInstructions) {
    const created = ledger.addInstruction(inst);
    addedInstructions.push(created.id);
  }

  // If correction, invalidate previous hypothesis
  if (classification.supersedePreviousHypothesis) {
    ledger.data.currentHypothesis = undefined;
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
  /** Completion-type requirements with no successful work recorded after they were issued. */
  unmetRequirements: string[];
  /** True when the latest action was blocked by the instruction policy and no compliant action followed. */
  denialUnrecovered: boolean;
}

/**
 * Instruction-aware completion gate: a task may not conclude while a
 * completion-type requirement shows no work since it was issued, or while the
 * most recent action was a blocked instruction violation with no compliant
 * action after it. Hard constraints are enforced at execution time, so the
 * only completion-time check they need is the unrecovered-denial case.
 */
export function evaluateInstructionGate(
  instructions: { text: string; enforcement: string; status: string; createdAt: string }[],
  actions: { status: string; createdAt: string; observation?: string }[],
): InstructionGateFinding {
  const findings: InstructionGateFinding = { unmetRequirements: [], denialUnrecovered: false };

  for (const inst of instructions) {
    if (inst.status !== 'active' || inst.enforcement !== 'completion') continue;
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
