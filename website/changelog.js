/* Changelog renderer. Plain browser JavaScript: no dependencies, no build step.
   Every value from changelog.json is rendered with createElement/textContent so
   feed data can never inject HTML. */
(() => {
  'use strict';
  const LIST_ID = 'changelog-list';
  const SOURCE = 'changelog.json';
  const EMPTY_MESSAGE = 'The first changes will be recorded here shortly.';
  const KINDS = { release: 'Release', website: 'Website', news: 'Digest' };

  const text = (value) => (typeof value === 'string' ? value.trim() : '');
  const dayFmt = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  const monthFmt = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'long' });

  function safeUrl(value) {
    const raw = text(value);
    if (!raw) return '';
    try {
      const url = new URL(raw, window.location.href);
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
    } catch {
      return '';
    }
  }

  function parseDate(value) {
    const raw = text(value);
    if (!raw) return null;
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function entryCard(entry) {
    if (!entry || typeof entry !== 'object') return null;
    const title = text(entry.title);
    if (!title) return null;
    const article = document.createElement('article');
    article.className = 'changelog-entry';

    const head = document.createElement('div');
    head.className = 'changelog-head';
    const kind = text(entry.kind).toLowerCase();
    if (KINDS[kind]) {
      const tag = document.createElement('span');
      tag.className = 'changelog-tag changelog-tag-' + kind;
      tag.textContent = KINDS[kind];
      head.append(tag);
    }
    const when = parseDate(entry.date);
    if (when) {
      const time = document.createElement('time');
      time.dateTime = when.toISOString().slice(0, 10);
      time.textContent = dayFmt.format(when);
      head.append(time);
    }
    const version = text(entry.version);
    if (version) {
      const badge = document.createElement('span');
      badge.className = 'changelog-version';
      badge.textContent = version;
      head.append(badge);
    }
    if (head.childNodes.length) article.append(head);

    const heading = document.createElement('h3');
    const href = safeUrl(entry.link);
    if (href) {
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.textContent = title;
      if (/^https?:/i.test(href)) {
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
      }
      heading.append(anchor);
    } else {
      heading.textContent = title;
    }
    article.append(heading);

    const summary = text(entry.summary);
    if (summary) {
      const paragraph = document.createElement('p');
      paragraph.className = 'changelog-summary';
      paragraph.textContent = summary;
      article.append(paragraph);
    }

    const items = Array.isArray(entry.items) ? entry.items.filter((i) => text(i)) : [];
    if (items.length) {
      const list = document.createElement('ul');
      list.className = 'changelog-items';
      for (const item of items) {
        const li = document.createElement('li');
        li.textContent = text(item);
        list.append(li);
      }
      article.append(list);
    }
    return article;
  }

  function render(container, entries) {
    container.replaceChildren();
    const fragment = document.createDocumentFragment();
    let monthSeen = '';
    for (const entry of Array.isArray(entries) ? entries : []) {
      const card = entryCard(entry);
      if (!card) continue;
      const when = parseDate(entry.date);
      const key = when ? monthFmt.format(when) : '';
      if (key && key !== monthSeen) {
        monthSeen = key;
        const heading = document.createElement('h2');
        heading.className = 'changelog-month';
        heading.textContent = key;
        fragment.append(heading);
      }
      fragment.append(card);
    }
    if (!fragment.childNodes.length) {
      const empty = document.createElement('p');
      empty.className = 'changelog-empty';
      empty.textContent = EMPTY_MESSAGE;
      container.append(empty);
      return;
    }
    container.append(fragment);
  }

  async function load(container) {
    try {
      const response = await fetch(SOURCE, { cache: 'no-store' });
      if (!response.ok) throw new Error('Changelog unavailable');
      const payload = await response.json();
      render(container, payload && payload.entries);
    } catch {
      render(container, []);
    }
  }

  function start() {
    const container = document.getElementById(LIST_ID);
    if (!container) return;
    void load(container);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
