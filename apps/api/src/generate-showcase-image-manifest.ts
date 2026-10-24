/**
 * generate-showcase-image-manifest.ts
 *
 * Reads every image URL from the normal-mode PostgreSQL database using the
 * same LATERAL query that the normal-mode API uses, then matches each CSV
 * product to a database record using the normalised name+brand key.
 *
 * Only unambiguous 1-to-1 matches are written; any product whose name+brand
 * combination is shared by more than one database record, or appears more than
 * once in the CSV, is left out of the manifest so that the wrong image is
 * never assigned.
 *
 * Output: data/processed/showcase-image-manifest.json
 *   { "csv-1": "https://…", "csv-2": "https://…", … }
 *
 * The manifest is consumed at startup by showcase mode and must be regenerated
 * whenever images are added, updated, or removed in the database.
 *
 * Usage (from the repository root):
 *   pnpm --filter api exec tsx src/generate-showcase-image-manifest.ts
 */

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";
import { readFile } from "node:fs/promises";
import { pool } from "./db/pool.js";

interface CsvRecord {
  "S.No": string;
  "Item name": string;
  Brand_Name: string;
}

/**
 * Normalises a string for comparison: NFKC-normalise, trim, collapse
 * whitespace, and lowercase.  Mirrors the normalisation used by
 * inspect-showcase-image-matches.ts.
 */
function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en");
}

const csvPath = fileURLToPath(
  new URL(
    "../../../data/processed/packaged_foods_india_cleaned.csv",
    import.meta.url,
  ),
);
const manifestPath = fileURLToPath(
  new URL(
    "../../../data/processed/showcase-image-manifest.json",
    import.meta.url,
  ),
);

// ─── 1. Load CSV ──────────────────────────────────────────────────────────────

const csvContents = await readFile(csvPath, "utf8");
const csvProducts = parse(csvContents, {
  bom: true,
  columns: true,
  skip_empty_lines: true,
}) as CsvRecord[];

// ─── 2. Query DB using the same image-selection logic as normal mode ──────────
// Normal mode picks the image with is_primary DESC, id ASC (i.e. the primary
// image, or the lowest UUID when none is flagged primary).  No review-status
// filter is applied in normal-mode public endpoints, so none is applied here.

const dbResult = await pool.query(`
  SELECT p.name, p.brand, image.image_url
  FROM "Products" p
  LEFT JOIN LATERAL (
    SELECT image_url
    FROM "ProductImages"
    WHERE product_id = p.id
    ORDER BY is_primary DESC, id
    LIMIT 1
  ) image ON TRUE
  WHERE image.image_url IS NOT NULL
`);
await pool.end();

// ─── 3. Index DB records by normalised name+brand ─────────────────────────────
// Map<normalisedKey, array-of-rows>; multiple entries mean ambiguous matches.

type DbRow = { name: string; brand: string | null; image_url: string };
const dbIndex = new Map<string, DbRow[]>();

for (const row of dbResult.rows as DbRow[]) {
  const key = `${normalize(row.name)}\x00${normalize(row.brand ?? "")}`;
  const existing = dbIndex.get(key) ?? [];
  existing.push(row);
  dbIndex.set(key, existing);
}

// ─── 4. Count how often each normalised name+brand appears in the CSV ─────────
// If the same name+brand appears in multiple CSV rows we cannot assign a
// single DB image to them without risk of picking the wrong one.

const csvKeyCounts = new Map<string, number>();
for (const product of csvProducts) {
  const key = `${normalize(product["Item name"])}\x00${normalize(product.Brand_Name ?? "")}`;
  csvKeyCounts.set(key, (csvKeyCounts.get(key) ?? 0) + 1);
}

// ─── 5. Build the manifest ────────────────────────────────────────────────────

const manifest: Record<string, string> = {};
let matchedCount = 0;
let ambiguousCount = 0;

for (const product of csvProducts) {
  const sno = product["S.No"]?.trim();
  if (!sno) continue;

  const key = `${normalize(product["Item name"])}\x00${normalize(product.Brand_Name ?? "")}`;
  const dbCandidates = dbIndex.get(key) ?? [];
  const csvOccurrences = csvKeyCounts.get(key) ?? 0;

  if (dbCandidates.length === 1 && csvOccurrences === 1) {
    manifest[`csv-${sno}`] = dbCandidates[0].image_url;
    matchedCount++;
  } else if (dbCandidates.length > 0) {
    ambiguousCount++;
  }
}

// ─── 6. Write output ──────────────────────────────────────────────────────────

await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

console.info(`Manifest written to: ${manifestPath}`);
console.info(`  Verified unique matches : ${matchedCount}`);
console.info(`  Ambiguous (left out)    : ${ambiguousCount}`);
console.info(`  Unmatched CSV rows      : ${csvProducts.length - matchedCount - ambiguousCount}`);
