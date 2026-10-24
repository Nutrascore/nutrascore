export function parseModeratorPaginationValue(
  value: string | undefined,
  fallback: number,
  max?: number,
): number | null {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 1 ||
    (max !== undefined && parsed > max)
  )
    return null;
  return parsed;
}

export function getModeratorTotalPages(
  totalItems: number,
  pageSize: number,
): number {
  return Math.ceil(totalItems / pageSize);
}
