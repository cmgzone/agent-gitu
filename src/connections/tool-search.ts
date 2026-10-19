import type { ConnectedAppTool } from './provider.js';

const equivalents = [
  ['read', 'get', 'fetch', 'retrieve', 'view', 'show'],
  ['list', 'search', 'find', 'browse', 'lookup'],
  ['email', 'mail', 'message', 'inbox'],
  ['file', 'document'],
];
const stop = new Set(['a', 'an', 'the', 'my', 'me', 'to', 'of', 'for', 'in', 'on', 'with', 'and', 'can', 'please']);
const mutations = new Set(['send', 'create', 'update', 'edit', 'delete', 'remove', 'add', 'modify', 'patch', 'trash', 'forward', 'draft', 'write', 'import', 'insert']);
function words(text: string): string[] {
  return text.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map(word => word.length > 4 && word.endsWith('s') ? word.slice(0, -1) : word);
}

/** Rank the complete service catalog, rather than trusting a truncated soft
 * search whose first results can be unrelated actions in alphabetical order.
 * Ranking never grants execution permission or classifies an action as safe. */
export function searchAppTools(tools: ConnectedAppTool[], query: string): ConnectedAppTool[] {
  const terms = [...new Set(words(query).filter(word => !stop.has(word)))];
  if (!terms.length) return tools.slice(0, 5);
  const reading = !terms.some(word => mutations.has(word));
  const canonical = (tokens: string[]) => tokens.map(word => equivalents.find(group => group.includes(word))?.[0] ?? word).join(' ');
  const phrase = canonical(terms);
  return tools.map(tool => {
    const name = new Set(words(tool.slug + ' ' + tool.name)), description = new Set(words(tool.description ?? ''));
    let score = terms.reduce((total, term) => {
      const synonyms = equivalents.find(group => group.includes(term)) ?? [term];
      return total + (name.has(term) ? 20 : synonyms.some(word => name.has(word)) ? 12 : description.has(term) ? 2 : synonyms.some(word => description.has(word)) ? 1 : 0);
    }, tool.slug.toLowerCase() === query.trim().toLowerCase() ? 1000 : 0);
    if (score > 0) {
      if (canonical(words(tool.name)) === phrase || canonical(words(tool.slug)).endsWith(' ' + phrase)) score += 30;
      // Noun-only browsing requests should surface reading actions first.
      // This affects search order only; execution still uses the host's gates.
      if (reading && [...name].some(word => mutations.has(word))) score -= 16;
      else if (reading && [...name].some(word => equivalents[0]!.includes(word) || equivalents[1]!.includes(word))) score += 8;
    }
    return { tool, score };
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.tool.slug.localeCompare(b.tool.slug)).slice(0, 5).map(item => item.tool);
}
