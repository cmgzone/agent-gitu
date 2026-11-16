import { CodingEventLog } from './event-log.js';
import type { CodingSession, CodingSessionView, CodingRunResult } from './contract.js';
import type { CodingEventPayload } from './events.js';
import type { WorkspaceRef } from './workspace.js';
import type { ToolResult, CompletionReport } from '../types.js';
import { nowIso, shortId } from '../util.js';

export interface PrivateCodingEventSink {
  legacy: (line: string) => void;
  native: (payload: CodingEventPayload) => void;
}

export interface PrivateCodingWorkerUpdate {
  phase?: 'thinking' | 'reasoning' | 'working' | 'tool' | 'responding';
  text?: string;
  messageDone?: boolean;
  reasoning?: string;
  tool?: string;
  toolParams?: Record<string, unknown>;
  toolOk?: boolean;
  toolOutput?: string;
  detail?: string;
}

function workerToolSummary(tool: string, params?: Record<string, unknown>, detail?: string): string {
  const pathVal = typeof params?.['path'] === 'string' ? params['path'].trim() : '';
  if (tool === 'run_command') {
    const cmd = typeof params?.['command'] === 'string' ? params['command'].trim() : String(detail ?? 'command').trim();
    return `$ ${cmd || 'command'}`;
  }
  if (tool === 'read_file') return `read ${pathVal || detail || 'file'}`;
  if (tool === 'write_file' || tool === 'apply_edit') return `write ${pathVal || detail || 'file'}`;
  if (tool === 'list_files') return `list ${pathVal || detail || '.'}`;
  if (tool === 'search_files') {
    const query = typeof params?.['query'] === 'string' ? params['query'] : typeof params?.['pattern'] === 'string' ? params['pattern'] : detail;
    return `search ${String(query ?? 'files').trim()}`;
  }
  if (tool === 'browse') {
    const target = typeof params?.['url'] === 'string' ? params['url'] : typeof params?.['action'] === 'string' ? params['action'] : detail;
    return `browse ${String(target ?? 'page').trim()}`;
  }
  return detail ? `${tool} ${detail}` : tool;
}

/** Forward Cowork coding worker progress updates into the session's CodingEventLog. */
export function createPrivateCodingProgressBridge(emit?: PrivateCodingEventSink): (update: PrivateCodingWorkerUpdate) => void {
  let streamed = '';
  let lastReasoning = '';
  let lastSay = '';
  let activeTool: { tool: string; summary: string } | undefined;
  return (update) => {
    if (!emit || !update) return;
    if (update.reasoning && update.reasoning !== lastReasoning) {
      lastReasoning = update.reasoning;
      emit.native({ type: 'reasoning', text: update.reasoning.slice(-4000) });
    }
    if (update.phase === 'thinking' && update.detail && !update.tool) {
      emit.legacy(`think  ${update.detail}`);
    }
    if (typeof update.text === 'string' && update.text) {
      if (update.messageDone) {
        const clean = update.text.trim();
        streamed = '';
        if (clean && clean !== lastSay) {
          lastSay = clean;
          emit.legacy(`say ${clean}`);
        }
      } else if (update.text.startsWith(streamed)) {
        const delta = update.text.slice(streamed.length);
        if (delta) {
          streamed = update.text;
          emit.legacy(`tdelta ${delta}`);
        }
      } else if (update.text !== streamed) {
        if (streamed.trim() && streamed.trim() !== lastSay) {
          lastSay = streamed.trim();
          emit.legacy(`say ${streamed.trim()}`);
        }
        streamed = update.text;
        emit.legacy(`tdelta ${update.text}`);
      }
    }
    if (update.phase === 'tool' && update.tool) {
      const summary = workerToolSummary(update.tool, update.toolParams, update.detail);
      activeTool = { tool: update.tool, summary };
      emit.legacy(`run      ${summary}`);
      if (update.tool === 'read_file' && typeof update.toolParams?.['path'] === 'string') {
        emit.native({ type: 'file_read', path: update.toolParams['path'] });
      }
      return;
    }
    if (update.toolOk !== undefined && update.tool) {
      const summary = (activeTool?.tool === update.tool ? activeTool.summary : '') || workerToolSummary(update.tool, update.toolParams, update.detail);
      activeTool = undefined;
      emit.legacy(`${update.toolOk ? 'ok       ' : 'error    '}${summary}`);
      if (update.toolOutput) {
        const trimmed = update.toolOutput.trim().slice(-3500).replace(/\r?\n/g, ' ⏎ ');
        if (trimmed) emit.legacy(`out      ${trimmed}`);
      }
      const editedPath = typeof update.toolParams?.['path'] === 'string' ? update.toolParams['path'].trim() : '';
      if (update.toolOk && (update.tool === 'write_file' || update.tool === 'apply_edit') && editedPath) {
        emit.native({ type: 'file_changed', path: editedPath });
      } else if (update.tool === 'run_command') {
        const cmd = typeof update.toolParams?.['command'] === 'string' ? update.toolParams['command'].trim() : summary.replace(/^\$\s+/, '');
        emit.native({ type: 'command_finished', command: cmd, ok: update.toolOk });
      }
    }
  };
}

/** Main-agent ownership around a scoped worker; direct follow-ups keep its computer and permissions. */
export function privateCodingSession(
  goal: string,
  workspace: WorkspaceRef,
  execute: (signal: AbortSignal, instruction?: string, emit?: PrivateCodingEventSink) => Promise<ToolResult>,
  model?: {provider?:string;model?:string}|(()=>{provider?:string;model?:string}),
): CodingSession {
  const id=shortId('run'),log=new CodingEventLog(),pending:string[]=[];
  const emitSink: PrivateCodingEventSink = {
    legacy: (line) => log.publishLegacy(line),
    native: (payload) => log.publishNative(payload),
  };
  let abort=new AbortController(),started=false;
  let state:CodingSessionView={id,goal,workspace,...(typeof model==='function'?model():model),status:'running',startedAt:nowIso()};
  const result=():CodingRunResult=>({sessionId:id,status:state.status,report:state.report,error:state.error});
  const run=async(instruction:string):Promise<CodingRunResult>=>{
    state={...state,status:'running',report:undefined,error:undefined,finishedAt:undefined};
    log.publishNative({type:'run_started',goal:instruction,workspace:workspace.type==='host'?workspace.path:'/workspace · private computer'});
    log.publishLegacy('think  running coding task on assigned computer');
    try{
      let work:ToolResult;
      for(;;){
        state={...state,...(typeof model==='function'?model():model)};
        work=await execute(abort.signal,instruction,emitSink);
        if(abort.signal.aborted)return result();
        if(pending.length)instruction=goal+'\n\nPrevious coding result:\n'+work.output.slice(-12000)+'\n\nDirect owner follow-up:\n'+pending.splice(0).join('\n\n');
        else break;
      }
      const report:CompletionReport={executionReportOnly:true,taskId:id,goal,status:work.ok?'complete':'blocked',summary:work.output,changes:[],filesChanged:[],verification:[],evidence:[],remainingRisks:[],followUps:[],generatedAt:nowIso()};
      state={...state,status:work.ok?'completed':'blocked',report,finishedAt:nowIso(),error:work.ok?undefined:work.output};
      if (work.output.trim()) log.publishLegacy(`say ${work.output.trim()}`);
      log.publishNative(work.ok?{type:'completed',summary:work.output}:{type:'failed',reason:work.output});
    }catch(error){if(!abort.signal.aborted){state={...state,status:'failed',error:(error as Error).message,finishedAt:nowIso()};log.publishNative({type:'failed',reason:state.error!});}}
    return result();
  };
  return{
    id,getState:()=>({...state}),events:since=>log.events(since),subscribe:listener=>log.subscribe(listener),
    async run(){if(started)throw Error('This private coding task has already started.');started=true;if(abort.signal.aborted)return result();return run(goal);},
    async continue(message){
      if(started&&state.status==='running'){pending.push(message);log.publishLegacy(`user-msg ${message}`);log.publishLegacy('note     Direct owner instruction queued for the coding worker.');return result();}
      started=true;abort=new AbortController();log.publishLegacy(`user-msg ${message}`);return run(goal+'\n\nDirect owner follow-up:\n'+message);
    },
    async cancel(reason='Stopped by user.'){
      if(state.finishedAt)return;
      pending.length=0;state={...state,status:'blocked',error:reason,finishedAt:nowIso()};abort.abort(new Error(reason));log.publishNative({type:'failed',reason});
    },
    releasePendingGates(){},approve(){},approvePlan(){},answerQuestions(){},
  };
}
