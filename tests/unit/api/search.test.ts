import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
}));

vi.mock("../../../apps/api/src/db/pool.js", () => ({
  pool: { query: queryMock },
}));

import searchRoutes from "../../../apps/api/src/routes/search.js";

describe("product search", () => {
  it("filters by search term and category, paginates, and rejects invalid pages", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: "product-1",
            name: "Choco Chips",
            brand: "Example",
            price_inr: "25.00",
            category_name: "Snacks",
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
        url: "/products/search?q=chips&categories=Snacks&pageSize=24&offset=24",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        products: [
          {
            id: "product-1",
            name: "Choco Chips",
            priceInr: 25,
            category: "Snacks",
          },
        ],
        total: 1,
        page: 2,
        pageSize: 24,
      });

      const [query, values] = queryMock.mock.calls[0];
      expect(query).toContain("p.name ILIKE");
      expect(query).toContain("LOWER(TRIM(c.name)) = ANY($4::text[])");
      expect(values).toEqual([
        "%chips%",
        "chips",
        "chips%",
        ["snacks"],
        24,
        24,
      ]);

      const invalidPage = await app.inject({
        method: "GET",
        url: "/products/search?page=0",
      });
      expect(invalidPage.statusCode).toBe(400);
      expect(queryMock).toHaveBeenCalledTimes(2);
    } finally {
      await app.close();
    }
  });
});
