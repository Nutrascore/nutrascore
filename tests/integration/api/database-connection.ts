import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { loadEnvFile } from "node:process";

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
      "Set NUTRASCORE_TEST_DATABASE_URL to the dedicated nutrascore_test PostgreSQL database.",
    );
  }
  if (databaseName(testDatabaseUrl) !== "nutrascore_test") {
    throw new Error(
      "Integration tests only run against the dedicated nutrascore_test database.",
    );
  }

  const developmentDatabaseUrl = process.env.DATABASE_URL;
  if (
    developmentDatabaseUrl &&
    databaseAddress(testDatabaseUrl) === databaseAddress(developmentDatabaseUrl)
  ) {
    throw new Error(
      "NUTRASCORE_TEST_DATABASE_URL points to DATABASE_URL; use a separate test database.",
    );
  }

  process.env.DATABASE_URL = testDatabaseUrl;
  const [{ pool }, { default: productRoutes }] = await Promise.all([
    import("../../../apps/api/src/db/pool.js"),
    import("../../../apps/api/src/routes/products.js"),
  ]);
  const productId = randomUUID();
  let productInserted = false;
  let app: ReturnType<typeof Fastify> | undefined;

  try {
    const connection = await pool.query<{ connected: number }>(
      "SELECT 1 AS connected",
    );
    assert.equal(connection.rows[0]?.connected, 1);

    const productName = `Integration test product ${productId}`;
    await pool.query(
      'INSERT INTO "Products" (id, name, price_inr) VALUES ($1, $2, $3)',
      [productId, productName, "17.50"],
    );
    productInserted = true;

    app = Fastify();
    await app.register(productRoutes, { prefix: "/api/products" });
    const response = await app.inject({
      method: "GET",
      url: `/api/products/${productId}`,
    });

    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().id, productId);
    assert.equal(response.json().name, productName);
    assert.equal(response.json().priceInr, 17.5);
    console.log("PostgreSQL connection and API product retrieval succeeded.");
  } finally {
    try {
      if (app) await app.close();
    } finally {
      try {
        if (productInserted) {
          await pool.query('DELETE FROM "Products" WHERE id = $1', [productId]);
        }
      } finally {
        await pool.end();
      }
    }
  }
}

function databaseName(connectionString: string): string {
  const url = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("NUTRASCORE_TEST_DATABASE_URL must be a PostgreSQL URL.");
  }
  return decodeURIComponent(url.pathname.slice(1));
}

function databaseAddress(connectionString: string): string {
  const url = new URL(connectionString);
  return `${url.hostname.toLowerCase()}:${url.port || "5432"}${decodeURIComponent(url.pathname)}`;
}

main().catch((error: unknown) => {
  console.error("PostgreSQL integration check failed:", error);
  process.exitCode = 1;
});
