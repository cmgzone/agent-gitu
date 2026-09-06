import { Script, createContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { UI_RESPONSE_JS } from '../src/server/ui-response.js';

const context = createContext({ URL });
new Script(UI_RESPONSE_JS).runInContext(context);
const render = (text: string): string => context.renderResponseText(text);

describe('Final response rendering', () => {
  it('preserves developed answers, paragraph breaks, and deliberate line breaks', () => {
    const paragraphs = Array.from({ length: 30 }, (_, i) => `Finding ${i + 1} explains the result.\nThis check establishes the relevant behavior.`);
    const html = render(paragraphs.join('\n\n'));
    expect(html).toBe(paragraphs.map(text => '<p>' + text.replace('\n', '<br>') + '</p>').join(''));
    expect(html).not.toContain('Next:');
    expect(html).toContain('Finding 30');
  });

  it('renders headings, lists, bold, and literal inline code in normal prose', () => {
    expect(render('## Result\n\nThe **updated view** uses `src/ui.ts`.\n\n- Smooth streaming\n- Expandable output\n\n3. Run checks\n4. Open the app')).toBe(
      '<h2>Result</h2><p>The <strong>updated view</strong> uses <code>src/ui.ts</code>.</p><ul><li>Smooth streaming</li><li>Expandable output</li></ul><ol start="3"><li>Run checks</li><li>Open the app</li></ol>',
    );
    expect(render('Use `**literal** <tag>` and **`code`**.')).toBe('<p>Use <code>**literal** &lt;tag&gt;</code> and <strong><code>code</code></strong>.</p>');
  });

  it('keeps multiline code literal with a safely escaped optional language label', () => {
    const html = render('Before.\n\n```html\n<div onclick="alert(1)">**literal**</div>\n</script>\n```\n\nAfter.');
    expect(html).toBe('<p>Before.</p><div class="response-code"><div class="response-code-language">html</div><pre><code>&lt;div onclick=&quot;alert(1)&quot;&gt;**literal**&lt;/div&gt;\n&lt;/script&gt;\n</code></pre></div><p>After.</p>');
    expect(render('~~~<svg/onload=alert(1)>\na < b\n~~~')).toContain('&lt;svg/onload=alert(1)&gt;</div><pre><code>a &lt; b\n');
  });

  it('retains malformed and incomplete formatting safely without losing content', () => {
    expect(render('A **partial emphasis and `partial code')).toBe('<p>A **partial emphasis and `partial code</p>');
    expect(render('```js\nconst ready = true;\n<img onerror=alert(1)>')).toBe('<div class="response-code"><div class="response-code-language">js</div><pre><code>const ready = true;\n&lt;img onerror=alert(1)&gt;</code></pre></div>');
    expect(render('````js\n```\nkept\n````')).toContain('<pre><code>```\nkept\n</code></pre>');
    expect(render('```')).toBe('<div class="response-code"><pre><code></code></pre></div>');
  });

  it('allows absolute HTTP(S) links with protected new tabs and escaped attributes', () => {
    const html = render('[**Docs**](https://example.com/reference_(v2)?q=a&b=c) and [HTTP](http://localhost:3000).');
    expect(html).toBe('<p><a href="https://example.com/reference_(v2)?q=a&amp;b=c" target="_blank" rel="noopener noreferrer"><strong>Docs</strong></a> and <a href="http://localhost:3000" target="_blank" rel="noopener noreferrer">HTTP</a>.</p>');
  });

  it('never turns HTML or dangerous, relative, or malformed links into executable markup', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,<svg/onload=alert(1)>', '//example.com', '/local', 'https://', 'https://example.com/"onclick="alert(1)', 'https:\\example.com', 'https://example.com/\tattack']) {
      const html = render(`[link](${url})`);
      expect(html).not.toContain('<a ');
      expect(html).not.toContain('<svg');
    }
    const html = render('<script>alert(1)</script>\n<img src=x onerror=alert(1)>\n\n**<svg onload=alert(1)>**');
    expect(html).not.toMatch(/<(?:script|img|svg)\b/);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('<strong>&lt;svg onload=alert(1)&gt;</strong>');
  });
});
