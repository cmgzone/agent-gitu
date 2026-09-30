import MarkdownIt from 'markdown-it';

// Parse structure only. HTML is never executed or placed in a WebView.
const markdown = new MarkdownIt({ html: false, linkify: true, breaks: true });
export type MarkdownToken = ReturnType<typeof markdown.parse>[number];
export function messageTokens(text: string): MarkdownToken[] {
  return markdown.parse(text, {});
}
export function safeMessageLink(href: string): string | undefined {
  try {
    const url = new URL(href);
    return ['https:', 'http:', 'mailto:'].includes(url.protocol) ? href : undefined;
  } catch {
    return undefined;
  }
}
// Native text does not consistently wrap long paths/identifiers on Android.
export function wrapMessageText(text: string): string {
  return text.replace(/\S{28,}/g, (word) => word.replace(/(.{18})(?=.)/gu, '$1\u200b'));
}
