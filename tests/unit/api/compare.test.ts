import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
}));

vi.mock("../../../apps/api/src/db/database.js", () => ({ query: queryMock }));

import compareRoutes from "../../../apps/api/src/routes/compare.js";

const firstId = "52c9da92-8dc3-512f-b24b-ec1caa3c3248";
const secondId = "52c9da92-8dc3-512f-b24b-ec1caa3c3249";

function comparisonRow(id: string, name: string) {
  return {
    id,
    name,
    brand: "Example",
    ingredients: null,
    price_inr: "10.00",
    image_url: "https://images.example.com/product.jpg",
    categories: [],
    nutrition_basis: "per_100g",
  };
}

describe("product comparison API", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("returns exactly two products in the requested order", async () => {
    queryMock.mockResolvedValue({
      rows: [
        comparisonRow(firstId, "First"),
        comparisonRow(secondId, "Second"),
      ],
    });

    const app = Fastify();
    await app.register(compareRoutes, { prefix: "/compare" });
    try {
      const response = await app.inject({
        method: "GET",
        url: `/compare?ids=${firstId},${secondId}`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().products).toHaveLength(2);
      expect(response.json().products.map((product: { id: string }) => product.id)).toEqual([
        firstId,
        secondId,
      ]);
      expect(response.json().products[0].imageUrl).toBe(
        "https://images.example.com/product.jpg",
      );
      expect(queryMock.mock.calls[0][0]).toContain("ORDER BY CASE p.id");
      expect(queryMock.mock.calls[0][0]).not.toContain('"Nutrition"');
      expect(queryMock.mock.calls[0][0]).not.toContain("ProductImages");
      expect(queryMock).toHaveBeenCalledWith(expect.any(String), [firstId, secondId]);
    } finally {
      await app.close();
    }
  });

});
