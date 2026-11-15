export type ComparisonProductIds = [string, string];

export const isValidUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export function parseComparisonIds(value: unknown): ComparisonProductIds | null {
  if (typeof value !== "string") return null;

  const ids = value.split(",").map((id) => id.trim());
  if (
    ids.length !== 2 ||
    ids.some((id) => !isValidUuid(id)) ||
    ids[0].toLowerCase() === ids[1].toLowerCase()
  ) {
    return null;
  }

  return [ids[0], ids[1]];
}
