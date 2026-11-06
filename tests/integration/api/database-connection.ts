import { createHash, randomBytes, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { loadEnvFile } from "node:process";
import type { Pool } from "pg";
import type { ProductQueryRow } from "../../../apps/api/src/db/product-query.js";

const requireApi = createRequire(
  new URL("../../../apps/api/package.json", import.meta.url),
);
const Fastify = requireApi("fastify") as typeof import("fastify");

async function main() {
  for (const environmentFile of ["../../.env", ".env"]) {
    if (existsSync(environmentFile)) loadEnvFile(environmentFile);
  }
  const testDatabaseUrl = process.env.NUTRASCORE_TEST_DATABASE_URL;
  if (!testDatabaseUrl) {
    throw new Error(
      "Set NUTRASCORE_TEST_DATABASE_URL to a dedicated migrated test database; integration tests create and delete test records.",
    );
  }
  const developmentDatabaseUrl = process.env.DATABASE_URL;
  if (
    developmentDatabaseUrl &&
    databaseAddress(testDatabaseUrl) === databaseAddress(developmentDatabaseUrl)
  ) {
    throw new Error(
      "NUTRASCORE_TEST_DATABASE_URL points to the configured development database; use a separate test database.",
    );
  }
  process.env.DATABASE_URL = testDatabaseUrl;
  const [
    { pool },
    { hashPassword },
    { default: moderatorRoutes },
    { default: productRoutes },
    { default: searchRoutes },
    { default: compareRoutes },
    { default: categoryRoutes },
    productQuery,
  ] = await Promise.all([
    import("../../../apps/api/src/db/pool.js"),
    import("../../../apps/api/src/auth.js"),
    import("../../../apps/api/src/routes/moderator.js"),
    import("../../../apps/api/src/routes/products.js"),
    import("../../../apps/api/src/routes/search.js"),
    import("../../../apps/api/src/routes/compare.js"),
    import("../../../apps/api/src/routes/categories.js"),
    import("../../../apps/api/src/db/product-query.js"),
  ]);

  const userId = randomUUID();
  const email = `integration-${userId}@example.invalid`;
  let userCreated = false;
  let productId: string | undefined;
  let temporaryComparisonProductId: string | undefined;
  const categoryIds: string[] = [];
  let app: ReturnType<typeof Fastify> | undefined;
  try {
    const expectedTables = [
      "Products",
      "categories",
      "product_categories",
      "Users",
      "user_sessions",
    ];
    const tables = await pool.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_type = 'BASE TABLE'
         AND table_name <> '__drizzle_migrations'`,
    );
    const foundTables = new Set(
      tables.rows.map(({ table_name }) => table_name),
    );
    const missingTables = expectedTables.filter(
      (name) => !foundTables.has(name),
    );
    if (missingTables.length > 0) {
      throw new Error(
        `Required application tables are missing: ${missingTables.join(", ")}.`,
      );
    }

    const products = await pool.query<{ id: string }>(
      'SELECT id FROM "Products" ORDER BY id LIMIT 1',
    );
    const productIds = products.rows.map(({ id }) => id);
    const details = await pool.query<ProductQueryRow>(
      productQuery.PRODUCT_DETAILS_QUERY,
      [productIds],
    );
    if (details.rowCount !== productIds.length) {
      throw new Error(
        "The shared product-detail query returned an unexpected number of rows.",
      );
    }
    if (
      details.rows[0] &&
      productQuery.mapProduct(details.rows[0]).id !== details.rows[0].id
    ) {
      throw new Error(
        "The product detail mapper returned an unexpected product ID.",
      );
    }

    const passwordHash = await hashPassword(
      randomBytes(24).toString("base64url"),
    );
    await pool.query(
      `INSERT INTO "Users" (id, name, email, password_hash, role)
       VALUES ($1, 'Database Integration Moderator', $2, $3, 'moderator')`,
      [userId, email, passwordHash],
    );
    userCreated = true;
    const sessionToken = randomBytes(32).toString("base64url");
    const sessionHash = createHash("sha256").update(sessionToken).digest("hex");
    await pool.query(
      `INSERT INTO user_sessions (id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour')`,
      [randomUUID(), userId, sessionHash],
    );

    app = Fastify();
    await app.register(productRoutes, { prefix: "/api/products" });
    await app.register(searchRoutes, { prefix: "/api/products" });
    await app.register(compareRoutes, { prefix: "/api/compare" });
    await app.register(categoryRoutes, { prefix: "/api/categories" });
    await app.register(moderatorRoutes, { prefix: "/api/moderator" });
    const headers = {
      cookie: `nutrascore_session=${sessionToken}; nutrascore_csrf=integration-csrf`,
      "x-csrf-token": "integration-csrf",
    };
    const created = await app.inject({
      method: "POST",
      url: "/api/moderator/products",
      headers,
      payload: {
        name: `Database integration product ${userId}`,
        brand: "NutraScore Test",
        priceInr: "17.50",
        nutrition: { basis: "unknown" },
      },
    });
    assert.equal(created.statusCode, 200, created.body);
    productId = created.json().id as string;

    const updated = await app.inject({
      method: "PUT",
      url: `/api/moderator/products/${productId}/details`,
      headers,
      payload: {
        name: `Database integration product ${userId}`,
        brand: "NutraScore Test",
        priceInr: "19.25",
        nutrition: {
          basis: "perServing",
          kcalPer100g: "125",
          servingSize: "30",
          servingUnit: "g",
        },
      },
    });
    assert.equal(updated.statusCode, 200, updated.body);

    const detailResponse = await app.inject({
      method: "GET",
      url: `/api/products/${productId}`,
    });
    assert.equal(detailResponse.statusCode, 200, detailResponse.body);
    assert.equal(detailResponse.json().nutrition.kcalPer100g, "125");

    const searchResponse = await app.inject({
      method: "GET",
      url: `/api/products/search?q=${encodeURIComponent(`Database integration product ${userId}`)}&pageSize=1`,
    });
    assert.equal(searchResponse.statusCode, 200, searchResponse.body);
    assert.equal(searchResponse.json().products[0].id, productId);

    const autocompleteResponse = await app.inject({
      method: "GET",
      url: `/api/products/autocomplete?q=${encodeURIComponent(`Database integration product ${userId}`)}`,
    });
    assert.equal(autocompleteResponse.statusCode, 200, autocompleteResponse.body);
    assert.equal(autocompleteResponse.json().suggestions[0].id, productId);

    const moderatorDetails = await app.inject({
      method: "GET",
      url: `/api/moderator/products/${productId}`,
      headers,
    });
    assert.equal(moderatorDetails.statusCode, 200, moderatorDetails.body);
    assert.equal(moderatorDetails.json().nutrition.kcalPer100g, "125");

    const moderatorList = await app.inject({
      method: "GET",
      url: `/api/moderator/products?q=${encodeURIComponent(`Database integration product ${userId}`)}&pageSize=1`,
      headers,
    });
    assert.equal(moderatorList.statusCode, 200, moderatorList.body);
    assert.equal(moderatorList.json().products[0].id, productId);

    const otherProduct = await pool.query<{ id: string }>(
      'SELECT id FROM "Products" WHERE id <> $1 ORDER BY id LIMIT 1',
      [productId],
    );
    let comparisonProductId = otherProduct.rows[0]?.id;
    if (!comparisonProductId) {
      comparisonProductId = randomUUID();
      temporaryComparisonProductId = comparisonProductId;
      await pool.query(
        'INSERT INTO "Products" (id, name) VALUES ($1, $2)',
        [comparisonProductId, `Comparison integration product ${userId}`],
      );
    }
    const compareResponse = await app.inject({
      method: "GET",
      url: `/api/compare?ids=${productId},${comparisonProductId}`,
    });
    assert.equal(compareResponse.statusCode, 200, compareResponse.body);
    assert.deepEqual(
      compareResponse.json().products.map((product: { id: string }) => product.id),
      [productId, comparisonProductId],
    );

    const persisted = await pool.query<{
      price_inr: string;
      kcal_per_100g: string;
      nutrition_basis: string;
      serving_size: string;
    }>(
      `SELECT price_inr, kcal_per_100g, nutrition_basis, serving_size
       FROM "Products" WHERE id = $1`,
      [productId],
    );
    assert.deepEqual(persisted.rows[0], {
      price_inr: "19.25",
      kcal_per_100g: "125",
      nutrition_basis: "per_serving",
      serving_size: "30",
    });

    const categoryId = randomUUID();
    categoryIds.push(categoryId);
    await pool.query(
      "INSERT INTO categories (id, name) VALUES ($1, $2)",
      [categoryId, `Integration category ${userId}`],
    );
    await pool.query(
      "INSERT INTO product_categories (product_id, category_id) VALUES ($1, $2)",
      [productId, categoryId],
    );
    const categoriesResponse = await app.inject({
      method: "GET",
      url: "/api/categories",
    });
    assert.equal(categoriesResponse.statusCode, 200, categoriesResponse.body);
    assert.equal(
      categoriesResponse.json().categories.some(
        (category: { id: string }) => category.id === categoryId,
      ),
      true,
    );
    const categoryProductsResponse = await app.inject({
      method: "GET",
      url: `/api/categories/${categoryId}/products`,
    });
    assert.equal(categoryProductsResponse.statusCode, 200, categoryProductsResponse.body);
    assert.equal(categoryProductsResponse.json().products[0].id, productId);
    await pool.query("DELETE FROM categories WHERE id = $1", [categoryId]);
    const categoryDeleteCheck = await pool.query<{
      product_exists: boolean;
      relation_exists: boolean;
    }>(
      `SELECT
         EXISTS (SELECT 1 FROM "Products" WHERE id = $1) AS product_exists,
         EXISTS (SELECT 1 FROM product_categories WHERE product_id = $1) AS relation_exists`,
      [productId],
    );
    assert.deepEqual(categoryDeleteCheck.rows[0], {
      product_exists: true,
      relation_exists: false,
    });

    const retainedCategoryId = randomUUID();
    categoryIds.push(retainedCategoryId);
    await pool.query(
      "INSERT INTO categories (id, name) VALUES ($1, $2)",
      [retainedCategoryId, `Retained integration category ${userId}`],
    );
    await pool.query(
      "INSERT INTO product_categories (product_id, category_id) VALUES ($1, $2)",
      [productId, retainedCategoryId],
    );

    const legacyTableResult = await pool.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_type = 'BASE TABLE'
         AND table_name IN ('Nutrition', 'ProductImages')`,
    );
    const legacyTables = new Set(
      legacyTableResult.rows.map(({ table_name }) => table_name),
    );
    if (legacyTables.has("Nutrition")) {
      await pool.query(
        `INSERT INTO "Nutrition" (id, product_id)
         VALUES ($1, $2)`,
        [randomUUID(), productId],
      );
    }
    if (legacyTables.has("ProductImages")) {
      await pool.query(
        `INSERT INTO "ProductImages" (id, product_id, image_url, is_primary)
         VALUES ($1, $2, 'https://example.invalid/integration.jpg', true)`,
        [randomUUID(), productId],
      );
    }

    const deleted = await app.inject({
      method: "DELETE",
      url: `/api/moderator/products/${productId}`,
      headers,
      payload: {},
    });
    assert.equal(deleted.statusCode, 200, deleted.body);
    const relationAfterProductDelete = await pool.query<{
      relation_exists: boolean;
      category_exists: boolean;
    }>(
      `SELECT
         EXISTS (SELECT 1 FROM product_categories WHERE product_id = $1) AS relation_exists,
         EXISTS (SELECT 1 FROM categories WHERE id = $2) AS category_exists`,
      [productId, retainedCategoryId],
    );
    assert.deepEqual(relationAfterProductDelete.rows[0], {
      relation_exists: false,
      category_exists: true,
    });
    if (legacyTables.has("Nutrition")) {
      const nutritionRow = await pool.query(
        'SELECT 1 FROM "Nutrition" WHERE product_id = $1',
        [productId],
      );
      assert.equal(nutritionRow.rowCount, 0);
    }
    if (legacyTables.has("ProductImages")) {
      const imageRow = await pool.query(
        'SELECT 1 FROM "ProductImages" WHERE product_id = $1',
        [productId],
      );
      assert.equal(imageRow.rowCount, 0);
    }
    productId = undefined;

    console.log(
      `Target schema, moderator CRUD, category deletion, and product deletion (${legacyTables.size ? "legacy tables present" : "legacy tables absent"}) integration succeeded.`,
    );
  } finally {
    try {
      if (app) await app.close();
      if (productId) {
        await deleteLegacyProductRows(pool, productId);
        await pool.query(
          "DELETE FROM product_categories WHERE product_id = $1",
          [productId],
        );
        await pool.query('DELETE FROM "Products" WHERE id = $1', [productId]);
      }
      for (const categoryId of categoryIds) {
        await pool.query("DELETE FROM categories WHERE id = $1", [categoryId]);
      }
      if (temporaryComparisonProductId) {
        await pool.query(
          'DELETE FROM "Products" WHERE id = $1',
          [temporaryComparisonProductId],
        );
      }
      if (userCreated) {
        await pool.query('DELETE FROM "Users" WHERE id = $1', [userId]);
      }
    } finally {
      await pool.end();
    }
  }
}

function databaseAddress(connectionString: string): string {
  const url = new URL(connectionString);
  return `${url.hostname.toLowerCase()}:${url.port || "5432"}${decodeURIComponent(url.pathname)}`;
}

async function deleteLegacyProductRows(
  pool: Pool,
  productId: string,
): Promise<void> {
  const legacyTables = [
    { tableName: "ProductImages", tableRef: '"ProductImages"' },
    { tableName: "Nutrition", tableRef: '"Nutrition"' },
    { tableName: "product_image_reviews", tableRef: "product_image_reviews" },
    { tableName: "product_image_sources", tableRef: "product_image_sources" },
    { tableName: "product_allergens", tableRef: "product_allergens" },
    { tableName: "product_barcode_sources", tableRef: "product_barcode_sources" },
  ];
  for (const { tableName, tableRef } of legacyTables) {
    const result = await pool.query(
      `SELECT EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = $1
           AND column_name = 'product_id'
       ) AS has_product_id`,
      [tableName],
    );
    if (result.rows[0]?.has_product_id) {
      await pool.query(`DELETE FROM ${tableRef} WHERE product_id = $1`, [productId]);
    }
  }
}

main().catch((error: unknown) => {
  console.error("PostgreSQL integration check failed:", error);
  process.exitCode = 1;
});
