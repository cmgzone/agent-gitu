// All model selectors consume the resolved /api/models snapshot through these
// helpers. Provider IDs remain opaque: never infer ownership from a model name.
export const UI_MODEL_CATALOG_JS = String.raw`
  var modelCatalogPending = null;
  var modelCatalogGeneration = 0;
  var modelCatalogLoadedAt = 0;
  var modelSelectionQueue=Promise.resolve(),modelChoiceRevision=0;
  function applyRuntimeSelection(value){
    if(!value||!value.updatedAt||S.savedSelectionAt===value.updatedAt)return;
    S.savedSelectionAt=value.updatedAt;
    if(value.provider&&value.model){S.sel.model=value.provider+'::'+value.model;var active=S.sessions&&S.sessions[S.active];if(active)active.modelOverride=true;var select=$('model');if(select)select.value=S.sel.model;syncModelLabel();updateModelMeta();}
    if(value.projectPath){S.settings.projectPath=value.projectPath;S.lastProjectPath=value.projectPath;}
    persist();
  }
  function rememberModelSelection(value,projectPath){
    var split=String(value||'').indexOf('::'),body={};
    if(split>0){body.provider=value.slice(0,split);body.model=value.slice(split+2);}
    if(projectPath)body.projectPath=projectPath;
    if(!body.provider&&!body.projectPath)return;
    modelChoiceRevision++;
    modelSelectionQueue=modelSelectionQueue.catch(function(){}).then(function(){return api('/api/model-selection',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});}).then(function(value){S.savedSelectionAt=value.updatedAt;return value;}).catch(function(error){toast('Could not save the selected model/project: '+error.message,true);});
    return modelSelectionQueue;
  }
  function loadModelCatalog(force) {
    if (modelCatalogPending && !force) return modelCatalogPending;
    if (!force && S.modelsLoaded && Date.now() - modelCatalogLoadedAt < 30000) return Promise.resolve(S.models);
    var generation = ++modelCatalogGeneration;
    var selectionRevision=modelChoiceRevision;
    var pending = api('/api/models').then(function (data) {
      if (generation !== modelCatalogGeneration) return modelCatalogPending || S.models;
      if (!data || !Array.isArray(data.providers)) throw new Error('Invalid model catalog');
      S.models = data.providers;
      if(selectionRevision===modelChoiceRevision)applyRuntimeSelection(data.selection);
      S.modelsLoaded = true;
      modelCatalogLoadedAt = Date.now();
      ensureUsableModelSelection();
      var select = $('model');
      if (select) { select.innerHTML = modelOptionsHtml(); select.value = S.sel.model; }
      syncModelLabel();
      updateModelMeta();
      var pick = $('modelPick');
      if (pick) pick.disabled = !hasAnyProviderKey();
      var specialist = $('agModel');
      if (specialist) {
        var selected = specialist.value;
        specialist.innerHTML = '<option value="">(default model)</option>' + catalogSelectOptions(undefined, selected);
      }
      if(!S.selectionTimer&&typeof setInterval==='function')S.selectionTimer=setInterval(function(){if(typeof document!=='undefined'&&document.hidden)return;var revision=modelChoiceRevision;api('/api/model-selection').then(function(value){if(revision===modelChoiceRevision)applyRuntimeSelection(value);}).catch(function(){});},8000);
      return S.models;
    }).finally(function () {
      if (generation === modelCatalogGeneration) modelCatalogPending = null;
    });
    modelCatalogPending = pending;
    return pending;
  }
  function catalogModelGroups(providerId, query, usableOnly) {
    var q = String(query || '').toLowerCase().trim();
    return (S.models || []).filter(function (p) {
      return (providerId === undefined || p.id === providerId) && (!usableOnly || providerIsUsable(p));
    }).map(function (p) {
      return { p: p, models: (p.models || []).filter(function (m) {
        return !q || modelSearchText(p, m).indexOf(q) >= 0;
      }) };
    }).filter(function (g) { return g.models.length > 0; });
  }
  function catalogSelectOptions(providerId, selected, query) {
    return catalogModelGroups(providerId, query).map(function (g) {
      var options = g.models.map(function (m) {
        var value = providerId === undefined ? g.p.id + '::' + m.id : m.id;
        return '<option value="' + esc(value) + '"' + (value === selected ? ' selected' : '') + '>' + esc(m.id) + (m.vision ? ' ◉' : '') + (m.free ? ' (free)' : '') + '</option>';
      }).join('');
      return providerId === undefined ? '<optgroup label="' + esc(g.p.label || g.p.id) + (providerIsUsable(g.p) ? '' : ' (needs setup)') + '">' + options + '</optgroup>' : options;
    }).join('');
  }
`;
