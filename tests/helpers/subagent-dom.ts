/** Small DOM adapter for exercising the shipped callbacks, not a second renderer. */
export class Element {
  children: Element[] = [];
  parent?: Element;
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
  style = { setProperty: () => {} };
  className = '';
  text = '';
  hidden = false;
  open = false;
  attached = false;
  offsetWidth = 300;
  listeners: Record<string, () => void> = {};
  onclick?: () => void;
  onfocus?: () => void;
  constructor(readonly tag = 'div') {}
  get parentElement() { return this.parent; }
  get isConnected(): boolean { return this.attached || Boolean(this.parent?.isConnected); }
  get textContent(): string { return this.text + this.children.map(child => child.textContent).join(''); }
  set textContent(value: string) { this.text = value; this.children = []; }
  set innerHTML(html: string) {
    this.children = []; this.text = '';
    const stack: Element[] = [this];
    for (const token of html.match(/<[^>]+>|[^<]+/g) || []) {
      if (token.startsWith('</')) { stack.pop(); continue; }
      if (!token.startsWith('<')) { stack.at(-1)!.text += token; continue; }
      const tag = /^<(\w+)/.exec(token)?.[1];
      if (!tag) continue;
      const child = new Element(tag);
      for (const match of token.matchAll(/([\w-]+)="([^"]*)"/g)) child.setAttribute(match[1], match[2].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
      stack.at(-1)!.appendChild(child);
      if (!['img', 'br', 'input'].includes(tag) && !token.endsWith('/>')) stack.push(child);
    }
  }
  setAttribute(name: string, value: string) { this.attributes[name] = value; if (name === 'class') this.className = value; }
  getAttribute(name: string) { return this.attributes[name]; }
  appendChild(child: Element) { child.parent = this; this.children.push(child); }
  insertBefore(child: Element, before: Element | null) {
    child.remove();
    child.parent = this;
    this.children.splice(before ? this.children.indexOf(before) : this.children.length, 0, child);
  }
  matches(selector: string) {
    return selector.startsWith('.') ? this.className.split(' ').includes(selector.slice(1)) : selector.startsWith('[') ? selector.slice(1, -1) in this.attributes : this.tag === selector;
  }
  querySelectorAll(selector: string): Element[] {
    const [ancestor, ...rest] = selector.split(' ');
    if (rest.length) return this.querySelectorAll(ancestor).flatMap(node => node.querySelectorAll(rest.join(' ')));
    return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector: string) { return this.querySelectorAll(selector)[0] || null; }
  contains(child: Element): boolean { return this === child || this.children.some(node => node.contains(child)); }
  getBoundingClientRect() { return { left: 24, top: 24, bottom: 70, width: 300, height: 250 }; }
  addEventListener(name: string, fn: () => void) { this.listeners[name] = fn; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); this.parent = undefined; }
  showModal() { this.open = true; }
  close() { this.open = false; this.listeners.close?.(); }
  focus() { this.onfocus?.(); }
}
