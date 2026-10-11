// Prints the character classes of the tenant-text rule set as code point ranges, from this Node's
// Unicode tables. The classes are the #34 core's (packages/schema brand.ts plainName) plus marks:
//   trim     what String.prototype.trim removes (zod's .trim())
//   refuse   control, format and separator characters: [\p{Cc}\p{Cf}\p{Zl}\p{Zp}]
//   blank    characters that draw nothing: [\p{Default_Ignorable_Code_Point}\u2800]
//   visible  letters, digits, punctuation and symbols: [\p{L}\p{N}\p{P}\p{S}]
//   marks    combining marks, dropped when folding: \p{M}
// Usage: node packages/engine/scripts/gen-tenant-text-charsets.ts > /tmp/charsets.json
// tenant-text.test.ts checks the committed rule set against the same derivation.
const CLASSES: Record<string, (s: string) => boolean> = {
  trim: (s) => s.trim() === "",
  refuse: (s) => /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(s),
  blank: (s) => /[\p{Default_Ignorable_Code_Point}\u2800]/u.test(s),
  visible: (s) => /[\p{L}\p{N}\p{P}\p{S}]/u.test(s),
  marks: (s) => /\p{M}/u.test(s),
};

function ranges(test: (s: string) => boolean): [number, number][] {
  const out: [number, number][] = [];
  for (let cp = 0; cp <= 0x10ffff; cp++) {
    if (cp >= 0xd800 && cp <= 0xdfff) continue;
    if (!test(String.fromCodePoint(cp))) continue;
    const last = out.at(-1);
    if (last && last[1] === cp - 1) last[1] = cp;
    else out.push([cp, cp]);
  }
  return out;
}

console.log(JSON.stringify(Object.fromEntries(Object.entries(CLASSES).map(([k, f]) => [k, ranges(f)]))));
