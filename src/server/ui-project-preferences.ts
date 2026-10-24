/** Browser-local project presentation and drafts; folders and run identities stay unchanged. */
export const PROJECT_PREFERENCES_JS = String.raw`
  function homeWorkspaceState() {
    var state=S.codeWorkspace;
    if(!state||typeof state!=='object'||Array.isArray(state))state=S.codeWorkspace={};
    ['projects','drafts','followDrafts'].forEach(function(key){if(!state[key]||typeof state[key]!=='object'||Array.isArray(state[key]))state[key]={};});
    return state;
  }
  function homeProjectPreference(path) {
    var value=homeWorkspaceState().projects[homeProjectKey(path)];
    return value&&typeof value==='object'?value:{};
  }
  function homeProjectName(path,fallback) {return String(homeProjectPreference(path).name||fallback||basename(path));}
  function homeUpdateProject(path,change) {
    var state=homeWorkspaceState(),key=homeProjectKey(path),value=Object.assign({},homeProjectPreference(path),change,{path:path});
    state.projects[key]=value;persist();
  }
  function homeWorkspaceSnapshot() {
    var state=homeWorkspaceState(),snapshot={projects:state.projects,drafts:{},followDrafts:{}};
    ['drafts','followDrafts'].forEach(function(area){Object.keys(state[area]).forEach(function(key){
      if(typeof state[area][key]==='string')snapshot[area][key]=credentialChatInput(state[area][key]).safeText;
    });});
    return snapshot;
  }
  function homeCaptureDrafts() {
    var state=homeWorkspaceState(),input=$('goal'),follow=$('follow');
    if(S.active==='home') {
      var key=S.homeDraftKey||homeProjectKey(effectiveProjectPath())||'__default__';
      state.drafts[key]=input?input.value:String(S.draft||'');S.homeDraftKey=key;S.draft=state.drafts[key];
      if(!S.homePendingByProject)S.homePendingByProject={};
      S.homePendingByProject[key]=S.homePendingFiles||[];S.homeDraftActivated=true;
    }
    if(follow&&S.active!=='home'&&S.active!=='cowork')state.followDrafts[S.active]=follow.value;
    persist();
  }
  function homeActivateDraft(path) {
    var state=homeWorkspaceState(),key=homeProjectKey(path)||'__default__';
    if(!S.homeDraftKey) {
      var previous=homeProjectKey(effectiveProjectPath())||'__default__';
      if(!Object.prototype.hasOwnProperty.call(state.drafts,previous))state.drafts[previous]=String(S.draft||'');
    }
    S.homeDraftKey=key;S.draft=String(state.drafts[key]||'');
    if(!S.homePendingByProject)S.homePendingByProject={};
    if(!Object.prototype.hasOwnProperty.call(S.homePendingByProject,key))S.homePendingByProject[key]=!S.homeDraftActivated?(S.homePendingFiles||[]):[];
    S.homePendingFiles=S.homePendingByProject[key];S.homeDraftActivated=true;
    var input=$('goal');if(input){input.value=S.draft;input.style.height='auto';}
    if(input&&typeof renderThumbs==='function')renderThumbs();
  }
  function homeSaveDraft(value) {
    S.draft=value;homeWorkspaceState().drafts[S.homeDraftKey||homeProjectKey(effectiveProjectPath())||'__default__']=value;persist();
  }
  function homeClearStartedDraft(path,sentText) {
    var key=homeProjectKey(path)||'__default__',state=homeWorkspaceState();
    if(String(state.drafts[key]||'').trim()===sentText.trim())state.drafts[key]='';
    if(S.homeDraftKey===key){S.draft=String(state.drafts[key]||'');var input=$('goal');if(input&&S.active==='home')input.value=S.draft;}persist();
  }
  function homeSaveFollowDraft(runId,value) {homeWorkspaceState().followDrafts[runId]=value;persist();}
  function homeRestoreFollowDraft(runId,value) {
    var state=homeWorkspaceState();if(state.followDrafts[runId])return;
    var text=credentialChatInput(value).safeText;state.followDrafts[runId]=text;
    if(S.active===runId&&$('follow')&&!$('follow').value)$('follow').value=text;persist();
  }
`;
