import { readFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import { pool } from "./db/pool.js";

interface CsvRecord {
  "S.No": string;
  "Item name": string;
  Brand_Name: string;
}

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en");
}

try {
  const csvPath = new URL("../../../data/processed/packaged_foods_india_cleaned.csv", import.meta.url);
  const csv = await readFile(csvPath, "utf8");
  const csvProducts = parse(csv, { bom: true, columns: true, skip_empty_lines: true }) as CsvRecord[];
  const result = await pool.query(`
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
  const indexedImages = new Map<string, typeof result.rows>();
  for (const row of result.rows) {
    const key = `${normalize(row.name)}\u0000${normalize(row.brand ?? "")}`;
    indexedImages.set(key, [...(indexedImages.get(key) ?? []), row]);
  }
  const matches = [];
  const ambiguous = [];
  for (const product of csvProducts) {
    const key = `${normalize(product["Item name"])}\u0000${normalize(product.Brand_Name ?? "")}`;
    const candidates = indexedImages.get(key) ?? [];
    if (candidates.length === 1) {
      matches.push({
        id: `csv-${product["S.No"]}`,
        name: product["Item name"],
        brand: product.Brand_Name,
        imageUrl: candidates[0].image_url,
      });
    } else if (candidates.length > 1) {
      ambiguous.push({ serial: product["S.No"], name: product["Item name"], brand: product.Brand_Name, count: candidates.length });
    }
  }
  console.log(JSON.stringify({ imageBearingRecords: result.rows.length, uniqueExactMatches: matches.length, ambiguous, matches }, null, 2));
} finally {
  await pool.end();
}
