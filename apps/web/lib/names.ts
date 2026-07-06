const SUFFIXES = new Set(["Jr.", "Jr", "Sr.", "Sr", "II", "III", "IV", "V"]);

/** Compact player label for tight UI: keep suffixes with the actual last name. */
export function shortPlayerName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2 && SUFFIXES.has(parts[parts.length - 1]!)) {
    return `${parts[parts.length - 2]} ${parts[parts.length - 1]}`;
  }
  return parts[parts.length - 1] ?? name;
}
