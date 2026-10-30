/* AI news digest renderer. Plain browser JavaScript: no dependencies, no build
   step. Every value from news.json is rendered with createElement/textContent so
   feed data can never inject HTML. */
(() => {
  'use strict';
  const LIST_ID = 'news-list';
  const SOURCE = 'news.json';
  const EMPTY_MESSAGE = 'The first digest is on its way.';

  const text = (value) => (typeof value === 'string' ? value.trim() : '');
  const dateFormatter = (() => {
    try {
      return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
      return null;
    }
  })();

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

  function formatDate(value) {
    const raw = text(value);
    if (!raw) return null;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return null;
    return { label: dateFormatter ? dateFormatter.format(date) : date.toISOString().slice(0, 10), iso: date.toISOString() };
  }

  function metaLine(item) {
    const meta = document.createElement('p');
    meta.className = 'news-meta';
    const source = text(item.source);
    const published = formatDate(item.published ?? item.date);
    if (source) {
      const sourceLabel = document.createElement('span');
      sourceLabel.className = 'news-source';
      sourceLabel.textContent = source;
      meta.append(sourceLabel);
    }
    if (source && published) {
      const separator = document.createElement('span');
      separator.setAttribute('aria-hidden', 'true');
      separator.textContent = '·';
      meta.append(separator);
    }
    if (published) {
      const time = document.createElement('time');
      time.dateTime = published.iso;
      time.textContent = published.label;
      meta.append(time);
    }
    return meta.childNodes.length ? meta : null;
  }

  function card(item) {
    if (!item || typeof item !== 'object') return null;
    const title = text(item.title);
    const href = safeUrl(item.url);
    if (!title || !href) return null;

    const article = document.createElement('article');
    article.className = 'news-card';

    const image = safeUrl(item.image);
    if (image) {
      const img = document.createElement('img');
      img.className = 'news-card-image';
      img.src = image;
      img.alt = text(item.imageAlt);
      img.loading = 'lazy';
      img.decoding = 'async';
      /* A missing or unreachable image is dropped instead of leaving a broken frame. */
      img.addEventListener('error', () => img.remove(), { once: true });
      article.append(img);
    }

    const heading = document.createElement('h2');
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.textContent = title;
    heading.append(anchor);
    article.append(heading);

    const summary = text(item.summary);
    if (summary) {
      const paragraph = document.createElement('p');
      paragraph.className = 'news-summary';
      paragraph.textContent = summary;
      article.append(paragraph);
    }

    const meta = metaLine(item);
    if (meta) article.append(meta);
    return article;
  }

  function render(container, items) {
    container.replaceChildren();
    const fragment = document.createDocumentFragment();
    for (const item of Array.isArray(items) ? items : []) {
      const element = card(item);
      if (element) fragment.append(element);
    }
    if (!fragment.childNodes.length) {
      const empty = document.createElement('p');
      empty.className = 'news-empty';
      empty.textContent = EMPTY_MESSAGE;
      container.append(empty);
      return;
    }
    container.append(fragment);
  }

  async function load(container) {
    try {
      const response = await fetch(SOURCE, { cache: 'no-store' });
      if (!response.ok) throw new Error('News feed unavailable');
      const payload = await response.json();
      render(container, payload && payload.items);
    } catch {
      /* A failed feed keeps the page calm instead of logging an error. */
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
