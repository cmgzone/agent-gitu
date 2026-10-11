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

Configure the host for `pikpam.com`, enable HTTPS, and redirect alternate hosts (including `www`) to that canonical domain. Use `404.html` for unknown routes with an HTTP 404 response. The `website` branch owns the site source.

### Coolify

Use the existing `pikpam.com` website application in Coolify. Keep its server and domain, select repository `https://github.com/cmgzone/agent-gitu`, branch `website`, build pack **Dockerfile**, base directory `/website`, Dockerfile location `/Dockerfile`, and internal port `3000`. The five-line Dockerfile copies the committed static files into Nginx; no dependency installation or application runtime is needed. Nginx serves missing paths with `404.html` and HTTP status 404. Port 3000 preserves the existing website application's routing. Deploy and check the homepage, a product page, an image, `robots.txt`, and `sitemap.xml` over HTTPS.

If the domain already points to this Coolify server, its DNS can stay as configured. Enable automatic deployment for pushes to the `website` branch through the existing Git source integration or a repository webhook. Coolify pulls and deploys the branch directly, independently of GitHub Actions billing. [Coolify's Dockerfile deployment guide](https://coolify.io/docs/applications/builds/dockerfile) describes these settings. The application runtime and Windows release remain on `main`.

Each of the nine content pages includes unique titles and descriptions, canonical URLs, social preview metadata, and JSON-LD. Home includes SoftwareApplication and visible FAQ markup; the product note includes Article markup. Submit `https://pikpam.com/sitemap.xml` after publication. SEO metadata prepares pages for crawling; it does not guarantee rankings.

## Artwork and motion

`assets/gitu-cowork.png`, `gitu-coding.png`, and `gitu-connections.png` are the user's original dark-theme Windows app screenshots supplied on October 10. Optimized JPEG copies are used on the homepage, product gallery, Cowork, Coding, and Connections pages. The display frame hides the Windows taskbar with CSS; the underlying screenshots are unchanged. Visitors can open the complete images. The gallery switches between real screenshots and does not simulate a live agent. Screenshot edges blend into the page without decorative window bars or borders.

`assets/gitu-signal.png` is original AI-generated editorial artwork; its optimized JPEG is used on the product note. App screenshots appear without borders or window frames, with CSS edge fades that blend into the page. Floating screenshots, quiet widget illustrations, and context flow use CSS motion, with reduced-motion preferences and a pause control. Illustrative widget counts are labeled as examples and never read an actual mailbox.

Download buttons link directly to the v0.3.12 Setup and Portable assets on GitHub Releases. Product copy reflects the source implementation and documents the runtime requirements for background work.
