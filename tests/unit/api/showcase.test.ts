import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createShowcaseApp } from "../../../apps/api/src/showcase-app.js";
import {
  loadShowcaseCatalog,
  type ShowcaseCatalog,
} from "../../../apps/api/src/showcase-data.js";

const csvPath = fileURLToPath(
  new URL(
    "../../../data/processed/packaged_foods_india_cleaned.csv",
    import.meta.url,
  ),
);
const imageManifestPath = fileURLToPath(
  new URL(
    "../../../data/processed/showcase-image-manifest.json",
    import.meta.url,
  ),
);
let catalog: ShowcaseCatalog;
let app: FastifyInstance;

beforeAll(async () => {
  await access(csvPath);
  catalog = await loadShowcaseCatalog(csvPath, imageManifestPath);
  app = await createShowcaseApp(catalog);
});

afterAll(async () => {
  await app?.close();
});

describe("CSV Showcase Mode", () => {
  it("loads the processed dataset and preserves price, serving size, and unknown nutrition basis", async () => {
    expect(catalog.products).toHaveLength(852);
    const product = catalog.getProduct("csv-1");
    expect(product).toMatchObject({
      priceInr: 30,
      nutrition: {
        basis: "unknown",
        servingSize: "100.0",
        servingUnit: "g",
        kcalPer100g: "479.0",
      },
    });
    expect(catalog.getProduct("csv-7")?.priceInr).toBeNull();
  });

  it("populates imageUrl from the image manifest for matched products and null for unmatched", async () => {
    // csv-1 (HIDE & SEEK by PARLE) has a verified match in the manifest.
    const matched = catalog.getProduct("csv-1");
    expect(matched?.imageUrl).toBeTypeOf("string");
    expect(matched?.imageUrl).toMatch(/^https:\/\//);

    // csv-2 (Britannia Nutrichoice Digestive) also has a match.
    const matched2 = catalog.getProduct("csv-2");
    expect(matched2?.imageUrl).toBeTypeOf("string");

    // csv-23 (Britannia Milk Bikis) is ambiguous in the manifest (two DB
    // records with different nutrition data share the same name+brand) and
    // must be left unmatched to avoid assigning the wrong image.
    const unmatched = catalog.getProduct("csv-23");
    expect(unmatched?.imageUrl).toBeNull();

    // csv-60 is the second Milk Bikis duplicate and must also be null.
    const unmatched2 = catalog.getProduct("csv-60");
    expect(unmatched2?.imageUrl).toBeNull();

    // Products in the manifest must expose their imageUrl through every
    // public-facing response shape.
    const detail = await app.inject({
      method: "GET",
      url: "/api/products/csv-1",
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().imageUrl).toBeTypeOf("string");
    expect(detail.json().imageUrl).toBe(matched?.imageUrl);

    const listing = await app.inject({
      method: "GET",
      url: "/api/products/search?q=hide+%26+seek",
    });
    expect(listing.statusCode).toBe(200);
    const listingProduct = listing
      .json()
      .products.find((p: { id: string }) => p.id === "csv-1");
    expect(listingProduct?.imageUrl).toBe(matched?.imageUrl);

    const comparison = await app.inject({
      method: "GET",
      url: "/api/compare?ids=csv-1,csv-2",
    });
    expect(comparison.statusCode).toBe(200);
    const cmp1 = comparison
      .json()
      .products.find((p: { id: string }) => p.id === "csv-1");
    expect(cmp1?.imageUrl).toBe(matched?.imageUrl);

    // An unmatched product must return null (not an invented URL) so the
    // frontend falls back to the existing placeholder.
    const unmatchedDetail = await app.inject({
      method: "GET",
      url: "/api/products/csv-23",
    });
    expect(unmatchedDetail.statusCode).toBe(200);
    expect(unmatchedDetail.json().imageUrl).toBeNull();
  });

  it("supports listing, text search, category filtering, details, and two-product comparison", async () => {
    const listing = await app.inject({
      method: "GET",
      url: "/api/products/search?page=1&pageSize=5",
    });
    expect(listing.statusCode).toBe(200);
    expect(listing.json().products).toHaveLength(5);
    expect(listing.json().total).toBe(852);

    const secondPage = await app.inject({
      method: "GET",
      url: "/api/products/search?page=2&pageSize=5",
    });
    expect(secondPage.statusCode).toBe(200);
    expect(secondPage.json().products[0].id).not.toBe(
      listing.json().products[0].id,
    );

    const search = await app.inject({
      method: "GET",
      url: "/api/products/search?q=britannia",
    });
    expect(search.statusCode).toBe(200);
    expect(search.json().products.length).toBeGreaterThan(0);
    expect(
      search
        .json()
        .products.every((product: { brand: string }) =>
          /britannia/i.test(product.brand),
        ),
    ).toBe(true);

    const autocomplete = await app.inject({
      method: "GET",
      url: "/api/products/autocomplete?q=brit",
    });
    expect(autocomplete.statusCode).toBe(200);
    expect(autocomplete.json().suggestions.length).toBeGreaterThan(0);

    const filtered = await app.inject({
      method: "GET",
      url: "/api/products/search?categories=biscuit",
    });
    expect(filtered.statusCode).toBe(200);
    expect(filtered.json().products.length).toBeGreaterThan(0);
    expect(
      filtered
        .json()
        .products.every(
          (product: { category: string }) => product.category === "BISCUIT",
        ),
    ).toBe(true);

    const detail = await app.inject({
      method: "GET",
      url: "/api/products/csv-1",
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().id).toBe("csv-1");

    const comparison = await app.inject({
      method: "GET",
      url: "/api/compare?ids=csv-1,csv-2",
    });
    expect(comparison.statusCode).toBe(200);
    expect(
      comparison.json().products.map((product: { id: string }) => product.id),
    ).toEqual(["csv-1", "csv-2"]);
  });

  it("returns categories and a clear error for a missing CSV", async () => {
    const categories = await app.inject({
      method: "GET",
      url: "/api/categories",
    });
    expect(categories.statusCode).toBe(200);
    expect(categories.json().categories.length).toBeGreaterThan(0);

    const missingCsvPath = fileURLToPath(
      new URL("../../../data/processed/missing-showcase.csv", import.meta.url),
    );
    await expect(loadShowcaseCatalog(missingCsvPath)).rejects.toThrow(
      "Unable to read Showcase Mode CSV",
    );
  });

  it("works without the image manifest: loads products with imageUrl null and does not throw", async () => {
    // Demonstrate PostgreSQL-independence: catalog loads from CSV alone.
    const catalogWithoutManifest = await loadShowcaseCatalog(csvPath);
    expect(catalogWithoutManifest.products).toHaveLength(852);
    // Without a manifest every product has no image URL.
    expect(
      catalogWithoutManifest.products.every((p) => p.imageUrl === null),
    ).toBe(true);
  });
});
