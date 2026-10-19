/** Assemble trusted, repository-owned UI assets without evaluating templates.
 * Script order and the existing shared browser scope are intentionally retained. */
export function renderUiDocument(assets: Readonly<Record<string, string>>, bindings: Readonly<Record<string, string>>): string {
  const active = new Set<string>();
  const expand = (name: string): string => {
    if (!Object.hasOwn(assets, name)) throw new Error('Missing UI asset: ' + name);
    if (active.has(name)) throw new Error('Cyclic UI asset: ' + name);
    active.add(name);
    const text = assets[name]!.replace(/<!-- GITU_ASSET:([\w./-]+) -->/g, (_match, child: string) => expand(child));
    active.delete(name);
    return text;
  };
  return expand('index.html').replace(
    /\/\* GITU_BINDING_([A-Z0-9_]+) \*\/|\/\* GITU_VALUE_([A-Z0-9_]+) \*\/ null/g,
    (_match, text: string | undefined, value: string | undefined) => {
      const key = text ?? value!;
      if (!Object.hasOwn(bindings, key)) throw new Error('Missing UI binding: ' + key);
      return bindings[key]!;
    },
  );
}
