import type { TaskLedger } from '../ledger/task-ledger.js';
import { nowIso, sha256 } from '../util.js';
import type { AskUserQuestion } from './recovery-synthesizer.js';

/** Preserve the decision across compaction/restarts without resolving any
 * permission gate. Changed goals or choices produce a different signature. */
export async function answerQuestionsOnce(
  ledger: TaskLedger,
  scope: string,
  questions: AskUserQuestion[],
  ask: (questions: AskUserQuestion[]) => Promise<string>,
): Promise<{ answer: string; reused: boolean }> {
  const signature = sha256(JSON.stringify([scope, questions.map(q => [q.kind ?? '', q.question.trim(), q.options])]));
  const previous = ledger.data.answeredQuestions?.find(q => q.signature === signature);
  if (previous) return { answer: previous.answer, reused: true };
  const answer = await ask(questions);
  // An unanswered/timed-out gate is not a durable user decision.
  if (answer.trim() && !/\(no answer|timed out|proceed (?:on|with).*defaults/i.test(answer)) {
    ledger.data.answeredQuestions = [...(ledger.data.answeredQuestions ?? []).slice(-31), { signature, scope, answer, createdAt: nowIso() }];
    ledger.save();
  }
  return { answer, reused: false };
}
