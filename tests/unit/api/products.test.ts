import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
}));

vi.mock("../../../apps/api/src/db/pool.js", () => ({
  pool: { query: queryMock },
}));

import productRoutes from "../../../apps/api/src/routes/products.js";

describe("product details response", () => {
  beforeEach(() => {
    queryMock.mockReset().mockResolvedValueOnce({
      rows: [
        {
          id: "52c9da92-8dc3-512f-b24b-ec1caa3c3248",
          name: "Sunfeast Baked Creations Rich Choco Chip Cookies",
          brand: "SUNFEAST",
          ingredients: null,
          price_inr: "25.00",
          image_url: "https://images.example.com/cookies.jpg",
          categories: [],
          kcal_per_100g: "105.00",
          fat_g: "5.5",
          saturated_fat_g: null,
          trans_fat_g: null,
          carbohydrates_g: "12.6",
          sugars_g: "6.8",
          fibre_g: null,
          protein_g: "1.2",
          sodium_mg: "35.1",
          salt_g: null,
          cholesterol_mg: "1",
          calcium_mg: "0",
          iron_mg: "0",
          vitamins: "0",
          serving_size: "20.0",
          serving_unit: "g",
          nutrition_basis: "per_serving",
        },
      ],
    });
  });

  it("returns price, serving values, and supported nutrients without inventing a missing basis", async () => {
    const app = Fastify();
    await app.register(productRoutes, { prefix: "/products" });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/products/52c9da92-8dc3-512f-b24b-ec1caa3c3248",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        name: "Sunfeast Baked Creations Rich Choco Chip Cookies",
        imageUrl: "https://images.example.com/cookies.jpg",
        priceInr: 25,
        nutrition: {
          basis: "perServing",
          kcalPer100g: "105.00",
          carbohydratesG: "12.6",
          servingSize: "20.0",
          servingUnit: "g",
          cholesterolMg: "1",
          calciumMg: "0",
          ironMg: "0",
          vitamins: "0",
        },
      });
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("p.price_inr"),
        [["52c9da92-8dc3-512f-b24b-ec1caa3c3248"]],
      );
      expect(queryMock.mock.calls[0][0]).toContain("p.image_url");
      expect(queryMock.mock.calls[0][0]).not.toContain('"Nutrition"');
      expect(queryMock.mock.calls[0][0]).not.toContain("ProductImages");

      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: "52c9da92-8dc3-512f-b24b-ec1caa3c3248",
            name: "Product with no nutrition basis",
            price_inr: null,
            nutrition_basis: null,
          },
        ],
      });
      const missingBasis = await app.inject({
        method: "GET",
        url: "/products/52c9da92-8dc3-512f-b24b-ec1caa3c3248",
      });

      expect(missingBasis.statusCode).toBe(200);
      expect(missingBasis.json().nutrition.basis).toBe("unknown");

      const invalidId = await app.inject({
        method: "GET",
        url: "/products/not-a-uuid",
      });
      expect(invalidId.statusCode).toBe(400);
      expect(invalidId.json()).toMatchObject({ error: "INVALID_PRODUCT_ID" });
      expect(queryMock).toHaveBeenCalledTimes(2);
    } finally {
      await app.close();
    }
  });
});
