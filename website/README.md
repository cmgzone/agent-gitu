# Agent Gitu marketing website

A static, blue-and-black site for `https://pikpam.com`. No browser framework, package installation, analytics, cookies, or external font requests are required.

From the repository root:

```sh
npm run website:build
npm run website:preview
```

The local preview opens at `http://127.0.0.1:8931`. Edit copy in `website/build.cjs`, domain settings in `website/site.config.json`, and presentation in `styles.css` / `script.js`. Rebuild after changing copy or settings. Generated HTML is committed so any static host can serve it directly.

## Hosting

Publish the contents of `website/` as the public root on your static host. The root must contain `index.html`, all other HTML pages, `styles.css`, `script.js`, `assets/`, `robots.txt`, and `sitemap.xml`. The `CNAME` and `.nojekyll` files support GitHub Pages; other hosts can ignore them. The generator, configuration, and this README do not need to be included in the deployed files.

Configure the host for `pikpam.com`, enable HTTPS, and redirect alternate hosts (including `www`) to that canonical domain. Use `404.html` for unknown routes with an HTTP 404 response. This repository change does not alter DNS or publish the site.

Each of the nine content pages includes unique titles and descriptions, canonical URLs, social preview metadata, and JSON-LD. Home includes SoftwareApplication and visible FAQ markup; the product note includes Article markup. Submit `https://pikpam.com/sitemap.xml` after publication. SEO metadata prepares pages for crawling; it does not guarantee rankings.

## Artwork and motion

`assets/gitu-cowork.png`, `gitu-coding.png`, and `gitu-connections.png` are the user's original dark-theme Windows app screenshots supplied on October 10. Optimized JPEG copies are used on the homepage, product gallery, Cowork, Coding, and Connections pages. The display frame hides the Windows taskbar with CSS; the underlying screenshots are unchanged. Visitors can open the complete images. The gallery switches between real screenshots and does not simulate a live agent.

`assets/gitu-signal.png` is original AI-generated editorial artwork; its optimized JPEG is used on the product note. App screenshots appear without borders or window frames, with CSS edge fades that blend into the page. Floating screenshots, quiet widget illustrations, and context flow use CSS motion, with reduced-motion preferences and a pause control. Illustrative widget counts are labeled as examples and never read an actual mailbox.

Download buttons open GitHub Releases rather than assuming a particular release asset has been published. Product copy reflects the source implementation and documents the runtime requirements for background work.
