import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
}));

vi.mock("../../../apps/api/src/db/database.js", () => ({ query: queryMock }));

import searchRoutes from "../../../apps/api/src/routes/search.js";

describe("product search", () => {
  it("returns products matching the search term", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: "product-1",
            name: "Choco Chips",
            brand: "Example",
            price_inr: "25.00",
            category_name: null,
            nutrition_basis: "per_100g",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ total: 1 }] });

    const app = Fastify();
    await app.register(searchRoutes, { prefix: "/products" });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/products/search?q=chips",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        products: [
          {
            id: "product-1",
            name: "Choco Chips",
            priceInr: 25,
            category: null,
          },
        ],
        total: 1,
      });

      const [query, values] = queryMock.mock.calls[0];
      expect(query).toContain("LOWER(p.name) LIKE LOWER(");
      expect(values).toContain("%chips%");
      expect(queryMock).toHaveBeenCalledTimes(2);
    } finally {
      await app.close();
    }
  });
});
