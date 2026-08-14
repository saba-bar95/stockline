export type CanonicalUnit = "kg" | "l" | "pc";

const ALIASES: Record<string, CanonicalUnit> = {
  kg: "kg",
  კგ: "kg",
  l: "l",
  ლ: "l",
  ლიტრი: "l",
  pc: "pc",
  ც: "pc",
  ცალი: "pc",
};

/** Map stored unit codes (and legacy Georgian literals) to kg / l / pc. */
export function canonicalUnit(unit: string): CanonicalUnit | null {
  const u = unit.trim();
  return ALIASES[u] ?? ALIASES[u.toLowerCase()] ?? null;
}

export function sameUnit(a: string, b: string): boolean {
  const ca = canonicalUnit(a);
  const cb = canonicalUnit(b);
  if (ca && cb) return ca === cb;
  return a.trim() === b.trim();
}

export function storedUnit(unit: string): string {
  return canonicalUnit(unit) ?? unit.trim();
}
