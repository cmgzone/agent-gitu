'use strict';
/* Server-side rendering for the two feed pages (news.html, changelog.html).

   support-server.cjs renders the list into the page while serving the request, by
   replacing the <!--feed:...--> marker that sits inside the list container. The
   served markup therefore always matches the news.json / changelog.json on disk at
   that moment: the daily digest job can rewrite both JSON files without any rebuild
   step that could leave stale HTML behind. When a page is served by something other
   than support-server.cjs (for example a plain file server), the marker is left in
   place and news.js / changelog.js fill the container exactly as before.

   Every value that comes from a feed is HTML-escaped, and every link is restricted
   to http(s). These are the same rules used by build.cjs (esc) and by news.js /
   changelog.js (createElement + textContent), so feed data can never inject markup
   or script. */

const fs = require('node:fs');
const path = require('node:path');

const NEWS_MARKER = '<!--feed:news-list-->';
const CHANGELOG_MARKER = '<!--feed:changelog-list-->';
const EMPTY_MESSAGE = {
  news: 'The first digest is on its way.',
  changelog: 'The first changes will be recorded here shortly.',
};
const KINDS = { release: 'Release', website: 'Website', news: 'Digest' };

/* Same escaping rules as build.cjs. */
const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

const text = (value) => (typeof value === 'string' ? value.trim() : '');

/* Only absolute http(s) URLs survive: javascript:, data: and malformed values are
   dropped, so a feed entry can never become an executable link. */
function safeUrl(value) {
  const raw = text(value);
  if (!raw) return '';
  let url;
  try {
    url = new URL(raw, 'https://pikpam.com/');
  } catch {
    return '';
  }
  return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
}

function parseDate(value) {
  const raw = text(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

const NEWS_DATE = new Intl.DateTimeFormat('en-GB', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
const CHANGELOG_DAY = new Intl.DateTimeFormat('en-GB', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
const CHANGELOG_MONTH = new Intl.DateTimeFormat('en-GB', { year: 'numeric', month: 'long', timeZone: 'UTC' });

/* Mirrors the card that news.js builds, so server markup and client markup share
   the same DOM contract and styling. */
function newsCard(item) {
  if (!item || typeof item !== 'object') return null;
  const title = text(item.title);
  const href = safeUrl(item.url);
  if (!title || !href) return null;

  const parts = ['<article class="news-card">'];
  const image = safeUrl(item.image);
  if (image) {
    parts.push(`<img class="news-card-image" src="${escapeHtml(image)}" alt="${escapeHtml(text(item.imageAlt))}" loading="lazy" decoding="async">`);
  }
  parts.push(`<h2><a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(title)}</a></h2>`);

  const summary = text(item.summary);
  if (summary) parts.push(`<p class="news-summary">${escapeHtml(summary)}</p>`);

  const why = text(item.why);
  if (why) parts.push(`<p class="news-why"><span class="news-why-label">Why it matters</span> ${escapeHtml(why)}</p>`);

  const source = text(item.source);
  const published = parseDate(item.published ?? item.date);
  if (source || published) {
    const meta = [];
    if (source) meta.push(`<span class="news-source">${escapeHtml(source)}</span>`);
    if (source && published) meta.push('<span aria-hidden="true">·</span>');
    if (published) meta.push(`<time datetime="${escapeHtml(published.toISOString())}">${escapeHtml(NEWS_DATE.format(published))}</time>`);
    parts.push(`<p class="news-meta">${meta.join('')}</p>`);
  }

  parts.push('</article>');
  return parts.join('');
}

/* Mirrors the entry that changelog.js builds. */
function changelogEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const title = text(entry.title);
  if (!title) return null;

  const parts = ['<article class="changelog-entry">'];
  const head = [];
  const kind = text(entry.kind).toLowerCase();
  if (KINDS[kind]) head.push(`<span class="changelog-tag changelog-tag-${kind}">${escapeHtml(KINDS[kind])}</span>`);
  const when = parseDate(entry.date);
  if (when) head.push(`<time datetime="${escapeHtml(when.toISOString().slice(0, 10))}">${escapeHtml(CHANGELOG_DAY.format(when))}</time>`);
  const version = text(entry.version);
  if (version) head.push(`<span class="changelog-version">${escapeHtml(version)}</span>`);
  if (head.length) parts.push(`<div class="changelog-head">${head.join('')}</div>`);

  const href = safeUrl(entry.link);
  parts.push(
    href
      ? `<h3><a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(title)}</a></h3>`
      : `<h3>${escapeHtml(title)}</h3>`
  );

  const summary = text(entry.summary);
  if (summary) parts.push(`<p class="changelog-summary">${escapeHtml(summary)}</p>`);

  const items = Array.isArray(entry.items) ? entry.items.map(text).filter(Boolean) : [];
  if (items.length) {
    parts.push(`<ul class="changelog-items">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`);
  }

  parts.push('</article>');
  return parts.join('');
}

function renderNewsList(payload) {
  const items = Array.isArray(payload && payload.items) ? payload.items : [];
  const cards = items.map(newsCard).filter(Boolean);
  return cards.length ? cards.join('') : `<p class="news-empty">${escapeHtml(EMPTY_MESSAGE.news)}</p>`;
}

function renderChangelogList(payload) {
  const entries = Array.isArray(payload && payload.entries) ? payload.entries : [];
  const blocks = [];
  let monthSeen = '';
  for (const entry of entries) {
    const card = changelogEntry(entry);
    if (!card) continue;
    const when = parseDate(entry.date);
    const key = when ? CHANGELOG_MONTH.format(when) : '';
    if (key && key !== monthSeen) {
      monthSeen = key;
      blocks.push(`<h2 class="changelog-month">${escapeHtml(key)}</h2>`);
    }
    blocks.push(card);
  }
  return blocks.length ? blocks.join('') : `<p class="changelog-empty">${escapeHtml(EMPTY_MESSAGE.changelog)}</p>`;
}

function readFeed(dir, file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  } catch {
    return null;
  }
}

/* Replaces the list marker in a page with the rendered feed. Pages without a marker,
   and an unreadable feed (which renders the empty state), never produce a blank or
   broken container. */
function renderFeedHtml(html, fileName, dir = __dirname) {
  if (fileName === 'news.html') return html.replace(NEWS_MARKER, () => renderNewsList(readFeed(dir, 'news.json')));
  if (fileName === 'changelog.html') return html.replace(CHANGELOG_MARKER, () => renderChangelogList(readFeed(dir, 'changelog.json')));
  return html;
}

module.exports = {
  CHANGELOG_MARKER,
  EMPTY_MESSAGE,
  NEWS_MARKER,
  changelogEntry,
  escapeHtml,
  newsCard,
  readFeed,
  renderChangelogList,
  renderFeedHtml,
  renderNewsList,
  safeUrl,
};
