import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { clientQueryMock, connectMock, lookupMock, releaseMock } = vi.hoisted(() => ({
  clientQueryMock: vi.fn(),
  connectMock: vi.fn(),
  lookupMock: vi.fn(),
  releaseMock: vi.fn(),
}));

vi.mock("../../../apps/api/src/db/pool.js", () => ({
  pool: {
    connect: connectMock,
    query: vi.fn(),
  },
}));

vi.mock("../../../apps/api/src/auth.js", () => ({
  requireCsrf: vi.fn(() => true),
  requireModerator: vi.fn(async () => true),
}));

vi.mock("node:dns/promises", () => ({
  lookup: lookupMock,
}));

import moderatorRoutes from "../../../apps/api/src/routes/moderator.js";

describe("moderator product image management", () => {
  const imageUrl = "https://images.example.com/product.jpg";
  const fetchMock = vi.fn();

  beforeEach(() => {
    connectMock.mockClear();
    releaseMock.mockClear();
    fetchMock.mockReset();
    clientQueryMock.mockReset().mockImplementation(async (query: string) => {
      if (query.startsWith('SELECT id, name, brand FROM "Products"')) {
        return { rows: [], rowCount: 0 };
      }
      if (query.startsWith('INSERT INTO "Products"')) {
        return { rows: [{ price_inr: "12.50" }], rowCount: 1 };
      }
      if (query.startsWith('SELECT 1 FROM "Products"')) {
        return { rows: [{}], rowCount: 1 };
      }
      if (query.startsWith('SELECT name FROM "Products"')) {
        return { rows: [{ name: "Example product" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });
    connectMock.mockResolvedValue({
      query: clientQueryMock,
      release: releaseMock,
    });
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    fetchMock.mockResolvedValue({
      ok: true,
      headers: { get: () => "image/jpeg" },
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates, edits, and deletes products using one optional image URL field", async () => {
    const app = Fastify();
    await app.register(moderatorRoutes, { prefix: "/moderator" });
    try {
      const created = await app.inject({
        method: "POST",
        url: "/moderator/products",
        payload: {
          name: "Example product",
          imageUrl,
          nutrition: {},
        },
      });

      expect(created.statusCode).toBe(200);
      expect(created.json()).toMatchObject({ imageUrl });
      const insert = clientQueryMock.mock.calls.find(([query]) =>
        query.startsWith('INSERT INTO "Products"'),
      );
      expect(insert?.[0]).toContain("image_url");
      expect(insert?.[0]).not.toContain("created_at");
      expect(insert?.[0]).toContain("nutrition_basis");
      expect(insert?.[0]).toContain("serving_size");
      expect(insert?.[0]).not.toContain('"Nutrition"');
      expect(insert?.[1]).toContain(imageUrl);
      expect(clientQueryMock.mock.calls.some(([query]) => query.includes("ProductImages"))).toBe(
        false,
      );

      const productId = created.json().id;
      const updatedUrl = "https://images.example.com/updated.jpg";
      const updated = await app.inject({
        method: "PUT",
        url: `/moderator/products/${productId}/details`,
        payload: {
          name: "Updated product",
          imageUrl: updatedUrl,
          nutrition: {},
        },
      });

      expect(updated.statusCode).toBe(200);
      const update = clientQueryMock.mock.calls.find(([query]) =>
        query.startsWith('UPDATE "Products"'),
      );
      expect(update?.[0]).toContain("image_url");
      expect(update?.[0]).not.toContain("updated_at");
      expect(update?.[0]).toContain("nutrition_basis");
      expect(update?.[0]).not.toContain('"Nutrition"');
      expect(update?.[1]).toContain(updatedUrl);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      const deleted = await app.inject({
        method: "DELETE",
        url: `/moderator/products/${productId}`,
      });

      expect(deleted.statusCode).toBe(200);
      expect(deleted.json()).toMatchObject({ ok: true, name: "Example product" });
      expect(clientQueryMock.mock.calls.some(([query]) =>
        query.includes("product_image_reviews") || query.includes("product_image_sources") ||
        query.includes('"Nutrition"'),
      )).toBe(false);
    } finally {
      await app.close();
    }
  });

  it("deletes legacy product rows before removing the product record", async () => {
    const app = Fastify();
    await app.register(moderatorRoutes, { prefix: "/moderator" });
    try {
      clientQueryMock.mockImplementation(async (query: string) => {
        if (query.startsWith('SELECT EXISTS')) {
          return { rows: [{ has_product_id: true }], rowCount: 1 };
        }
        if (query.startsWith('SELECT name FROM "Products"')) {
          return { rows: [{ name: "Legacy product" }], rowCount: 1 };
        }
        if (query.startsWith('SELECT 1 FROM "Products"')) {
          return { rows: [{}], rowCount: 1 };
        }
        return { rows: [], rowCount: 1 };
      });

      const deleted = await app.inject({
        method: "DELETE",
        url: "/moderator/products/52c9da92-8dc3-512f-b24b-ec1caa3c3248",
      });

      expect(deleted.statusCode).toBe(200);
      expect(clientQueryMock.mock.calls.some(([query]) => query.includes('DELETE FROM "ProductImages"'))).toBe(true);
      expect(clientQueryMock.mock.calls.some(([query]) => query.includes('DELETE FROM "Nutrition"'))).toBe(true);
      expect(clientQueryMock.mock.calls.some(([query]) => query.includes('DELETE FROM product_categories'))).toBe(true);
      expect(clientQueryMock.mock.calls.some(([query]) => query.includes('DELETE FROM "Products"'))).toBe(true);
    } finally {
      await app.close();
    }
  });

  it("deletes a fresh-schema product when legacy tables are absent", async () => {
    const app = Fastify();
    await app.register(moderatorRoutes, { prefix: "/moderator" });
    try {
      clientQueryMock.mockImplementation(async (query: string) => {
        if (query.startsWith("SELECT EXISTS")) {
          return { rows: [{ has_product_id: false }], rowCount: 1 };
        }
        if (query.startsWith('SELECT name FROM "Products"')) {
          return { rows: [{ name: "Fresh product" }], rowCount: 1 };
        }
        return { rows: [], rowCount: 1 };
      });

      const deleted = await app.inject({
        method: "DELETE",
        url: "/moderator/products/52c9da92-8dc3-512f-b24b-ec1caa3c3248",
      });

      expect(deleted.statusCode).toBe(200);
      expect(clientQueryMock.mock.calls.some(([query]) =>
        query.includes('DELETE FROM "Nutrition"') ||
        query.includes('DELETE FROM "ProductImages"'),
      )).toBe(false);
      expect(clientQueryMock.mock.calls.some(([query]) =>
        query.includes('DELETE FROM "Products"'),
      )).toBe(true);
    } finally {
      await app.close();
    }
  });

  it("rejects non-HTTPS image URLs and no longer registers image review routes", async () => {
    const app = Fastify();
    await app.register(moderatorRoutes, { prefix: "/moderator" });
    try {
      const invalid = await app.inject({
        method: "POST",
        url: "/moderator/products",
        payload: {
          name: "Example product",
          imageUrl: "http://images.example.com/product.jpg",
          nutrition: {},
        },
      });

      expect(invalid.statusCode).toBe(400);
      expect(invalid.json()).toMatchObject({ error: "INVALID_IMAGE_URL" });

      const credentialed = await app.inject({
        method: "POST",
        url: "/moderator/products",
        payload: {
          name: "Example product",
          imageUrl: "https://user:password@images.example.com/product.jpg",
          nutrition: {},
        },
      });
      expect(credentialed.statusCode).toBe(400);

      lookupMock.mockResolvedValueOnce([
        { address: "169.254.169.254", family: 4 },
      ]);
      const privateHost = await app.inject({
        method: "POST",
        url: "/moderator/products",
        payload: {
          name: "Example product",
          imageUrl,
          nutrition: {},
        },
      });
      expect(privateHost.statusCode).toBe(400);
      expect(privateHost.json()).toMatchObject({ error: "INVALID_IMAGE_URL" });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(connectMock).not.toHaveBeenCalled();

      const removedRoute = await app.inject({
        method: "POST",
        url: "/moderator/products/52c9da92-8dc3-512f-b24b-ec1caa3c3248/review",
      });
      expect(removedRoute.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});
