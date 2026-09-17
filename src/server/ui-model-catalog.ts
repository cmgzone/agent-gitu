// All model selectors consume the resolved /api/models snapshot through these
// helpers. Provider IDs remain opaque: never infer ownership from a model name.
export const UI_MODEL_CATALOG_JS = String.raw`
  var modelCatalogPending = null;
  var modelCatalogGeneration = 0;
  function loadModelCatalog(force) {
    if (modelCatalogPending && !force) return modelCatalogPending;
    var generation = ++modelCatalogGeneration;
    var pending = api('/api/models').then(function (data) {
      if (generation !== modelCatalogGeneration) return modelCatalogPending || S.models;
      if (!data || !Array.isArray(data.providers)) throw new Error('Invalid model catalog');
      S.models = data.providers;
      S.modelsLoaded = true;
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
