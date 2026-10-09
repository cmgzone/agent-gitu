import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ensureGituHome } from '../workspace/home.js';

/** Rendering capabilities live outside the user-editable voice contract. */
export const RICH_OUTPUT_GUIDANCE = `RICH CHAT OUTPUTS: Present useful media inline when the user asks for or benefits from it. Use verified URLs or attachment URLs returned by tools; never invent file URLs. Continue using share_file to deliver generated files before referencing their returned attachment URL.
For a rich card, write a closed fenced block whose opening line is three backticks followed by "output <kind>", with the payload on the next line. Use valid JSON for object/list payloads. Supported kinds and payloads:
- image: {"url":"https://example.com/image.png","alt":"Description","caption":"Caption"}; gallery: [{"url":"https://example.com/image.png","caption":"Caption"}].
- video: a YouTube, Vimeo or direct media URL, or {"url":"https://example.com/clip.webm","title":"Demo","mime":"video/webm","poster":"https://example.com/poster.jpg"}; audio: {"url":"https://example.com/audio.mp3","title":"Recording","mime":"audio/mpeg"}.
- map: {"lat":-1.286,"lon":36.817,"zoom":13,"title":"Nairobi"}, {"q":"Nairobi, Kenya"}, or {"url":"https://www.openstreetmap.org/#map=13/-1.286/36.817"}. Add "imageUrl" and "caption" for a map image, or use an image block.
- files: [{"url":"returned attachment URL","name":"report.pdf","mime":"application/pdf","size":2048}]; links: [{"url":"https://example.com/page","title":"Source","description":"Why this link helps"}].
- html or preview: {"html":"<button>Try it</button>","title":"Interactive preview"}, raw HTML, or an HTTP(S) URL. These render inside an isolated sandbox. chart accepts the existing {"type":"bar|line|pie","labels":[],"series":[{"name":"Series","data":[]}]} schema; table accepts a Markdown pipe table.
Use concise captions and accessible image descriptions. Prefer a useful card over a long raw URL, and keep ordinary code samples in their own normal language fences. Do not put output cards inside another code fence.`;

/**
 * Global presentation contract for every user-visible agent reply. Lives in
 * STYLE.md under the Agent Gitu home so the user can edit it; the default is
 * written on first use. This governs HOW results are presented — identity and
 * behavior stay in each agent's own instructions.
 */
export const DEFAULT_OUTPUT_STYLE = `# Agent Output Style

## General
Write clear, compact, professional responses. Prefer headings, short paragraphs, bullet points, numbered steps when order matters, bold for important terms, and tables only when a comparison genuinely helps.

Avoid decorative separator lines such as ----, ====, or *****, repeated horizontal rules, ASCII banners, headings made from symbols, excessive nesting, giant blocks of unstructured text, and repeating the same conclusion several times.

## Headings
Use Markdown headings:

# Main title
## Section
### Subsection

Do not write:

----------------
RESULTS
----------------

## Lists
When categorising information, prefer bullet points:

- **Security:** approval required
- **Tests:** 42 passed

When describing a sequence, use numbered steps:

1. Inspect the repository.
2. Make the change.
3. Run tests.

## Highlighting
Use **bold** for important names, decisions, states, and warnings. Use inline code for \`files\`, \`commands\`, \`functions\`, \`paths\`, and \`config keys\`. Do not bold entire paragraphs.

## Status output
Prefer:

### Validation
- **Typecheck:** passed
- **Tests:** 1,242 passed

Avoid:

TYPECHECK ---- PASS
TESTS ------- PASS

## Reports
Lead with the result, then structure details under headings such as ## What changed, ## What I found, ## Validation, ## Risks, ## Next step. Only include sections that are useful.

## Final rule
Formatting should improve scanability. **Never use decorative horizontal separator lines.** Do not use decorative punctuation to simulate layout.
`;

/** STYLE.md in the Agent Gitu home — the single user-editable override. */
export function styleFilePath(): string {
  return path.join(ensureGituHome().workspace, 'STYLE.md');
}

/** Load the presentation contract: user STYLE.md when present, default otherwise. */
export function loadOutputStyle(): string {
  try {
    const file = styleFilePath();
    if (!existsSync(file)) {
      try {
        writeFileSync(file, `${DEFAULT_OUTPUT_STYLE}\n`);
      } catch {
        /* read-only home still gets the default contract */
      }
      return DEFAULT_OUTPUT_STYLE;
    }
    const custom = readFileSync(file, 'utf8').trim();
    return custom || DEFAULT_OUTPUT_STYLE;
  } catch {
    return DEFAULT_OUTPUT_STYLE;
  }
}

/** A line made only of decorative rule characters (allowing the fenced markers aside). */
const SEPARATOR_RUN = /^ {0,3}([-=*_~\u2010-\u2015\u2022\u00b7\u2500-\u257f])\1{2,}[ \t]*$/;
/** `---- LABEL ----` — a title crushed between decorative rules. */
const WRAPPED_TITLE = /^ {0,3}([-=*_~\u2010-\u2015\u2500-\u257f])\1{2,}[ \t]*(\S.*?)\s*\1{3,}[ \t]*$/;
const RULE_CHARS = /^[-=*_~\u2010-\u2015\u2500-\u257f]+$/;
/** `TYPECHECK ---- PASS` — an inline ladder between two words becomes an em dash. */
const INLINE_LADDER = /^(.+?\S)[ \t]*[-=*_~\u2010-\u2015\u2500-\u257f]{3,}[ \t]*(\S.*)$/;
const FENCE = /^ {0,3}(```|~~~)/;

/**
 * Final-output hygiene for user-visible replies: decorative rules are removed,
 * and a block wrapped between rules becomes a real Markdown heading. Fenced
 * code, Markdown tables and ASCII art inside fences are never touched.
 */
export function applyOutputHygiene(text: string): string {
  const source = String(text ?? '').replace(/\r\n?/g, '\n');
  if (!source.trim()) return source;
  const lines = source.split('\n');
  const out: string[] = [];
  let fenced = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (FENCE.test(line)) {
      fenced = !fenced;
      out.push(line);
      continue;
    }
    if (fenced) {
      out.push(line);
      continue;
    }
    const wrapped = WRAPPED_TITLE.exec(line);
    if (wrapped && !RULE_CHARS.test(wrapped[2]!)) {
      out.push(`## ${wrapped[2]!.trim()}`);
      continue;
    }
    if (SEPARATOR_RUN.test(line)) {
      // A title or block sandwiched between two rules: "---- X ----" spans the
      // next non-blank lines only. Anything else means the rule is bare.
      let cursor = i + 1;
      while (cursor < lines.length && !lines[cursor]!.trim()) cursor++;
      const inner: string[] = [];
      let closeAt = -1;
      while (cursor < lines.length && lines[cursor]!.trim()) {
        if (SEPARATOR_RUN.test(lines[cursor]!)) {
          closeAt = cursor;
          break;
        }
        inner.push(lines[cursor]!);
        cursor++;
      }
      if (closeAt >= 0 && inner.length > 0) {
        if (inner.length === 1) out.push(`## ${inner[0]!.trim()}`);
        else out.push(...inner);
        i = closeAt; // the loop's i++ then moves past the closing rule
        continue;
      }
      continue; // a bare decorative rule is simply removed
    }
    // Inline ladder: "TYPECHECK ---- PASS" reads as a status line; make it prose.
    // Table rows (leading |) and fenced content above are exempt.
    if (!line.trimStart().startsWith('|')) {
      out.push(line.replace(INLINE_LADDER, (_m, left: string, right: string) => `${left.trim()} — ${right.trim()}`));
      continue;
    }
    out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
