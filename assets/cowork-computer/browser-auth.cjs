/* Host-authored secure form flow. Returned metadata never contains input values. */
exports.createBrowserAuth = function createBrowserAuth(getPage) {
  const challenges = new Map(), secrets = new Set();
  const redact = text => { for (const secret of secrets) if (secret) text = text.split(secret).join('[redacted]'); return text; };
  async function execute(id, p, submit) {
    const page = await getPage(id), url = new URL(page.url());
    if (url.protocol !== 'https:' || url.username || url.password) throw Error('Open the HTTPS website first.');
    for (const [key, value] of challenges) if (value.expiresAt < Date.now()) challenges.delete(key);
    if (!submit) {
      if (!['signin', 'signup', 'verify'].includes(p.mode) || challenges.size >= 32) throw Error('Invalid sign-in request.');
      const challengeId = require('node:crypto').randomBytes(16).toString('hex');
      const form = await page.evaluate(({ challengeId, mode }) => {
        const visible = e => !!(e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
        const candidates = Array.from(document.forms).filter(f => Array.from(f.querySelectorAll('input')).some(e => visible(e) && /^(password|email|text|tel)$/.test(e.type) && !e.disabled));
        const root = candidates.find(f => Array.from(f.querySelectorAll('input[type=password]')).some(visible)) || candidates[0];
        if (!root || root.getAttribute('method')?.toLowerCase() === 'get') throw Error('Open a POST sign-in form.');
        if (!root.getAttribute('method')) root.method = 'post';
        const action = new URL(root.action || location.href, location.href).href;
        if (new URL(action).origin !== location.origin) throw Error('Open the destination website directly.');
        const inputs = Array.from(root.querySelectorAll('input')).filter(e => visible(e) && !e.disabled && !e.readOnly && /^(password|email|text|tel)$/.test(e.type));
        if (!inputs.length || inputs.length > 12) throw Error('Unsupported form.');
        const label = e => (e.labels?.[0]?.innerText || e.getAttribute('aria-label') || e.placeholder || e.name || 'Website field').trim();
        const fields = inputs.map((e, i) => {
          const id = 'f' + i; e.setAttribute('data-gitu-auth-field', challengeId + '-' + id);
          const secret = e.type === 'password' || e.autocomplete === 'one-time-code';
          if (secret) e.style.setProperty('-webkit-text-security', 'disc', 'important');
          return { id, label: label(e).slice(0, 180), type: secret ? 'password' : e.type, sourceType: e.type, required: e.required || secret || e.type === 'email', autocomplete: e.autocomplete || (secret ? mode === 'signup' ? 'new-password' : 'current-password' : '') };
        });
        const terms = Array.from(root.querySelectorAll('input[type=checkbox]')).filter(e => visible(e) && !e.disabled && (e.required || /terms|agree|privacy|consent/i.test(label(e)))).map((e, i) => {
          const id = 't' + i; e.setAttribute('data-gitu-auth-term', challengeId + '-' + id);
          const link = e.labels?.[0]?.querySelector('a[href]');
          return { id, label: label(e).slice(0, 500), required: e.required, ...(link && new URL(link.href).protocol === 'https:' ? { url: link.href } : {}) };
        });
        if (terms.length > 8) throw Error('Unsupported agreements.');
        const button = Array.from(root.querySelectorAll('button,input[type=submit]')).find(e => visible(e) && !e.disabled && (e.type === 'submit' || /sign.?in|log.?in|sign.?up|create|continue|verify|register/i.test(e.innerText || e.value || '')));
        if (!button) throw Error('No submit control.');
        button.setAttribute('data-gitu-auth-submit', challengeId); root.setAttribute('data-gitu-auth-form', challengeId);
        let iconUrl;
        try { const icon = new URL(document.querySelector('link[rel~="icon"]')?.href || '/favicon.ico', location.href); if (icon.origin === location.origin && icon.protocol === 'https:') { icon.search='';icon.hash='';iconUrl=icon.href; } } catch {}
        return { fields, terms, action, iconUrl };
      }, { challengeId, mode: p.mode });
      const expiresAt = Date.now() + 15 * 60 * 1000;
      challenges.set(challengeId, { page, url: page.url(), origin: url.origin, form, expiresAt });
      url.search = ''; url.hash = '';
      return { ok: true, output: JSON.stringify({ challengeId, origin: url.origin, url: url.href, mode: p.mode, expiresAt, iconUrl: form.iconUrl, fields: form.fields, terms: form.terms }) };
    }
    const challenge = challenges.get(p.challengeId);
    if (!challenge || challenge.page !== page || challenge.url !== page.url() || challenge.origin !== url.origin) throw Error('The page changed.');
    const values = p.values, terms = Array.isArray(p.terms) ? p.terms : [];
    if (!values || typeof values !== 'object' || Array.isArray(values) || Object.keys(values).some(key => !challenge.form.fields.some(f => f.id === key))) throw Error('Invalid fields.');
    if (terms.some(key => !challenge.form.terms.some(t => t.id === key)) || challenge.form.terms.some(t => t.required && !terms.includes(t.id))) throw Error('Review required agreements.');
    for (const field of challenge.form.fields) if (typeof values[field.id] !== 'string' || values[field.id].length > 8192 || (field.required && !values[field.id])) throw Error('Complete required fields.');
    const destinationMatches = () => page.evaluate(({ challengeId, action }) => {
      const form = document.querySelector('[data-gitu-auth-form="' + challengeId + '"]');
      return !!form && form.method.toLowerCase() !== 'get' && new URL(form.action || location.href, location.href).href === action && new URL(action).origin === location.origin;
    }, { challengeId: p.challengeId, action: challenge.form.action });
    if (!(await destinationMatches())) throw Error('Destination changed.');
    // Consume before any side effect: an interrupted signup cannot be replayed.
    challenges.delete(p.challengeId);
    try {
      for (const field of challenge.form.fields) {
        if (field.type === 'password' && values[field.id]) { secrets.add(values[field.id]); if (secrets.size > 128) throw Error('Start a fresh browser session.'); }
        const input = page.locator('[data-gitu-auth-field="' + p.challengeId + '-' + field.id + '"]');
        if (!(await input.evaluate((element, sourceType) => element.type === sourceType, field.sourceType))) throw Error('Field changed.');
        await input.fill(values[field.id]);
      }
      for (const term of challenge.form.terms) await page.locator('[data-gitu-auth-term="' + p.challengeId + '-' + term.id + '"]').setChecked(terms.includes(term.id));
      if (page.url() !== challenge.url || !(await destinationMatches())) throw Error('Destination changed.');
      await page.locator('[data-gitu-auth-submit="' + p.challengeId + '"]').click({ timeout: 15000 });
      return { ok: true, output: 'Website form submitted securely. Inspect the browser to verify sign-in or complete the next verification step.' };
    } finally {
      await page.locator('[data-gitu-auth-field^="' + p.challengeId + '-"]').evaluateAll(elements => elements.forEach(e => { e.value = ''; })).catch(() => {});
    }
  }
  return { redact, async execute(id, p, submit) { try { return await execute(id, p, submit); } catch { return { ok: false, output: submit ? 'Secure submission could not be confirmed. Request a fresh card and inspect the browser before retrying.' : 'Open a visible HTTPS sign-in or sign-up form in the agent browser, then request a secure card.' }; } } };
};
