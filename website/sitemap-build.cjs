'use strict';

/*
 * Pure sitemap serializer.
 *
 * Every value is passed in by the caller: this module performs no file reads and
 * no writes, so the exact output can be tested with plain objects. `build.cjs`
 * owns the page table and the feed-date lookups; this module only renders them.
 *
 * pages: ordered array of { file, changefreq, priority, lastmod }. `file` is the
 * page filename ('index.html' becomes the site root). `lastmod` may be omitted
 * for pages whose date comes from a feed file.
 */

const xmlEscape = (value) =>
  String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

const locPath = (file) => (file === 'index.html' ? '/' : '/' + file);

function sitemapXml({ origin = '', updated = '', pages = [], newsUpdated, changelogUpdated } = {}) {
  const urls = pages.map(({ file, changefreq, priority, lastmod }) => {
    const feedDate = file === 'news.html' ? newsUpdated : file === 'changelog.html' ? changelogUpdated : undefined;
    const date = feedDate || lastmod || updated;
    return `  <url><loc>${xmlEscape(origin + locPath(file))}</loc><lastmod>${date}</lastmod><changefreq>${changefreq}</changefreq><priority>${Number(priority).toFixed(1)}</priority></url>`;
  });

  return ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', ...urls, '</urlset>', ''].join('\n');
}

module.exports = { sitemapXml };
