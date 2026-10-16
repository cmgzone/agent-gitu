/** Generated application packages are separate from the source being edited.
 * Keep directory discovery consistent between indexing and default searches. */
export function isGeneratedIndexDirectory(name: string): boolean {
  return /^(?:dist(?:[-_].*|\d+)?|build(?:[-_].*|\d+)?|release(?:[-_].*)?|win-unpacked|app\.asar(?:\.unpacked)?)$/i.test(name);
}
