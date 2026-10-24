/** Generated application packages and browser state are separate from source.
 * Keep directory discovery consistent between indexing and default searches. */
export function isGeneratedIndexDirectory(name: string): boolean {
  return /^(?:dist(?:[-_].*|\d+)?|build(?:[-_].*|\d+)?|release(?:[-_].*)?|win-unpacked|app\.asar(?:\.unpacked)?|browser-profiles)$/i.test(name);
}
