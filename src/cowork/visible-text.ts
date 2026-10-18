import { stripToolMarkers } from './tools.js';

const STATE_MARKER = '<cowork_state>';

/** The native and API runtimes publish the same user-facing text. Code examples
 * remain literal; completion metadata and partially streamed tags stay private. */
export function visibleCoworkText(reply: string, streaming = false): string {
  return stripToolMarkers(reply, streaming).split(/(```[\s\S]*?(?:```|$)|`[^`\n]+`)/g).map((part, index) => {
    if (index % 2) return part;
    let text = part.replace(/<cowork_state>[\s\S]*?(?:<\/cowork_state>|$)/gi, '');
    if (streaming) {
      const lower = text.toLowerCase();
      for (let length = Math.min(text.length, STATE_MARKER.length - 1); length > 0; length--) {
        if (lower.endsWith(STATE_MARKER.slice(0, length))) { text = text.slice(0, -length); break; }
      }
    }
    return text;
  }).join('').trim();
}
