import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";

export interface ShowcaseNutrition {
  basis: "unknown";
  kcalPer100g: string | null;
  fatG: string | null;
  saturatedFatG: string | null;
  transFatG: string | null;
  carbohydratesG: string | null;
  sugarsG: string | null;
  fibreG: string | null;
  proteinG: string | null;
  sodiumMg: string | null;
  saltG: null;
  cholesterolMg: string | null;
  calciumMg: string | null;
  ironMg: string | null;
  vitamins: string | null;
  servingSize: string | null;
  servingUnit: "g" | null;
}

export interface ShowcaseProduct {
  id: string;
  name: string;
  brand: string | null;
  ingredients: string | null;
  nutriScore: null;
  novaGroup: null;
  priceInr: number | null;
  imageUrl: string | null;
  categories: string[];
  category: string | null;
  nutrition: ShowcaseNutrition;
}

export interface ShowcaseCategory {
  id: string;
  name: string;
  description: null;
  productCount: number;
}

const requiredColumns = [
  "S.No",
  "Item name",
  "Brand_Name",
  "Category",
  "Ingredients",
  "Serving_Size_g",
  "Calories_kcal",
  "Carbohydrates_g",
  "Proteins_g",
  "Total_Fat_g",
  "Saturated_Fat_g",
  "Trans_Fat_g",
  "Sugar_g",
  "Sodium_mg",
  "Dietary_Fiber_g",
  "Cholesterol_mg",
  "Calcium_mg",
  "Vitamin",
  "Iron_mg",
  "Price_INR",
] as const;

type CsvRow = Record<(typeof requiredColumns)[number], string>;

function textValue(value: string | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

function numericText(value: string | undefined): string | null {
  const text = textValue(value);
  if (!text || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text))
    return null;
  const number = Number(text);
  return Number.isFinite(number) && number >= 0 ? text : null;
}

function categoryId(name: string): string {
  const digest = createHash("sha1")
    .update(name.trim().toLowerCase())
    .digest("hex")
    .slice(0, 12);
  return `csv-category-${digest}`;
}

function mapProduct(
  row: CsvRow,
  recordNumber: number,
  imageUrl: string | null,
): ShowcaseProduct {
  const serialNumber = textValue(row["S.No"]);
  const name = textValue(row["Item name"]);
  if (!serialNumber || !name) {
    throw new Error(
      `CSV record ${recordNumber} is missing its serial number or product name.`,
    );
  }

  const category = textValue(row.Category);
  const price = numericText(row.Price_INR);
  const servingSize = numericText(row.Serving_Size_g);

  return {
    id: `csv-${serialNumber}`,
    name,
    brand: textValue(row.Brand_Name),
    ingredients: textValue(row.Ingredients),
    nutriScore: null,
    novaGroup: null,
    priceInr: price === null ? null : Number(price),
    imageUrl,
    categories: category ? [category] : [],
    category,
    nutrition: {
      basis: "unknown",
      kcalPer100g: numericText(row.Calories_kcal),
      fatG: numericText(row.Total_Fat_g),
      saturatedFatG: numericText(row.Saturated_Fat_g),
      transFatG: numericText(row.Trans_Fat_g),
      carbohydratesG: numericText(row.Carbohydrates_g),
      sugarsG: numericText(row.Sugar_g),
      fibreG: numericText(row.Dietary_Fiber_g),
      proteinG: numericText(row.Proteins_g),
      sodiumMg: numericText(row.Sodium_mg),
      saltG: null,
      cholesterolMg: numericText(row.Cholesterol_mg),
      calciumMg: numericText(row.Calcium_mg),
      ironMg: numericText(row.Iron_mg),
      vitamins: textValue(row.Vitamin),
      servingSize,
      servingUnit: servingSize === null ? null : "g",
    },
  };
}

export class ShowcaseCatalog {
  readonly products: ShowcaseProduct[];
  readonly categories: ShowcaseCategory[];
  private readonly categoryNamesById: Map<string, string>;

  constructor(products: ShowcaseProduct[]) {
    this.products = products;
    const productCounts = new Map<string, number>();
    for (const product of products) {
      if (product.category) {
        productCounts.set(
          product.category,
          (productCounts.get(product.category) ?? 0) + 1,
        );
      }
    }

    this.categories = [...productCounts]
      .map(([name, productCount]) => ({
        id: categoryId(name),
        name,
        description: null,
        productCount,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
    this.categoryNamesById = new Map(
      this.categories.map(({ id, name }) => [id, name]),
    );
  }

  getProduct(id: string): ShowcaseProduct | undefined {
    return this.products.find((product) => product.id === id);
  }

  getCategoryName(id: string): string | undefined {
    return this.categoryNamesById.get(id);
  }
}

export async function loadShowcaseCatalog(
  csvPath: string,
  imageManifestPath?: string,
): Promise<ShowcaseCatalog> {
  let contents: string;
  try {
    contents = await readFile(csvPath, "utf8");
  } catch (error) {
    throw new Error(`Unable to read Showcase Mode CSV at "${csvPath}".`, {
      cause: error,
    });
  }

  let rows: CsvRow[];
  try {
    rows = parse(contents, {
      bom: true,
      columns: true,
      skip_empty_lines: true,
    }) as CsvRow[];
  } catch (error) {
    throw new Error(`Unable to parse Showcase Mode CSV at "${csvPath}".`, {
      cause: error,
    });
  }

  if (rows.length === 0) {
    throw new Error(
      `Showcase Mode CSV at "${csvPath}" contains no product records.`,
    );
  }

  const headers = Object.keys(rows[0]);
  const missingColumns = requiredColumns.filter(
    (column) => !headers.includes(column),
  );
  if (missingColumns.length > 0) {
    throw new Error(
      `Showcase Mode CSV at "${csvPath}" is missing required columns: ${missingColumns.join(", ")}.`,
    );
  }

  // Load the static image manifest if provided. The manifest maps csv product
  // IDs (e.g. "csv-1") to the exact image URL used by normal mode for that
  // product. Unrecognised keys and non-string values are silently ignored so
  // that a truncated or partially-updated manifest never causes a startup
  // failure.
  let imageManifest: Record<string, string> = {};
  if (imageManifestPath) {
    try {
      const manifestContents = await readFile(imageManifestPath, "utf8");
      const parsed: unknown = JSON.parse(manifestContents);
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const [key, value] of Object.entries(parsed)) {
          if (typeof value === "string") {
            imageManifest[key] = value;
          }
        }
      }
    } catch {
      // A missing or malformed manifest is non-fatal; products will simply
      // have no image URL, which falls back to the existing placeholder.
    }
  }

  const products = rows.map((row, index) => {
    const sno = row["S.No"]?.trim();
    const id = sno ? `csv-${sno}` : undefined;
    const imageUrl = id ? (imageManifest[id] ?? null) : null;
    return mapProduct(row, index + 2, imageUrl);
  });
  const productIds = new Set<string>();
  for (const product of products) {
    if (productIds.has(product.id)) {
      throw new Error(
        `Showcase Mode CSV contains duplicate serial number "${product.id.slice(4)}".`,
      );
    }
    productIds.add(product.id);
  }

  return new ShowcaseCatalog(products);
}
