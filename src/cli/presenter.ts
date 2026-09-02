import type { CompletionReport, MemoryEntry, MemoryStatsSnapshot, ProjectLock, TaskLedgerData } from '../types.js';

export interface CliPresenterOptions {
  color?: boolean;
  unicode?: boolean;
  width?: number;
}

interface MemorySearchRow {
  score: number;
  matchReason: 'exact' | 'lexical' | 'semantic';
  claim: string;
  type: string;
  status: string;
  visibility: string;
  confidence: number;
  importance: number;
  provenance?: string;
}

interface RunHeaderInput {
  project: string;
  branch?: string;
  provider: string;
  model: string;
  mode: 'fast' | 'standard';
  goal: string;
  criteriaCount?: number;
}

const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g;

function clean(value: unknown): string {
  return String(value ?? '')
    .replace(CONTROL_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(value: unknown, width: number): string {
  const text = clean(value);
  if (text.length <= width) return text;
  return `${text.slice(0, Math.max(1, width - 1)).trimEnd()}…`;
}

function ratio(done: number, total: number): string {
  return `${done}/${total}`;
}

function latest<T extends { createdAt?: string; updatedAt?: string }>(items: T[]): T | undefined {
  return [...items].sort((a, b) => String(b.updatedAt ?? b.createdAt ?? '').localeCompare(String(a.updatedAt ?? a.createdAt ?? '')))[0];
}

export function createCliPresenter(options: CliPresenterOptions = {}) {
  const color = options.color ?? false;
  const unicode = options.unicode ?? true;
  const width = Math.max(56, Math.min(options.width ?? 96, 120));
  const symbols = unicode
    ? { topLeft: '╭', topRight: '╮', bottomLeft: '╰', bottomRight: '╯', line: '─', vertical: '│', bullet: '•', arrow: '→' }
    : { topLeft: '+', topRight: '+', bottomLeft: '+', bottomRight: '+', line: '-', vertical: '|', bullet: '*', arrow: '->' };
  const ansi = {
    reset: '\u001B[0m',
    dim: '\u001B[2m',
    bold: '\u001B[1m',
    blue: '\u001B[34m',
    green: '\u001B[32m',
    yellow: '\u001B[33m',
    red: '\u001B[31m',
    magenta: '\u001B[35m',
  };
  const paint = (value: string, tone?: keyof typeof ansi): string => (color && tone ? `${ansi[tone]}${value}${ansi.reset}` : value);
  const statusTone = (status: string): keyof typeof ansi => {
    if (['completed', 'complete', 'done', 'success'].includes(status)) return 'green';
    if (['blocked', 'failed', 'error', 'aborted'].includes(status)) return 'red';
    if (['verifying', 'review'].includes(status)) return 'yellow';
    return 'blue';
  };
  const statusSymbol = (status: string): string => {
    const normalized = status.toLowerCase();
    if (['completed', 'complete', 'done', 'success'].includes(normalized)) return unicode ? '✓' : 'OK';
    if (['blocked', 'failed', 'error', 'aborted'].includes(normalized)) return unicode ? '×' : 'X';
    if (['verifying', 'review'].includes(normalized)) return unicode ? '!' : '!';
    if (['executing', 'running', 'planning', 'intake'].includes(normalized)) return unicode ? '›' : '>';
    return unicode ? '·' : '.';
  };
  const status = (value: string): string => paint(`${statusSymbol(value)} ${clean(value).toUpperCase()}`, statusTone(value));

  const frame = (title: string, rows: string[]): string => {
    const inner = width - 4;
    const heading = truncate(title, inner - 2);
    const top = `${symbols.topLeft}${symbols.line.repeat(inner + 2)}${symbols.topRight}`;
    const label = ` ${heading} `;
    const decoratedTop = `${symbols.topLeft}${symbols.line.repeat(2)}${paint(label, 'magenta')}${symbols.line.repeat(Math.max(0, inner - label.length))}${symbols.topRight}`;
    const body = rows.map((row) => `${symbols.vertical} ${truncate(row, inner).padEnd(inner)} ${symbols.vertical}`);
    return [decoratedTop || top, ...body, `${symbols.bottomLeft}${symbols.line.repeat(inner + 2)}${symbols.bottomRight}`].join('\n');
  };

  const section = (title: string, lines: string[]): string => [paint(title.toUpperCase(), 'magenta'), ...lines.map((line) => `  ${symbols.bullet} ${line}`)].join('\n');

  const table = (headers: string[], rows: string[][]): string => {
    const columnLimit = (header: string, index: number): number => {
      if (header === 'ID') return 32;
      if (header === 'STATUS') return 12;
      if (header === 'MODE') return 9;
      if (header === 'UPDATED') return 16;
      if (header === 'CONF.' || header === 'SCORE') return 8;
      if (header === 'SCOPE' || header === 'MATCH') return 12;
      return index === headers.length - 1 ? 58 : 22;
    };
    const maximum = headers.map((header, index) => {
      const requested = Math.max(header.length, ...rows.map((row) => clean(row[index]).length));
      return Math.min(columnLimit(header, index), requested);
    });
    const render = (cells: string[]) => cells.map((cell, index) => truncate(cell, maximum[index]!).padEnd(maximum[index]!)).join('  ');
    return [paint(render(headers), 'dim'), paint(maximum.map((size) => symbols.line.repeat(size)).join('  '), 'dim'), ...rows.map(render)].join('\n');
  };

  const event = (raw: string): string => {
    const normalized = clean(raw);
    const match = /^([a-z-]+)\s+(.*)$/i.exec(normalized);
    const key = match?.[1]?.toLowerCase() ?? 'activity';
    const message = match?.[2] ?? normalized;
    const labels: Record<string, { title: string; tone: keyof typeof ansi }> = {
      project: { title: 'PROJECT', tone: 'blue' },
      criteria: { title: 'CRITERIA', tone: 'blue' },
      context: { title: 'CONTEXT', tone: 'magenta' },
      memory: { title: 'MEMORY', tone: 'magenta' },
      plan: { title: 'PLAN', tone: 'blue' },
      run: { title: 'RUN', tone: 'blue' },
      ok: { title: 'CHECK', tone: 'green' },
      done: { title: 'DONE', tone: 'green' },
      telemetry: { title: 'USAGE', tone: 'dim' },
      learn: { title: 'LEARN', tone: 'magenta' },
      recover: { title: 'RETRY', tone: 'yellow' },
      warn: { title: 'WARNING', tone: 'yellow' },
      blocked: { title: 'BLOCKED', tone: 'red' },
      error: { title: 'ERROR', tone: 'red' },
      stall: { title: 'STALLED', tone: 'red' },
      approval: { title: 'APPROVAL', tone: 'yellow' },
      question: { title: 'QUESTION', tone: 'yellow' },
      findings: { title: 'FINDINGS', tone: 'blue' },
      image: { title: 'IMAGE', tone: 'blue' },
      lsp: { title: 'LSP', tone: 'dim' },
      repair: { title: 'REPAIR', tone: 'dim' },
      protocol: { title: 'PROTOCOL', tone: 'dim' },
    };
    const presentation = labels[key] ?? { title: key.toUpperCase(), tone: 'dim' as const };
    return `${paint(statusSymbol(key), presentation.tone)} ${paint(presentation.title.padEnd(9), presentation.tone)} ${truncate(message, width - 14)}`;
  };

  const runHeader = (input: RunHeaderInput): string =>
    frame('Agent Gitu • Developer run', [
      `${paint('Project', 'dim')}: ${clean(input.project)}${input.branch ? `  ${symbols.bullet} ${clean(input.branch)}` : ''}`,
      `${paint('Model', 'dim')}: ${clean(input.provider)} / ${clean(input.model)}  ${symbols.bullet} ${input.mode === 'fast' ? 'fast path' : 'verified workflow'}`,
      `${paint('Goal', 'dim')}: ${clean(input.goal)}`,
      input.criteriaCount
        ? `${paint('Starting with', 'dim')}: ${input.criteriaCount} acceptance criteri${input.criteriaCount === 1 ? 'on' : 'a'}`
        : 'Gitu will define acceptance criteria before making changes.',
    ]);

  const projectLocked = (project: ProjectLock): string =>
    frame('Project locked', [
      `${paint('Project', 'dim')}: ${project.name}`,
      `${paint('Branch', 'dim')}: ${project.branch ?? '(not a Git repository)'}`,
      `${paint('Stack', 'dim')}: ${project.techStack.join(', ') || 'not detected'}`,
      `${paint('Checks', 'dim')}: test=${project.testCommand ?? '?'}  build=${project.buildCommand ?? '?'}  lint=${project.lintCommand ?? '?'}  typecheck=${project.typecheckCommand ?? '?'}`,
    ]);

  const taskList = (tasks: TaskLedgerData[]): string => {
    const rows = tasks.map((task) => [task.taskId, `${statusSymbol(task.status)} ${task.status}`, task.mode, task.updatedAt.slice(0, 16).replace('T', ' '), task.goal]);
    return `${frame('Tasks', [`${tasks.length} saved task${tasks.length === 1 ? '' : 's'} in this project.`, `Use ${paint('gitu show <task-id>', 'blue')} for a focused task view.`])}\n${table(['ID', 'STATUS', 'MODE', 'UPDATED', 'GOAL'], rows)}`;
  };

  const taskDetails = (task: TaskLedgerData): string => {
    const completedCriteria = task.acceptanceCriteria.filter((criterion) => criterion.satisfied).length;
    const completedPlan = task.plan.filter((step) => step.status === 'done').length;
    const passingEvidence = task.evidence.filter((evidence) => evidence.passed).length;
    const activeStep = task.plan.find((step) => step.status === 'in_progress') ?? task.plan.find((step) => step.status === 'pending');
    const lines = [
      `${status(task.status)}  ${paint('Mode', 'dim')}: ${task.mode}`,
      `${paint('Goal', 'dim')}: ${task.goal}`,
      `${paint('Progress', 'dim')}: ${ratio(completedCriteria, task.acceptanceCriteria.length)} criteria  ${symbols.bullet} ${ratio(completedPlan, task.plan.length)} plan steps  ${symbols.bullet} ${ratio(passingEvidence, task.evidence.length)} passing checks`,
      `${paint('Next', 'dim')}: ${activeStep ? activeStep.description : task.status === 'completed' ? 'Task is complete; review the report or start a follow-up.' : 'No next step recorded yet.'}`,
      `${paint('Project', 'dim')}: ${task.project.name}${task.gitBranch ? `  ${symbols.bullet} ${task.gitBranch}` : ''}`,
    ];
    const sections: string[] = [frame(`Task ${task.taskId}`, lines)];
    if (task.plan.length) {
      sections.push(
        section(
          'Plan',
          task.plan.slice(0, 8).map((step) => `${statusSymbol(step.status)} ${step.description} ${paint(`(${step.verification})`, 'dim')}`),
        ),
      );
    }
    if (task.blockers.length) sections.push(section('Blockers', task.blockers.slice(-4)));
    if (task.filesChanged.length) sections.push(section('Files changed', task.filesChanged.slice(0, 10)));
    if (task.report) sections.push(section('Result', [`${status(task.report.status)} ${task.report.summary}`, `Full report: gitu report ${task.taskId}`]));
    return sections.join('\n\n');
  };

  const memoryList = (entries: MemoryEntry[]): string => {
    const rows = entries.map((entry) => [entry.type, entry.status ?? 'candidate', entry.visibility ?? 'project', `${Math.round(entry.confidence * 100)}%`, entry.claim]);
    return `${frame('Project memory', [`${entries.length} stored memor${entries.length === 1 ? 'y' : 'ies'} for this repository.`, `Search: ${paint('gitu memory search "<query>"', 'blue')}`])}\n${table(['TYPE', 'STATUS', 'SCOPE', 'CONF.', 'MEMORY'], rows)}`;
  };

  const memorySearch = (results: MemorySearchRow[]): string => {
    const rows = results.map((result) => [result.score.toFixed(2), result.matchReason, `${result.type}/${result.status}`, `${Math.round(result.confidence * 100)}%`, result.claim]);
    return `${frame('Memory search', [`${results.length} matching memor${results.length === 1 ? 'y' : 'ies'} ranked by relevance, confidence, importance, recency, and scope.`])}\n${table(['SCORE', 'MATCH', 'TYPE / STATUS', 'CONF.', 'MEMORY'], rows)}`;
  };

  const workspaceStatus = (project: ProjectLock, tasks: TaskLedgerData[], memory: MemoryStatsSnapshot): string => {
    const active = tasks.filter((task) => !['completed', 'failed', 'blocked', 'aborted'].includes(task.status));
    const last = latest(tasks);
    const trustedMemory = (memory.byStatus.verified ?? 0) + (memory.byStatus.durable ?? 0);
    return frame('Developer workspace', [
      `${paint('Project', 'dim')}: ${project.name}${project.branch ? `  ${symbols.bullet} ${project.branch}` : ''}`,
      `${paint('Tasks', 'dim')}: ${tasks.length} total  ${symbols.bullet} ${active.length} active${last ? `  ${symbols.bullet} latest: ${last.taskId} (${last.status})` : ''}`,
      `${paint('Memory', 'dim')}: ${memory.total} entries  ${symbols.bullet} ${memory.retrieved} retrieved in the latest run  ${symbols.bullet} ${trustedMemory} verified or durable`,
      `${paint('Next', 'dim')}: ${active[0] ? `Resume with gitu show ${active[0].taskId}` : 'Start work with gitu run "<goal>"'}`,
    ]);
  };

  const completion = (report: CompletionReport): string => {
    const checks = report.verificationDetails?.filter((item) => item.authority !== 'historical') ?? [];
    const passed = checks.filter((item) => item.passed).length;
    const quality = report.qualityMetrics ? `${Math.round(report.qualityMetrics.score)}/100 outcome quality` : 'outcome quality unavailable';
    return frame('Run complete', [
      `${status(report.status)}  ${paint('Task', 'dim')}: ${report.taskId}`,
      `${paint('Verification', 'dim')}: ${ratio(passed, checks.length)} current checks passed  ${symbols.bullet} ${report.filesChanged.length} file${report.filesChanged.length === 1 ? '' : 's'} changed`,
      `${paint('Quality', 'dim')}: ${quality}`,
      `${paint('Next', 'dim')}: ${report.status === 'complete' ? `Review with gitu report ${report.taskId}` : `Inspect and continue with gitu show ${report.taskId}`}`,
    ]);
  };

  return { completion, event, memoryList, memorySearch, projectLocked, runHeader, status, taskDetails, taskList, workspaceStatus };
}
