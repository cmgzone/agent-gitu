'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const {
  EMPTY_MESSAGE,
  changelogEntry,
  escapeHtml,
  newsCard,
  renderChangelogList,
  renderFeedHtml,
  renderNewsList,
  safeUrl,
} = require('../feed-render.cjs');
const { createSupportServer } = require('../support-server.cjs');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const news = JSON.parse(read('news.json'));
const changelog = JSON.parse(read('changelog.json'));
const occurrences = (haystack, needle) => haystack.split(needle).length - 1;

/* --- minimal DOM stand-ins so the browser scripts can be executed under node --- */

function fakeElement() {
  const element = {
    className: '',
    textContent: '',
    alt: '',
    src: '',
    href: '',
    target: '',
    rel: '',
    loading: '',
    decoding: '',
    dateTime: '',
    childNodes: [],
    append(...children) {
      element.childNodes.push(...children);
    },
    setAttribute() {},
    remove() {},
    addEventListener() {},
  };
  return element;
}

function runClientScript(file, hasServerMarkup) {
  const counters = { fetch: 0, replace: 0, watch: 0 };
  const image = fakeElement();
  image.addEventListener = () => {
    counters.watch += 1;
  };
  const container = {
    querySelector: () => (hasServerMarkup ? fakeElement() : null),
    querySelectorAll: () => (hasServerMarkup ? [image] : []),
    replaceChildren: () => {
      counters.replace += 1;
    },
    append: () => {},
  };
  const fragment = fakeElement();
  const sandbox = {
    window: { location: { href: 'https://pikpam.com/' } },
    document: {
      readyState: 'complete',
      getElementById: (id) => (id === 'news-list' || id === 'changelog-list' ? container : null),
      createElement: () => fakeElement(),
      createDocumentFragment: () => {
        fragment.childNodes = [];
        return fragment;
      },
    },
    fetch: () => {
      counters.fetch += 1;
      return Promise.resolve({ ok: true, json: async () => ({ items: [], entries: [] }) });
    },
    Intl,
    URL,
    Date,
    console,
    setTimeout,
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox, { filename: file });
  return counters;
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

/* --- news.html --- */

test('news.html is served with every current story in the HTML', () => {
  const html = renderFeedHtml(read('news.html'), 'news.html');

  assert.ok(news.items.length > 0, 'news.json should contain stories');
  assert.ok(html.includes('<div id="news-list" class="news-grid">'), 'the list container must survive');
  assert.ok(!html.includes('<!--feed:news-list-->'), 'the marker is replaced with rendered entries');
  assert.equal(occurrences(html, 'class="news-card"'), news.items.length);

  for (const item of news.items) {
    assert.ok(html.includes(escapeHtml(item.title)), `title is in the HTML: ${item.title}`);
    assert.ok(html.includes(escapeHtml(item.summary)), `summary is in the HTML: ${item.title}`);
    assert.ok(html.includes(`<span class="news-source">${escapeHtml(item.source)}</span>`), `source is in the HTML: ${item.title}`);
    assert.ok(html.includes(escapeHtml(safeUrl(item.url))), `source link is in the HTML: ${item.title}`);
    assert.ok(
      html.includes(`<time datetime="${escapeHtml(new Date(item.published).toISOString())}">`),
      `publication date is in the HTML: ${item.title}`
    );
  }

  assert.ok(html.includes('class="news-meta"'));
  assert.ok(html.includes('target="_blank" rel="noopener noreferrer"'));
});

test('news.html keeps the marker so a static host still renders the client list', () => {
  const source = read('news.html');
  assert.ok(source.includes('<div id="news-list" class="news-grid"><!--feed:news-list--></div>'));
});

/* --- changelog.html --- */

test('changelog.html is served with every current entry in the HTML', () => {
  const html = renderFeedHtml(read('changelog.html'), 'changelog.html');

  assert.ok(changelog.entries.length > 0, 'changelog.json should contain entries');
  assert.ok(html.includes('<div id="changelog-list" class="changelog-list">'), 'the list container must survive');
  assert.ok(!html.includes('<!--feed:changelog-list-->'), 'the marker is replaced with rendered entries');
  assert.equal(occurrences(html, 'class="changelog-entry"'), changelog.entries.length);

  for (const entry of changelog.entries) {
    assert.ok(html.includes(escapeHtml(entry.title)), `title is in the HTML: ${entry.title}`);
    assert.ok(html.includes(escapeHtml(entry.summary)), `summary is in the HTML: ${entry.title}`);
    assert.ok(html.includes(`<time datetime="${entry.date}">`), `date is in the HTML: ${entry.title}`);
  }

  assert.ok(html.includes('<span class="changelog-tag changelog-tag-news">Digest</span>'), 'the kind is in the HTML');
  assert.ok(html.includes('class="changelog-month"'));
});

/* --- injection safety --- */

test('feed data cannot inject markup or executable links into the news list', () => {
  const items = [
    {
      title: '<script>alert(1)</script>',
      summary: '<img src=x onerror="alert(1)">',
      source: '"><b>source</b>',
      url: 'https://example.com/story',
      image: 'javascript:alert(1)',
      imageAlt: '" onerror="alert(1)',
      published: '2026-11-03T00:00:00Z',
    },
    { title: 'Executable link', url: 'javascript:alert(1)' },
  ];
  const html = renderNewsList({ items });

  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'));
  assert.ok(html.includes('&quot;&gt;&lt;b&gt;source&lt;/b&gt;'));
  assert.ok(!html.includes('<script'));
  assert.ok(!html.includes('<b>source</b>'));
  assert.ok(!html.toLowerCase().includes('javascript:'));
  assert.ok(!html.includes('Executable link'), 'entries without a http(s) link are dropped');
  assert.ok(!html.includes('<img'), 'a javascript: image URL is dropped');
  assert.equal(occurrences(html, 'class="news-card"'), 1);
});

test('feed data cannot inject markup or executable links into the changelog', () => {
  const html = renderChangelogList({
    entries: [
      {
        date: '2026-11-03',
        kind: '"><script>alert(1)</script>',
        title: '</h3><script>alert(1)</script>',
        summary: '<svg onload=alert(1)>',
        link: 'javascript:alert(1)',
        version: '"><script>',
        items: ['<script>alert(1)</script>'],
      },
    ],
  });

  assert.ok(html.includes('&lt;/h3&gt;&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('&lt;svg onload=alert(1)&gt;'));
  assert.ok(!html.includes('<script'));
  assert.ok(!html.includes('<svg'));
  assert.ok(!html.toLowerCase().includes('javascript:'));
  assert.ok(!html.includes('changelog-tag-'), 'unknown kinds add no tag');
  assert.ok(html.includes('<h3>'), 'a title without a http(s) link is still rendered as text');
});

test('links are limited to http(s) and values are escaped', () => {
  assert.equal(safeUrl('javascript:alert(1)'), '');
  assert.equal(safeUrl('data:text/html,<script>alert(1)</script>'), '');
  assert.equal(safeUrl('https://example.com/a?b=1&c=2'), 'https://example.com/a?b=1&c=2');
  assert.equal(safeUrl('news.html'), 'https://pikpam.com/news.html');

  const escaped = escapeHtml('<a href="x">&</a>');
  assert.equal(escaped, '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
  assert.equal(escapeHtml(newsCard({ title: '<b>x</b>', url: 'https://example.com' })).includes('<b>'), false);
});

/* --- the optional editorial "Why it matters" line --- */

test('a story with a why line renders it as escaped text', () => {
  const html = renderNewsList({
    items: [
      {
        title: 'Robot story',
        url: 'https://example.com/robots',
        summary: 'A summary.',
        why: '<script>alert(1)</script>Robots',
      },
    ],
  });

  assert.ok(html.includes('class="news-why"'), 'the why paragraph is rendered');
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;Robots'), 'the why line is escaped');
  assert.ok(
    html.includes('<span class="news-why-label">Why it matters</span> &lt;script&gt;'),
    'the label directly precedes the escaped text'
  );
  assert.ok(!html.includes('Why it matters&lt;script&gt;'), 'the label and sentence are separate words');
  assert.ok(
    html.replace(/<[^>]*>/g, '').includes('Why it matters &lt;script&gt;'),
    'the space is real text, not styling'
  );
  assert.ok(!html.includes('<script'), 'the why line cannot inject markup');
});

test('a story without a why line renders no why block', () => {
  const withMeta = newsCard({
    title: 'Quiet story',
    url: 'https://example.com/quiet',
    summary: 'A summary.',
    source: 'The Verge',
    published: '2026-11-03T00:00:00Z',
  });
  const bare = newsCard({ title: 'Quiet story', url: 'https://example.com/quiet', summary: 'A summary.' });
  const blank = newsCard({ title: 'Quiet story', url: 'https://example.com/quiet', summary: 'A summary.', why: '   ' });

  assert.ok(!withMeta.includes('news-why'), 'a missing why adds no block');
  assert.ok(withMeta.includes('class="news-summary"'), 'the summary is still rendered');
  assert.ok(withMeta.includes('class="news-meta"'), 'the meta line is still rendered');

  /* Absent and whitespace-only why render exactly the markup they rendered before. */
  const unchanged =
    '<article class="news-card"><h2><a href="https://example.com/quiet" target="_blank" rel="noopener noreferrer">Quiet story</a></h2><p class="news-summary">A summary.</p></article>';
  assert.equal(bare, unchanged);
  assert.equal(blank, unchanged);
});

test('an unreadable feed renders the empty state instead of a blank container', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pikpam-feed-'));

  try {
    const newsHtml = renderFeedHtml(read('news.html'), 'news.html', dir);
    assert.ok(newsHtml.includes('<div id="news-list" class="news-grid">'));
    assert.ok(newsHtml.includes(`<p class="news-empty">${EMPTY_MESSAGE.news}</p>`));

    const changelogHtml = renderFeedHtml(read('changelog.html'), 'changelog.html', dir);
    assert.ok(changelogHtml.includes('<div id="changelog-list" class="changelog-list">'));
    assert.ok(changelogHtml.includes(`<p class="changelog-empty">${EMPTY_MESSAGE.changelog}</p>`));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('an empty feed renders the empty state in the list container', () => {
  assert.equal(renderNewsList({ items: [] }), `<p class="news-empty">${EMPTY_MESSAGE.news}</p>`);
  assert.equal(renderChangelogList({ entries: [] }), `<p class="changelog-empty">${EMPTY_MESSAGE.changelog}</p>`);
});

/* --- client script behaviour --- */

test('news.js keeps server-rendered markup and does not fetch a second copy', async () => {
  const counters = runClientScript('news.js', true);
  await tick();

  assert.equal(counters.fetch, 0, 'no second fetch when the list is already rendered');
  assert.equal(counters.replace, 0, 'the server-rendered list is not replaced');
  assert.equal(counters.watch, 1, 'the broken-image fallback still applies to server markup');
});

test('changelog.js keeps server-rendered markup and does not fetch a second copy', async () => {
  const counters = runClientScript('changelog.js', true);
  await tick();

  assert.equal(counters.fetch, 0, 'no second fetch when the changelog is already rendered');
  assert.equal(counters.replace, 0, 'the server-rendered changelog is not replaced');
});

test('the client scripts still render the list when nothing was server-rendered', async () => {
  const newsCounters = runClientScript('news.js', false);
  const changelogCounters = runClientScript('changelog.js', false);
  await tick();

  assert.equal(newsCounters.fetch, 1);
  assert.equal(newsCounters.replace, 1);
  assert.equal(changelogCounters.fetch, 1);
  assert.equal(changelogCounters.replace, 1);
});

/* --- the served pages, end to end --- */

test('support-server serves /news.html and /changelog.html with the entries in raw HTML', async () => {
  const server = createSupportServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    const newsResponse = await fetch(`${base}/news.html`);
    assert.equal(newsResponse.status, 200);
    assert.match(newsResponse.headers.get('content-type') || '', /^text\/html/);
    const newsBody = await newsResponse.text();
    assert.equal(occurrences(newsBody, 'class="news-card"'), news.items.length);
    for (const item of news.items) assert.ok(newsBody.includes(escapeHtml(item.title)), item.title);

    const changelogResponse = await fetch(`${base}/changelog.html`);
    assert.equal(changelogResponse.status, 200);
    assert.match(changelogResponse.headers.get('content-type') || '', /^text\/html/);
    const changelogBody = await changelogResponse.text();
    assert.equal(occurrences(changelogBody, 'class="changelog-entry"'), changelog.entries.length);
    for (const entry of changelog.entries) assert.ok(changelogBody.includes(escapeHtml(entry.title)), entry.title);

    const otherPage = await (await fetch(`${base}/index.html`)).text();
    assert.ok(!otherPage.includes('news-card'), 'other pages are served unchanged');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('the feed pages expose the same DOM contract with JavaScript disabled', () => {
  const html = renderFeedHtml(read('news.html'), 'news.html');
  const card = newsCard(news.items[0]);

  assert.ok(html.includes(card), 'the first card is present without running any script');
  assert.ok(changelogEntry(changelog.entries[0]) !== null);
  assert.ok(renderFeedHtml(read('changelog.html'), 'changelog.html').includes(changelogEntry(changelog.entries[0])));
});
