
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { DuckDBInstance } from "@duckdb/node-api";

import {
  products,
  productImages,
  categories,
  productCategories,
  nutrition,
  allergens,
  productAllergens,
} from "./schema.js";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool);

const DATA_DIR = "../../data/processed/india_v1";

async function main() {
  console.log("Starting NutraScore V1 import...\n");

  const instance = await DuckDBInstance.create();
  const connection = await instance.connect();

  try {
    // --------------------------------------------------
    // 1. Categories
    // --------------------------------------------------
    console.log("Importing categories...");

    const categoryResult = await connection.runAndReadAll(`
      SELECT id, name, description
      FROM '${DATA_DIR}/categories.parquet'
    `);

    const categoryRows = categoryResult.getRows();

    for (const row of categoryRows) {
      await db
        .insert(categories)
        .values({
          id: row[0]!.toString(),
          name: row[1]!.toString(),
          description: row[2] == null ? null : row[2].toString(),
        })
        .onConflictDoNothing();
    }

    console.log(`  ${categoryRows.length} categories imported.`);

    // --------------------------------------------------
    // 2. Allergens
    // --------------------------------------------------
    console.log("Importing allergens...");

    const allergenResult = await connection.runAndReadAll(`
      SELECT id, name
      FROM '${DATA_DIR}/allergens.parquet'
    `);

    const allergenRows = allergenResult.getRows();

    for (const row of allergenRows) {
      await db
        .insert(allergens)
        .values({
          id: row[0]!.toString(),
          name: row[1]!.toString(),
        })
        .onConflictDoNothing();
    }

    console.log(`  ${allergenRows.length} allergens imported.`);

    // --------------------------------------------------
    // 3. Products
    // --------------------------------------------------
    console.log("Importing products...");

    const productResult = await connection.runAndReadAll(`
      SELECT
        id,
        name,
        brand,
        barcode,
        img_url,
        ingredients,
        nutri_score,
        nova_group,
        created_at,
        updated_at
      FROM '${DATA_DIR}/products.parquet'
    `);

    const productRows = productResult.getRows();

    for (const row of productRows) {
      await db
        .insert(products)
        .values({
          id: row[0]!.toString(),
          name: row[1]!.toString(),
          brand: row[2] == null ? null : row[2].toString(),
          barcode: row[3] == null ? null : row[3].toString(),
          ingredients: row[5] == null ? null : row[5].toString(),
          nutriScore: row[6] == null ? null : row[6].toString(),
          novaGroup: row[7] == null ? null : Number(row[7]),
          createdAt: new Date(row[8]!.toString()),
          updatedAt: new Date(row[9]!.toString()),
        })
        .onConflictDoNothing();
    }

    console.log(`  ${productRows.length} products imported.`);

    // --------------------------------------------------
    // 4. Product Images
    // --------------------------------------------------
    console.log("Importing product images...");

    let imageCount = 0;

    for (const row of productRows) {
      const productId = row[0]!.toString();
      const imageUrl = row[4] == null ? null : row[4].toString();

      if (!imageUrl) {
        continue;
      }

      await db
        .insert(productImages)
        .values({
          id: crypto.randomUUID(),
          productId,
          imageUrl,
          imageType: "product",
          isPrimary: true,
        })
        .onConflictDoNothing();

      imageCount++;
    }

    console.log(`  ${imageCount} product images imported.`);

    // --------------------------------------------------
    // 5. Nutrition
    // --------------------------------------------------
    console.log("Importing nutrition...");

    const nutritionResult = await connection.runAndReadAll(`
      SELECT
        id,
        product_id,
        kcal_per_100g,
        fat_g,
        saturated_fat_g,
        trans_fat_g,
        carbohydrates_g,
        sugars_g,
        fibre_g,
        protein_g,
        sodium_mg,
        salt_g
      FROM '${DATA_DIR}/nutrition.parquet'
    `);

    const nutritionRows = nutritionResult.getRows();

    for (const row of nutritionRows) {
      await db
        .insert(nutrition)
        .values({
          id: row[0]!.toString(),
          productId: row[1]!.toString(),
          kcalPer100g: row[2] == null ? null : row[2].toString(),
          fatG: row[3] == null ? null : row[3].toString(),
          saturatedFatG: row[4] == null ? null : row[4].toString(),
          transFatG: row[5] == null ? null : row[5].toString(),
          carbohydratesG: row[6] == null ? null : row[6].toString(),
          sugarsG: row[7] == null ? null : row[7].toString(),
          fibreG: row[8] == null ? null : row[8].toString(),
          proteinG: row[9] == null ? null : row[9].toString(),
          sodiumMg: row[10] == null ? null : row[10].toString(),
          saltG: row[11] == null ? null : row[11].toString(),
        })
        .onConflictDoNothing();
    }

    console.log(`  ${nutritionRows.length} nutrition records imported.`);

    // --------------------------------------------------
    // 6. Product Categories
    // --------------------------------------------------
    console.log("Importing product categories...");

    const productCategoryResult = await connection.runAndReadAll(`
      SELECT product_id, category_id
      FROM '${DATA_DIR}/product_categories.parquet'
    `);

    const productCategoryRows = productCategoryResult.getRows();

    for (const row of productCategoryRows) {
      await db
        .insert(productCategories)
        .values({
          productId: row[0]!.toString(),
          categoryId: row[1]!.toString(),
        })
        .onConflictDoNothing();
    }

    console.log(
      `  ${productCategoryRows.length} product-category relationships imported.`,
    );

    // --------------------------------------------------
    // 7. Product Allergens
    // --------------------------------------------------
    console.log("Importing product allergens...");

    const productAllergenResult = await connection.runAndReadAll(`
      SELECT product_id, allergen_id
      FROM '${DATA_DIR}/product_allergens.parquet'
    `);

    const productAllergenRows = productAllergenResult.getRows();

    for (const row of productAllergenRows) {
      await db
        .insert(productAllergens)
        .values({
          productId: row[0]!.toString(),
          allergenId: row[1]!.toString(),
        })
        .onConflictDoNothing();
    }

    console.log(
      `  ${productAllergenRows.length} product-allergen relationships imported.`,
    );

    console.log("\n================================");
    console.log("NutraScore V1 import complete!");
    console.log("================================");
  } finally {
    connection.closeSync();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("\nImport failed:");
  console.error(error);
  process.exit(1);
});

