/** Preserve useful source context, and make every shortened result explicit. */
export function formatToolOutput(tool: string, output: string, limit?: number): string {
  const cap = limit && Number.isFinite(limit) && limit > 0 ? limit : Infinity;
  if (output.length <= cap) return output;
  const cut = output.lastIndexOf('\n', cap);
  const kept = output.slice(0, cut > 0 ? cut : cap);
  const numbered = [...kept.matchAll(/^(\d+): /gm)];
  const lastLine = numbered.at(-1)?.[1];
  // A single oversized line may itself be partial; reread that line instead
  // of skipping unseen text. Otherwise continue after the last complete line.
  const offset = lastLine ? Number(lastLine) + (cut > 0 ? 1 : 0) : undefined;
  const guidance = tool === 'read_file'
    ? `Read the same path with ${offset ? `offset=${offset} and a smaller limit` : 'a smaller line range'}, or use search_files to locate the exact symbol.`
    : 'Narrow the request or inspect the saved full output if the omitted detail is needed.';
  return `${kept}\n[OUTPUT TRUNCATED: ${output.length - kept.length} characters omitted. ${guidance}]`;
}
