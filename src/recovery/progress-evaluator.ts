import type {
  OutcomeEvaluation,
  OutcomeVerdict,
  ProblemState,
  RepairSurface,
} from './problem-state.js';
import { sha256 } from '../util.js';

export interface ActionOutcomeInput {
  tool: string;
  params?: Record<string, unknown>;
  reason?: string;
  expected?: string;
  stepId?: string;
  toolOk: boolean;
  output: string;
  exitCode?: number;
  errorSignature?: string;
}

export class ProgressEvaluator {
  evaluate(input: ActionOutcomeInput, activeProblem?: ProblemState): OutcomeEvaluation {
    const output = input.output || '';
    const expected = (input.expected || '').trim();
    const reason = (input.reason || '').trim();

    // 1. Check for verification against an active problem's contradiction
    if (activeProblem) {
      const isMutation = input.tool === 'write_file' || input.tool === 'apply_edit';
      if (!isMutation && input.toolOk && (input.exitCode === undefined || input.exitCode === 0)) {
        const canVerify =
          activeProblem.status === 'verifying' ||
          (expected && this.matchesExpected(expected, output)) ||
          (input.tool === 'run_command' && input.stepId && activeProblem.blockedStepIds.includes(input.stepId));

        if (canVerify) {
          const contract = activeProblem.verificationContract;
          const resolved = !contract || this.isContradictionResolved(input, contract.originalObserved);
          if (resolved) {
            return {
              verdict: 'expected_achieved',
              isBlocking: false,
              explanation: `Verified: Original problem (${activeProblem.id}) contradiction is resolved. Expected state achieved.`,
            };
          }
        }
      }
    }

    // 2. Detect contradictions even when tool execution succeeded (toolOk = true)
    const contradiction = this.detectContradiction(input);
    if (contradiction) {
      return {
        verdict: 'contradiction',
        isBlocking: contradiction.isBlocking,
        explanation: `Contradiction detected: expected "${contradiction.expected}" but observed "${contradiction.observed}".`,
        detectedContradiction: contradiction,
      };
    }

    // 3. Tool failure without specific contradiction pattern
    if (!input.toolOk || (input.exitCode !== undefined && input.exitCode !== 0)) {
      const summary = output.split('\n').filter(Boolean).slice(-3).join(' ').slice(0, 200);
      const isBlocking = Boolean(input.stepId || /fail|error|fatal|crash/i.test(output));
      return {
        verdict: isBlocking ? 'blocker' : 'contradiction',
        isBlocking,
        explanation: `Tool execution failed with exit code ${input.exitCode ?? 'err'}: ${summary || 'error'}`,
        detectedContradiction: {
          expected: expected || 'Command/action completes successfully',
          observed: summary || 'Non-zero exit code or error output',
          fingerprint: sha256(`${input.tool}:${input.errorSignature || summary}`),
          likelySurface: this.inferSurfaceFromError(output),
          isBlocking,
        },
      };
    }

    // 4. Check if expected outcome was explicitly achieved
    if (expected && this.matchesExpected(expected, output)) {
      return {
        verdict: 'expected_achieved',
        isBlocking: false,
        explanation: `Expected outcome achieved: ${expected}`,
      };
    }

    // 5. Default: progress or neutral
    const isProgress = input.tool === 'write_file' || input.tool === 'apply_edit' || input.tool === 'connection_operation';
    return {
      verdict: isProgress ? 'progress' : 'neutral',
      isBlocking: false,
      explanation: isProgress ? 'State mutated toward expected goal' : 'Action executed without contradiction',
    };
  }

  private detectContradiction(input: ActionOutcomeInput) {
    const text = input.output || '';
    const expected = (input.expected || '').toLowerCase();
    const reason = (input.reason || '').toLowerCase();
    const intentWantsSuccess = !expected || /success|200|json|api|auth|work|ok|valid|pass|register|login|health|data|endpoint/i.test(expected + ' ' + reason);

    // Pattern A: Routing mismatch — API route returns frontend HTML fallback (SPA routing gap)
    const isApiRequest = /api\/|\/health|\/v1\//i.test(JSON.stringify(input.params || {}) + ' ' + text);
    const returnsHtml = /<!doctype html>|<html[\s>]/i.test(text);
    if (isApiRequest && returnsHtml) {
      return {
        expected: input.expected || 'API JSON endpoint response',
        observed: 'Received HTML document instead of API response (likely SPA fallback / routing proxy misconfiguration)',
        fingerprint: sha256(`spa-routing-fallback:${input.tool}`),
        likelySurface: 'deployment' as RepairSurface,
        isBlocking: true,
      };
    }

    // Pattern B: HTTP Protocol method / routing rejection (e.g. 405 Method Not Allowed, 404 Not Found, 502/503/500)
    const httpErrorMatch = text.match(/\b(405\s+Method\s+Not\s+Allowed|404\s+Not\s+Found|500\s+Internal\s+Server\s+Error|502\s+Bad\s+Gateway|503\s+Service\s+Unavailable|401\s+Unauthorized|403\s+Forbidden)\b/i) ||
      text.match(/\bstatus(?:\s*code)?\s*[:=]\s*(405|404|500|502|503|401|403)\b/i) ||
      text.match(/HTTP\/\d(?:\.\d)?\s+(405|404|500|502|503|401|403)/i);

    if (httpErrorMatch && intentWantsSuccess) {
      const errCode = httpErrorMatch[1] || httpErrorMatch[0];
      return {
        expected: input.expected || 'HTTP 2xx / successful response',
        observed: `HTTP error response: ${errCode}`,
        fingerprint: sha256(`http-err:${errCode}:${input.tool}`),
        likelySurface: /405|502|503/.test(errCode) ? ('deployment' as RepairSurface) : ('repository' as RepairSurface),
        isBlocking: true,
      };
    }

    // Pattern C: Connection refused / network reachability
    const connRefusedMatch = text.match(/\b(ECONNREFUSED|ENOTFOUND|Connection\s+refused|ETIMEDOUT|NetworkError)\b/i);
    if (connRefusedMatch) {
      return {
        expected: input.expected || 'Service reachable',
        observed: `Network connection failed: ${connRefusedMatch[0]}`,
        fingerprint: sha256(`conn-refused:${connRefusedMatch[0]}`),
        likelySurface: 'local_runtime' as RepairSurface,
        isBlocking: true,
      };
    }

    // Pattern D: Browser UI explicitly showing error state (login/auth/submission failed)
    if (input.tool === 'browse') {
      const uiErrorMatch = text.match(/(invalid\s+credentials|login\s+failed|error:\s*405|failed\s+to\s+fetch|internal\s+server\s+error|unauthorized)/i);
      if (uiErrorMatch && intentWantsSuccess) {
        return {
          expected: input.expected || 'User action / navigation succeeds',
          observed: `UI displayed error: ${uiErrorMatch[0]}`,
          fingerprint: sha256(`browser-ui-error:${uiErrorMatch[0]}`),
          likelySurface: 'repository' as RepairSurface,
          isBlocking: true,
        };
      }
    }

    // Pattern E: Explicit negative assertions in test/command output
    if (/\b(AssertionError|FAIL|failed:\s*\d+|tests?\s+failed)\b/i.test(text) && intentWantsSuccess) {
      return {
        expected: input.expected || 'Assertions pass',
        observed: 'Assertion or test suite failure',
        fingerprint: sha256(`assertion-fail:${text.slice(0, 100)}`),
        likelySurface: 'repository' as RepairSurface,
        isBlocking: true,
      };
    }

    return undefined;
  }

  private isContradictionResolved(input: ActionOutcomeInput, originalObserved: string): boolean {
    if (!input.toolOk || (input.exitCode !== undefined && input.exitCode !== 0)) {
      return false;
    }
    const text = input.output || '';
    // If output still contains contradiction markers
    if (this.detectContradiction(input)) {
      return false;
    }
    // If original observed contained a specific error like 405 or HTML and it's completely gone
    if (/405|404|500|502|html/i.test(originalObserved)) {
      const stillHasError = /405|500|502/i.test(text) || (/html/i.test(originalObserved) && /<!doctype html>/i.test(text));
      return !stillHasError;
    }
    return true;
  }

  private matchesExpected(expected: string, output: string): boolean {
    const exp = expected.toLowerCase();
    const out = output.toLowerCase();
    return out.includes(exp) || (exp.includes('200') && out.includes('200')) || (exp.includes('success') && !out.includes('error'));
  }

  private inferSurfaceFromError(output: string): RepairSurface {
    const lower = output.toLowerCase();
    if (lower.includes('docker') || lower.includes('container') || lower.includes('proxy') || lower.includes('nginx') || lower.includes('coolify')) {
      return 'deployment';
    }
    if (lower.includes('postgres') || lower.includes('sqlite') || lower.includes('prisma') || lower.includes('migration') || lower.includes('database')) {
      return 'database';
    }
    if (lower.includes('econnrefused') || lower.includes('port') || lower.includes('process')) {
      return 'local_runtime';
    }
    if (lower.includes('connection') || lower.includes('credential') || lower.includes('auth header')) {
      return 'connection';
    }
    return 'repository';
  }
}
