import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
}));

vi.mock("../../../apps/api/src/db/pool.js", () => ({
  pool: { query: queryMock },
}));

import categoryRoutes from "../../../apps/api/src/routes/categories.js";

describe("category product browsing", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("returns category products with inline nutrition and an unknown basis when absent", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ id: "category-id", name: "Snacks", description: null }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "product-id",
            name: "Example snack",
            brand: "Example",
            price_inr: "24.00",
            kcal_per_100g: "125",
            nutrition_basis: null,
            image_url: null,
            category_name: "Snacks",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ total: 1 }] });

    const app = Fastify();
    await app.register(categoryRoutes, { prefix: "/categories" });
    try {
      const response = await app.inject({
        method: "GET",
        url: "/categories/category-id/products",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        category: { id: "category-id", name: "Snacks" },
        products: [
          {
            id: "product-id",
            priceInr: 24,
            nutrition: {
              kcalPer100g: "125",
              basis: "unknown",
            },
          },
        ],
        total: 1,
      });
      expect(queryMock.mock.calls[1][0]).toContain("p.kcal_per_100g");
      expect(queryMock.mock.calls[1][0]).not.toContain('"Nutrition"');
    } finally {
      await app.close();
    }
  });
});
