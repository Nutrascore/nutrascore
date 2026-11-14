import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
}));

vi.mock("../../../apps/api/src/db/database.js", () => ({ query: queryMock }));

import productRoutes from "../../../apps/api/src/routes/products.js";

describe("product API integration", () => {
  it("returns a product through the Fastify route", async () => {
    queryMock.mockResolvedValue({
      rows: [
        {
          id: "52c9da92-8dc3-512f-b24b-ec1caa3c3248",
          name: "Choco Chip Cookies",
          brand: "Example",
          ingredients: null,
          price_inr: "25.00",
          image_url: "https://images.example.com/cookies.jpg",
          categories: [],
          nutrition_basis: "per_100g",
        },
      ],
    });

    const app = Fastify();
    await app.register(productRoutes, { prefix: "/api/products" });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/products/52c9da92-8dc3-512f-b24b-ec1caa3c3248",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        id: "52c9da92-8dc3-512f-b24b-ec1caa3c3248",
        name: "Choco Chip Cookies",
        brand: "Example",
        imageUrl: "https://images.example.com/cookies.jpg",
        priceInr: 25,
        categories: [],
        nutrition: { basis: "per100g" },
      });
    } finally {
      await app.close();
    }
  });
});
