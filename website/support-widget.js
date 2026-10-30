'use strict';
/* Pikpam support chat widget (dependency-free, load-safe). */
(function (window, document) {
  if (!window || !document) return;
  if (window.PikpamSupportWidget && window.PikpamSupportWidget.loaded) return;
  if (window.__pikpamSupportWidgetLoaded) return;
  window.__pikpamSupportWidgetLoaded = true;
  var ENDPOINT = '/api/support', NET_ERR = 'We could not reach support right now. Please try again in a moment.', UNAVAILABLE = 'Support is temporarily unavailable. Please try again later.';
  var FIELDS = [
    {name:'name',label:'Your name',type:'text',required:true,autocomplete:'name'}, {name:'email',label:'Email address',type:'email',required:true,autocomplete:'email'},
    {name:'productOrPage',label:'Pikpam product or page affected',type:'text',required:true,placeholder:'e.g. pikpam.com downloads'},
    {name:'problem',label:'What went wrong?',type:'textarea',required:true,placeholder:'Describe the problem in a sentence or two'},
    {name:'whenStarted',label:'When did it start?',type:'text',required:false,placeholder:'e.g. today, 10 minutes ago'},
    {name:'reproductionDetails',label:'Steps to reproduce (optional)',type:'textarea',required:false,placeholder:'What you clicked, the browser you use, any error text'}
  ];
  var CSS = [
  '.pikpam-support-launcher{position:fixed;right:20px;bottom:20px;z-index:2147483000;border:0;border-radius:999px;padding:12px 18px;background:#111827;color:#fff;font:600 14px/1.2 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;cursor:pointer;box-shadow:0 10px 24px rgba(15,23,42,.28)}',
  '.pikpam-support-launcher:hover{background:#1f2937}',
  '.pikpam-support-panel{position:fixed;right:20px;bottom:84px;z-index:2147483000;width:min(360px,calc(100vw - 40px));max-height:min(560px,calc(100vh - 120px));overflow:auto;background:#fff;color:#111827;border-radius:14px;box-shadow:0 24px 60px rgba(15,23,42,.3);font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:16px}',
  '.pikpam-support-panel[hidden]{display:none}',
  '.pikpam-support-title{margin:0 0 4px;font-size:16px;font-weight:700}',
  '.pikpam-support-hint{margin:0 0 12px;font-size:12px;color:#4b5563}',
  '.pikpam-support-field{display:block;margin-bottom:10px}',
  '.pikpam-support-label{display:block;font-size:12px;font-weight:600;margin-bottom:4px}',
  '.pikpam-support-input,.pikpam-support-textarea{width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:8px;padding:8px 10px;font:inherit;background:#fff;color:#111827}',
  '.pikpam-support-textarea{min-height:64px;resize:vertical}',
  '.pikpam-support-input:focus,.pikpam-support-textarea:focus{outline:2px solid #111827;outline-offset:1px}',
  '.pikpam-support-submit{position:sticky;bottom:0;width:100%;border:0;border-radius:8px;padding:10px 12px;background:#111827;color:#fff;font:600 14px/1.2 inherit;cursor:pointer;box-shadow:0 -6px 12px rgba(255,255,255,.9)}',
  '.pikpam-support-submit[disabled]{opacity:.6;cursor:progress}',
  '.pikpam-support-status{margin-top:10px;font-size:13px;min-height:18px}',
  '.pikpam-support-status[data-state=success]{color:#047857}',
  '.pikpam-support-status[data-state=error]{color:#b91c1c}',
  '.pikpam-support-status[data-state=info]{color:#4b5563}'
  ].join('');
  function el(t, a, x) {
    var n = document.createElement(t);
    if (a) Object.keys(a).forEach(function (k) { if (k === 'class') n.className = a[k]; else if (k === 'text') n.textContent = a[k]; else n.setAttribute(k, a[k]); });
    if (x) n.textContent = x;
    return n;
  }
  (document.head || document.documentElement).appendChild(el('style', {id:'pikpam-support-styles', text:CSS}));
  var lc = el('button', {type:'button',class:'pikpam-support-launcher','aria-expanded':'false','aria-controls':'pikpam-support-panel'}, 'Pikpam Support');
  var pn = el('div', {id:'pikpam-support-panel',class:'pikpam-support-panel',role:'dialog','aria-label':'Pikpam support',hidden:'hidden'});
  pn.append(el('p', {class:'pikpam-support-title'}, 'Pikpam Support'), el('p', {class:'pikpam-support-hint'}, 'Tell us what is broken on the website or in a Pikpam service. Do not include passwords, keys or codes.'));
  var form = el('form', {novalidate:'novalidate'}), ins = {};
  FIELDS.forEach(function (f) {
    var area = f.type === 'textarea';
    var w = el('label', {class:'pikpam-support-field'});
    w.appendChild(el('span', {class:'pikpam-support-label'}, f.label));
    var i = el(area ? 'textarea' : 'input', {class: area ? 'pikpam-support-textarea' : 'pikpam-support-input', name:f.name, type: area ? undefined : f.type, autocomplete:f.autocomplete, placeholder:f.placeholder, 'aria-label':f.label});
    if (f.required) i.setAttribute('required', 'required'); else i.removeAttribute('required');
    ins[f.name] = i;
    w.appendChild(i);
    form.appendChild(w);
  });
  var sb = el('button', {type:'submit',class:'pikpam-support-submit'}, 'Send to support'), st = el('div', {class:'pikpam-support-status',role:'status','aria-live':'polite'});
  form.append(sb, st);
  pn.appendChild(form);
  document.body.append(lc, pn);
  function setStatus(m, s) { st.textContent = m || ''; if (s) st.setAttribute('data-state', s); else st.removeAttribute('data-state'); }
  function setBusy(b) { sb.disabled = !!b; sb.textContent = b ? 'Sending…' : 'Send to support'; }
  function open() { pn.hidden = false; lc.setAttribute('aria-expanded', 'true'); if (ins.name && typeof ins.name.focus === 'function') { try { ins.name.focus(); } catch (e) {} } }
  function close() { pn.hidden = true; lc.setAttribute('aria-expanded', 'false'); }
  function handleResponse(d, hs) {
    var m = d && d.message;
    if (hs === 200 && d && d.ok) {
      setStatus('Thanks — your report reached Pikpam support. Ticket ' + (d.ticketId || '') + '.', 'success');
      FIELDS.forEach(function (f) { if (ins[f.name]) ins[f.name].value = ''; });
      return;
    }
    if (hs === 503 || (d && d.code === 'temporarily_unavailable')) { setStatus(m || UNAVAILABLE, 'error'); return; }
    if (hs === 429) { setStatus(m || 'Too many requests. Please try again shortly.', 'error'); return; }
    setStatus(m || 'Please check the form and try again.', 'error');
  }
  lc.addEventListener('click', function () { if (pn.hidden) open(); else close(); });
  pn.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var pl = {};
    Object.keys(ins).forEach(function (k) { pl[k] = ins[k].value; });
    if (!pl.name || !pl.email || !pl.productOrPage || !pl.problem) { setStatus('Please fill in your name, email, the affected page and the problem.', 'error'); return; }
    setStatus('Sending…', 'info');
    setBusy(true);
    function finish() { setBusy(false); }
    if (typeof window.fetch !== 'function') { setStatus(UNAVAILABLE, 'error'); finish(); return; }
    try {
      window.fetch(ENDPOINT, {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(pl)}).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) { handleResponse(d, r.status); });
      }).catch(function () {
        setStatus(NET_ERR, 'error');
      }).then(finish, finish);
    } catch (err) {
      setStatus(NET_ERR, 'error');
      finish();
    }
  });
  window.PikpamSupportWidget = {loaded:true, open:open, close:close, endpoint:ENDPOINT};
})(typeof window !== 'undefined' ? window : null, typeof document !== 'undefined' ? document : null);
