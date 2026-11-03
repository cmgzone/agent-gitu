'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { sitemapXml } = require('../sitemap-build.cjs');

/* The ordered page table mirrors the one build.cjs owns. news.html and
   changelog.html intentionally carry no table lastmod: their dates come from
   the feed files at build time. */
const PAGES = [
  { file: 'index.html', changefreq: 'weekly', priority: 1, lastmod: '2026-10-31' },
  { file: 'cowork.html', changefreq: 'monthly', priority: 0.9, lastmod: '2026-10-31' },
  { file: 'coding.html', changefreq: 'monthly', priority: 0.9, lastmod: '2026-10-31' },
  { file: 'connections.html', changefreq: 'monthly', priority: 0.8, lastmod: '2026-10-31' },
  { file: 'docs.html', changefreq: 'weekly', priority: 0.8, lastmod: '2026-10-31' },
  { file: 'download.html', changefreq: 'monthly', priority: 0.9, lastmod: '2026-10-31' },
  { file: 'blog.html', changefreq: 'weekly', priority: 0.8, lastmod: '2026-10-31' },
  { file: 'security.html', changefreq: 'monthly', priority: 0.7, lastmod: '2026-10-31' },
  { file: 'quiet-proactivity.html', changefreq: 'monthly', priority: 0.7, lastmod: '2026-10-31' },
  { file: 'news.html', changefreq: 'daily', priority: 0.8 },
  { file: 'changelog.html', changefreq: 'weekly', priority: 0.7 },
];

const ORIGIN = 'https://pikpam.com';
const UPDATED = '2026-10-11';
const locs = (xml) => [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((match) => match[1]);
const urlLines = (xml) => xml.split('\n').filter((line) => line.startsWith('  <url>'));
const lastmodFor = (xml, loc) => {
  const line = urlLines(xml).find((entry) => entry.includes(`<loc>${loc}</loc>`));
  assert.ok(line, `expected a url entry for ${loc}`);
  return line.match(/<lastmod>([^<]*)<\/lastmod>/)[1];
};
const render = (overrides = {}) => sitemapXml({ origin: ORIGIN, updated: UPDATED, pages: PAGES, ...overrides });

test('sitemap-build renders one url entry for every row in the page table', () => {
  const xml = render({ newsUpdated: '2026-11-03', changelogUpdated: '2026-11-03' });
  assert.equal(urlLines(xml).length, 11);
});

test('sitemap-build emits the committed document shape', () => {
  const xml = render({ newsUpdated: '2026-11-03', changelogUpdated: '2026-11-03' });
  const lines = xml.split('\n');
  assert.equal(lines[0], '<?xml version="1.0" encoding="UTF-8"?>');
  assert.equal(lines[1], '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
  assert.equal(lines.length, 15); // 2 header lines + 11 urls + </urlset> + empty tail
  assert.equal(lines[13], '</urlset>');
  assert.equal(lines[14], '');
  assert.ok(xml.endsWith('</urlset>\n'), 'output must end with </urlset> and a trailing newline');
  for (const line of urlLines(xml)) {
    assert.match(
      line,
      /^ {2}<url><loc>[^<]*<\/loc><lastmod>[^<]*<\/lastmod><changefreq>[^<]*<\/changefreq><priority>\d\.\d<\/priority><\/url>$/,
    );
  }
});

test('sitemap-build keeps the loc set and order of the page table', () => {
  const xml = render({ newsUpdated: '2026-11-03', changelogUpdated: '2026-11-03' });
  assert.deepEqual(locs(xml), [
    'https://pikpam.com/',
    'https://pikpam.com/cowork.html',
    'https://pikpam.com/coding.html',
    'https://pikpam.com/connections.html',
    'https://pikpam.com/docs.html',
    'https://pikpam.com/download.html',
    'https://pikpam.com/blog.html',
    'https://pikpam.com/security.html',
    'https://pikpam.com/quiet-proactivity.html',
    'https://pikpam.com/news.html',
    'https://pikpam.com/changelog.html',
  ]);
});

test('sitemap-build renders priority with one decimal, including 1.0', () => {
  const xml = render({ newsUpdated: '2026-11-03', changelogUpdated: '2026-11-03' });
  assert.ok(xml.includes('<priority>1.0</priority>'), 'the home page priority must render as 1.0');
  for (const page of PAGES) {
    const line = urlLines(xml).find((entry) => entry.includes(`${ORIGIN}${page.file === 'index.html' ? '/' : '/' + page.file}<`));
    assert.ok(line.includes(`<priority>${page.priority.toFixed(1)}</priority>`), `unexpected priority for ${page.file}`);
  }
});

test('sitemap-build takes news and changelog lastmod from the passed feed dates', () => {
  const xml = render({ newsUpdated: '2026-11-03', changelogUpdated: '2026-11-04' });
  assert.equal(lastmodFor(xml, 'https://pikpam.com/news.html'), '2026-11-03');
  assert.equal(lastmodFor(xml, 'https://pikpam.com/changelog.html'), '2026-11-04');
  // Both differ from `updated`, so the feed dates are demonstrably the source.
  assert.notEqual(lastmodFor(xml, 'https://pikpam.com/news.html'), UPDATED);
  assert.notEqual(lastmodFor(xml, 'https://pikpam.com/changelog.html'), UPDATED);
  // The other nine pages keep their table dates.
  assert.equal(lastmodFor(xml, 'https://pikpam.com/docs.html'), '2026-10-31');
  assert.equal(lastmodFor(xml, 'https://pikpam.com/security.html'), '2026-10-31');
});

test('sitemap-build falls back to the config date when a feed date is missing', () => {
  for (const overrides of [{}, { newsUpdated: undefined, changelogUpdated: undefined }, { newsUpdated: '', changelogUpdated: null }]) {
    const xml = render(overrides);
    assert.equal(lastmodFor(xml, 'https://pikpam.com/news.html'), UPDATED);
    assert.equal(lastmodFor(xml, 'https://pikpam.com/changelog.html'), UPDATED);
  }
});

test('sitemap-build escapes XML special characters in the loc value', () => {
  const xml = sitemapXml({
    origin: 'https://example.com/?a=1&b=2<>"\'',
    updated: UPDATED,
    pages: [{ file: 'index.html', changefreq: 'weekly', priority: 1, lastmod: '2026-10-31' }],
  });
  const [loc] = locs(xml);
  assert.equal(loc, 'https://example.com/?a=1&amp;b=2&lt;&gt;&quot;&#39;/');
  assert.ok(!/[<>"']/.test(loc), 'no raw XML special characters may survive escaping');
});

test('sitemap-build does not touch the filesystem', () => {
  // The module only exports the renderer, so the caller owns all I/O.
  assert.deepEqual(Object.keys(require('../sitemap-build.cjs')), ['sitemapXml']);
});
