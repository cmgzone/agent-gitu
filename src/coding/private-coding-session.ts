import { CodingEventLog } from './event-log.js';
import type { CodingSession, CodingSessionView, CodingRunResult } from './contract.js';
import type { WorkspaceRef } from './workspace.js';
import type { ToolResult, CompletionReport } from '../types.js';
import { nowIso, shortId } from '../util.js';

/** Main-agent ownership around a scoped worker; direct follow-ups keep its computer and permissions. */
export function privateCodingSession(goal: string, workspace: WorkspaceRef, execute: (signal: AbortSignal, instruction?: string) => Promise<ToolResult>, model?: {provider?:string;model?:string}|(()=>{provider?:string;model?:string})): CodingSession {
  const id=shortId('run'),log=new CodingEventLog(),pending:string[]=[];
  let abort=new AbortController(),started=false;
  let state:CodingSessionView={id,goal,workspace,...(typeof model==='function'?model():model),status:'running',startedAt:nowIso()};
  const result=():CodingRunResult=>({sessionId:id,status:state.status,report:state.report,error:state.error});
  const run=async(instruction:string):Promise<CodingRunResult>=>{
    state={...state,status:'running',report:undefined,error:undefined,finishedAt:undefined};
    log.publishNative({type:'run_started',goal:instruction,workspace:workspace.type==='host'?workspace.path:'/workspace · private computer'});
    log.publishLegacy('Main Agent Gitu owns this task; implementation runs in its permission-scoped computer worker.');
    try{
      let work:ToolResult;
      for(;;){
        state={...state,...(typeof model==='function'?model():model)};
        work=await execute(abort.signal,instruction);
        if(abort.signal.aborted)return result();
        if(pending.length)instruction=goal+'\n\nPrevious coding result:\n'+work.output.slice(-12000)+'\n\nDirect owner follow-up:\n'+pending.splice(0).join('\n\n');
        else break;
      }
      const report:CompletionReport={executionReportOnly:true,taskId:id,goal,status:work.ok?'complete':'blocked',summary:work.output,changes:[],filesChanged:[],verification:[],evidence:[],remainingRisks:[],followUps:[],generatedAt:nowIso()};
      state={...state,status:work.ok?'completed':'blocked',report,finishedAt:nowIso(),error:work.ok?undefined:work.output};
      log.publishLegacy(work.output);
      log.publishNative(work.ok?{type:'completed',summary:work.output}:{type:'failed',reason:work.output});
    }catch(error){if(!abort.signal.aborted){state={...state,status:'failed',error:(error as Error).message,finishedAt:nowIso()};log.publishNative({type:'failed',reason:state.error!});}}
    return result();
  };
  return{
    id,getState:()=>({...state}),events:since=>log.events(since),subscribe:listener=>log.subscribe(listener),
    async run(){if(started)throw Error('This private coding task has already started.');started=true;if(abort.signal.aborted)return result();return run(goal);},
    async continue(message){
      if(started&&state.status==='running'){pending.push(message);log.publishLegacy('Direct owner instruction queued for the coding worker.');return result();}
      started=true;abort=new AbortController();return run(goal+'\n\nDirect owner follow-up:\n'+message);
    },
    async cancel(reason='Stopped by user.'){
      if(state.finishedAt)return;
      pending.length=0;state={...state,status:'blocked',error:reason,finishedAt:nowIso()};abort.abort(new Error(reason));log.publishNative({type:'failed',reason});
    },
    releasePendingGates(){},approve(){},approvePlan(){},answerQuestions(){},
  };
}
