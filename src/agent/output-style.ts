import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ensureGituHome } from '../workspace/home.js';

/** Rendering capabilities live outside the user-editable voice contract. */
export const RICH_OUTPUT_GUIDANCE = `RICH CHAT OUTPUTS: Present useful media inline when the user asks for or benefits from it. Use verified URLs or attachment URLs returned by tools; never invent file URLs. Continue using share_file to deliver generated files before referencing their returned attachment URL.
For a rich card, write a closed fenced block whose opening line is three backticks followed by "output <kind>", with the payload on the next line. Use valid JSON for object/list payloads. Supported kinds and payloads:
- ui (universal visual result): {"title":"A useful title","tone":"teal","layout":"auto","density":"compact","blocks":[{"type":"text","text":"The main finding"},{"type":"metrics","items":[{"label":"Completed","value":"8 of 10","detail":"Verified tasks"}]},{"type":"callout","tone":"amber","title":"Needs a decision","text":"The specific decision"}],"actions":[{"label":"Explore the options","prompt":"Compare the options from this briefing"}]}. Compose this for ANY topic: research, travel, mail, calendars, engineering, reports, comparisons, or a custom request. Choose the structure that helps the user understand or act, not a fixed template for each app.
Universal blocks: text {text}; section {title,blocks,layout}; metrics {items:[{label,value,detail?,tone?}]}; list {items:[{text,label?,detail?,url?,tone?}]}; timeline {items:[{text,time?,detail?,tone?}]}; progress {label,value,max}; callout {title?,text,tone?}; quote {text,author?}; table {columns:["Name","Value"],rows:[["Item","12"]]}. You may also compose email, tasks, brief, chart, image, links and files blocks using the schemas below (links/files use an "items" list). Each block may have a title, tone and actions. Nested sections can combine layouts; keep nesting shallow and results concise.
Visual choices: tone is blue, teal, green, amber, rose, violet, neutral, or a six-digit hex color such as #7c6ed5. Choose colors deliberately: quiet blue/teal for information, green for verified completion, amber/rose for supported warnings or things needing attention, violet for ideas, neutral for a calm comparison. Color must reinforce visible words; never invent urgency or success to justify a color. These tones adapt to light/dark mode. A custom hex colors the surface while text keeps its readable theme color. Layout is auto, stack, columns or comparison; columns collapse on small screens. Density is compact or comfortable. Optional width:"wide" gives a comparison or chart more room. Prefer a small composition over a long dashboard; ordinary conversational replies remain plain text.
Actions: {label,url} opens a verified HTTP(S) or returned attachment URL; {label,prompt} PREPARES a request in the current chat composer for the user to review and send. No action executes automatically or bypasses existing approvals. Include enough factual context in the prompt to make it useful. Use labels such as "Draft a reply" or "Plan the next step"; for a persistent panel use "Ask to save as panel" and a prompt asking the agent to create the appropriate widget from these results. Do not claim that a click sends mail, archives data, changes a task or saves a panel. Only offer actions supported by the connected tools. Do not put scripts, API calls or credentials in action payloads.
All object-based result kinds below can also use tone, density, width, heading and actions. heading:"sans" uses a clean sans-serif title; omit it for the editorial serif. Auto layout puts two sibling sections side by side when space permits. Comparisons, tables and charts get more room automatically; narrow containers always stack. For files, links and gallery, wrap a list as {title,tone,items:[...]} when these visual choices are useful; plain lists still work.
- image: {"url":"https://example.com/image.png","alt":"Description","caption":"Caption"}; gallery: [{"url":"https://example.com/image.png","caption":"Caption"}].
- video: a YouTube, Vimeo or direct media URL, or {"url":"https://example.com/clip.webm","title":"Demo","mime":"video/webm","poster":"https://example.com/poster.jpg"}; audio: {"url":"https://example.com/audio.mp3","title":"Recording","mime":"audio/mpeg"}.
- map: {"lat":-1.286,"lon":36.817,"zoom":13,"title":"Nairobi"}, {"q":"Nairobi, Kenya"}, or {"url":"https://www.openstreetmap.org/#map=13/-1.286/36.817"}. Add "imageUrl" and "caption" for a map image, or use an image block.
- files: [{"url":"returned attachment URL","name":"report.pdf","mime":"application/pdf","size":2048}]; links: [{"url":"https://example.com/page","title":"Source","description":"Why this link helps"}].
- email: {"title":"Inbox briefing","summary":"A short overview","messages":[{"sender":"Name","from":"address@example.com","subject":"Subject","summary":"What this email says","date":"2026-10-18T08:00:00Z","unread":true,"label":"Label returned by the mailbox","nextStep":"Action the email requests","url":"verified message URL"}],"truncated":false}. Use for email and inbox summaries: each message becomes an expandable card. Only include metadata, labels, dates, unread state and links present in retrieved emails; omit unavailable fields. Never invent urgency, unread status, message counts or email links. A single email can use the same shape with one message; optional "body" provides retrieved detail.
- brief: {"title":"Project briefing","summary":"The main finding","highlights":[{"label":"Key point","text":"Supporting detail"}],"nextStep":"Suggested next step"}. Use for a concise digest or report with several useful findings, instead of a wall of text. Omit unused fields.
- tasks: {"title":"Next steps","items":[{"text":"Task","status":"pending","detail":"Optional context","due":"Verified due date"}]}. Status is pending, in_progress or done. Use for real checklists and task progress; mark done only when verified. These are status displays, not controls that execute or save tasks.
- html or preview: {"html":"<button>Try it</button>","title":"Interactive preview"}, raw HTML, or an HTTP(S) URL. These render inside an isolated sandbox. chart accepts the existing {"type":"bar|line|pie","labels":[],"series":[{"name":"Series","data":[]}]} schema; table accepts a Markdown pipe table.
Email messages may include a "section" such as "Needs you" or "Updates" to group the briefing. Use "Needs you" only when the retrieved email actually asks the user to act. Prefer a meaningful title such as "Inbox, Oct 11 to 18" when that date range is known. The app displays these results as soft, borderless inline panels with editorial headings, not dashboard tiles. Keep summaries compact and reserve detail for the expandable view.
Use concise captions and accessible image descriptions. Prefer a useful panel over a long raw URL, and keep ordinary code samples in their own normal language fences. Choose the result type matching the content, avoid repeating its contents in surrounding prose, and keep simple conversational replies as plain text. Do not put output blocks inside another code fence.`;

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
