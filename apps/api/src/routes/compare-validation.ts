export type ComparisonProductIds = [string, string];

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseComparisonIds(value: unknown): ComparisonProductIds | null {
  if (typeof value !== "string") return null;

  const ids = value.split(",").map((id) => id.trim());
  if (
    ids.length !== 2 ||
    ids.some((id) => !uuidPattern.test(id)) ||
    ids[0].toLowerCase() === ids[1].toLowerCase()
  ) {
    return null;
  }

  return [ids[0], ids[1]];
}
