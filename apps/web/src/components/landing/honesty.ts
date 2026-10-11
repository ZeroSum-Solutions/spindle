// Copy guards for signed-out marketing pages (DESIGN.md › Layout: honest copy only). Pure, so the
// rules are unit-tested against forbidden examples as well as the real page.

/** Coaches named in the research notes. None may appear as an endorsement or name-drop. */
const NAMED_COACHES = [
  "Cressey", "Boyle", "DeFranco", "Kenn", "Dietz", "Dan John", "Hocevar", "Simmons", "Tuchscherer", "Wesley Smith", "Nuckols", "Candito",
  "Everett", "Pendlay", "Takano", "Israetel", "Nippard", "Schoenfeld", "Milo Wolf", "Henselmans", "Ethier", "Contreras", "Helms", "McMillan",
  "Pfaff", "Holler", "Starrett", "Gray Cook", "Spina", "Conor Harris", "Horschig", "Myers", "Mishler", "MacGregor", "Fitzgerald", "Higdon",
  "Magness", "Friel", "Seiler", "Jamieson", "Zahabi", "McGill", "Ben Patrick", "Norton", "Aragon", "Galpin",
];

const BANNED: { rule: string; pattern: RegExp }[] = [
  { rule: "testimonial or quotation", pattern: /testimonial|[“”]|\b(says|said|writes)\s+(a|an|one|our|the|coach|trainer|owner)\b/i },
  { rule: "endorsement or approval", pattern: /\b(trusted|used|loved|reviewed|approved|endorsed|recommended|vetted)\s+by\b/i },
  { rule: "professional review claim", pattern: /\b(licensed|certified|registered)\s+(pt|physio|physiotherapist|physical therapist|clinician|doctor)\b/i },
  { rule: "usage or adoption claim", pattern: /\b(gyms|coaches|trainers|users|clients|members)\s+(use|trust|love|rely on)\b/i },
  { rule: "launch promise or date", pattern: /\bcoming soon\b|\blaunch(es|ing)?\b|\bnext (month|quarter|year)\b|\bby (spring|summer|autumn|fall|winter)\b/i },
  { rule: "guarantee", pattern: /\bguarantee/i },
];

/**
 * Problems in a page's main content. Digits are allowed only inside elements marked
 * `data-allow-number` (list numbering, hex colours, the validator's check counts, the code length).
 */
export function copyProblems(html: string): string[] {
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, "");
  const scrubbed = withoutComments.replace(/<(\w+)\b[^>]*\bdata-allow-number\b[^>]*>[\s\S]*?<\/\1>/g, " ");
  const text = scrubbed.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, (e) => (e === "&#x27;" || e === "&#39;" ? "'" : " "));
  const problems: string[] = [];
  for (const m of text.matchAll(/[^.\s]*\d[^.\s]*/g)) problems.push(`number outside an allowed element: "${m[0]}"`);
  for (const { rule, pattern } of BANNED) {
    const m = text.match(pattern);
    if (m) problems.push(`${rule}: "${m[0]}"`);
  }
  for (const name of NAMED_COACHES) if (new RegExp(`\\b${name}\\b`).test(text)) problems.push(`named coach: "${name}"`);
  return problems;
}
