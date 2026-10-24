# Document design

`create_document` creates PDF, DOCX, XLSX, PPTX, HTML, TXT, Markdown and CSV files. All agents use the same generator. These are local files; editing a connected cloud document still uses that service's tools.

Choose a style for each request with `style.preset`: `professional`, `formal`, `modern`, `colourful`, `minimal` or `brochure`. Override accent, heading, text and background colours, font, type sizes, page size, orientation, margins, density and one or two columns. PDF and HTML also support report, letter, brochure, cards and minimal layouts. Office formats apply the compatible typography and colour settings; their layout engines differ. Plain text and CSV cannot store visual styling.

```json
{
  "path": "report.pdf",
  "title": "Project update",
  "subtitle": "Progress and next steps",
  "style": {"preset": "modern", "accentColor": "#0F766E", "density": "compact"},
  "sections": [{
    "heading": "Delivery",
    "icon": "chart",
    "body": "The pilot is ready for review.",
    "bullets": ["Review customer feedback", "Confirm the next milestone"],
    "table": {"headers": ["Milestone", "Status"], "rows": [["Pilot", "Ready"]]},
    "image": {"path": "images/product.png", "caption": "Product preview"}
  }]
}
```

PDF sections flow onto the available page area. Headings stay with following content, table headers repeat, and images scale to the page. `pageBreak: true` is an intentional section break, never a default for every section. Long content continues rather than being discarded to meet a page target.

Images must be PNG or JPEG files in an authorised readable folder; the renderer does not download remote images. Named icons are `check`, `star`, `chart`, `briefcase`, `calendar`, `bulb`, `info`, `warning`, `target` and `users`. Basic bold and inline-code emphasis is supported in section text. Arbitrary HTML is escaped.

PDF printing and rasterising Office icons use an isolated, temporary Chromium or Edge context with scripts, downloads and network requests disabled. Personal browser profiles, cookies and logins are never used. Hosted containers already install Playwright Chromium. Other hosts need a supported browser installed; missing rendering support produces an actionable error. Basic Word, Excel, PowerPoint and text generation does not need a browser when no icons are requested.

Excel accepts `rows` or multiple `sheets`, each with a unique name, optional title, `columns` (width/number format) and optional image. Row 1 of the supplied data is the table header; generated sheets place the document title above it. Sheets include wrapping, appropriate numeric/date formats, variable column widths, filters, frozen headers, alternating row fills and a print layout. Use actual numbers for numeric data, `{ "date": "2026-11-01T00:00:00Z" }` for dates, and `{ "formula": "SUM(B4:B5)", "result": 30 }` for explicit formulas. Formulas are not evaluated by the generator: supplied results must be checked; missing results recalculate when opened in Excel. CSV exports one table of values, without styling.

Word contains semantic heading styles, real bullets, tables, images, page numbers and flowing paragraphs. PowerPoint splits text across continuation slides and repeats table headers when tables continue. In-app Office previews preserve readable content and compatible styles; they do not reproduce native Office pagination. Generated files receive structural checks, which do not replace visual review before delivery.

Company deletion is available in Companies → select a company → Settings → Delete company. The owner types the company name to confirm. Gitu stops that company's work, removes its app records and keeps its project files, shared teammates and a recovery snapshot. This differs from an explicitly requested full local reset, which also removes managed projects.
