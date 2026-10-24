import type { FastifyInstance } from "fastify";
import type { ShowcaseCatalog, ShowcaseProduct } from "./showcase-data.js";

interface SearchQuery {
  q?: string;
  page?: string;
  pageSize?: string;
  limit?: string;
  offset?: string;
  categories?: string;
}

function parsePagination(pageInput: string, pageSizeInput: string) {
  const page = Number(pageInput);
  const pageSize = Number(pageSizeInput);
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100
  ) {
    return null;
  }
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function matchesCategories(
  product: ShowcaseProduct,
  selected: Set<string>,
): boolean {
  return product.categories.some((category) =>
    selected.has(category.trim().toLowerCase()),
  );
}

export function registerShowcaseRoutes(
  app: FastifyInstance,
  catalog: ShowcaseCatalog,
): void {
  app.get("/api/health", async () => ({
    status: "ok",
    database: "not required",
    mode: "csv-showcase",
  }));

  app.get<{ Querystring: SearchQuery }>(
    "/api/products/search",
    async (request, reply) => {
      const query = request.query.q?.trim().toLocaleLowerCase() ?? "";
      const pageSizeInput =
        request.query.pageSize ?? request.query.limit ?? "24";
      const pageInput =
        request.query.page ??
        (request.query.offset
          ? String(
              Math.floor(Number(request.query.offset) / Number(pageSizeInput)) +
                1,
            )
          : "1");
      const pagination = parsePagination(pageInput, pageSizeInput);
      if (!pagination) {
        return reply.status(400).send({
          error: "INVALID_PAGINATION",
          message:
            "page must be a positive integer and pageSize must be between 1 and 100.",
        });
      }

      const selectedCategories = new Set(
        (request.query.categories ?? "")
          .split(",")
          .map((category) => category.trim().toLocaleLowerCase())
          .filter(Boolean),
      );
      const filteredProducts = catalog.products
        .filter((product) => {
          const matchesQuery =
            !query ||
            product.name.toLocaleLowerCase().includes(query) ||
            product.brand?.toLocaleLowerCase().includes(query);
          return (
            matchesQuery &&
            (selectedCategories.size === 0 ||
              matchesCategories(product, selectedCategories))
          );
        })
        .sort(
          (left, right) =>
            left.name.localeCompare(right.name) ||
            left.id.localeCompare(right.id),
        );
      const { page, pageSize, offset } = pagination;
      const products = filteredProducts
        .slice(offset, offset + pageSize)
        .map((product) => ({
          id: product.id,
          name: product.name,
          brand: product.brand,
          imageUrl: product.imageUrl,
          category: product.category,
          nutriScore: product.nutriScore,
          novaGroup: product.novaGroup,
          priceInr: product.priceInr,
          nutrition: product.nutrition,
        }));

      return {
        products,
        total: filteredProducts.length,
        page,
        pageSize,
        totalPages: Math.ceil(filteredProducts.length / pageSize),
      };
    },
  );

  app.get<{ Querystring: SearchQuery }>(
    "/api/products/autocomplete",
    async (request) => {
      const query = request.query.q?.trim().toLocaleLowerCase() ?? "";
      const requestedLimit = Number(request.query.limit) || 10;
      const limit = Math.min(Math.max(requestedLimit, 1), 20);
      const suggestions = query
        ? catalog.products
            .filter(
              (product) =>
                product.name.toLocaleLowerCase().startsWith(query) ||
                product.brand?.toLocaleLowerCase().startsWith(query),
            )
            .sort((left, right) => left.name.localeCompare(right.name))
            .slice(0, limit)
            .map(({ id, name, brand }) => ({ id, name, brand }))
        : [];
      return { suggestions };
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/products/:id",
    async (request, reply) => {
      const product = catalog.getProduct(request.params.id);
      if (!product) {
        return reply.status(404).send({
          error: "PRODUCT_NOT_FOUND",
          message: "Product not found.",
        });
      }
      return product;
    },
  );

  app.get<{ Querystring: { ids?: string } }>(
    "/api/compare",
    async (request, reply) => {
      const ids = request.query.ids
        ?.split(",")
        .map((id) => id.trim())
        .filter(Boolean);
      if (!ids || ids.length < 2) {
        return reply.status(400).send({
          error: "INVALID_PRODUCTS",
          message: "At least two product IDs are required.",
        });
      }
      if (ids.length > 2) {
        return reply.status(400).send({
          error: "TOO_MANY_PRODUCTS",
          message:
            "A maximum of two products can be compared in Showcase Mode.",
        });
      }

      const products: ShowcaseProduct[] = ids.flatMap((id) => {
        const product = catalog.getProduct(id);
        return product ? [product] : [];
      });
      if (products.length === 0) {
        return reply.status(404).send({
          error: "PRODUCTS_NOT_FOUND",
          message: "No matching products were found.",
        });
      }
      return { products };
    },
  );

  app.get("/api/categories", async () => ({ categories: catalog.categories }));

  app.get<{
    Params: { id: string };
    Querystring: { limit?: string; offset?: string };
  }>("/api/categories/:id/products", async (request, reply) => {
    const categoryName = catalog.getCategoryName(request.params.id);
    if (!categoryName) {
      return reply.status(404).send({
        error: "CATEGORY_NOT_FOUND",
        message: "Category not found.",
      });
    }

    const limitInput = Number(request.query.limit) || 20;
    const offsetInput = Number(request.query.offset) || 0;
    const limit = Math.min(Math.max(Math.floor(limitInput), 1), 100);
    const offset = Math.max(Math.floor(offsetInput), 0);
    const matchingProducts = catalog.products
      .filter((product) => product.category === categoryName)
      .sort(
        (left, right) =>
          left.name.localeCompare(right.name) ||
          left.id.localeCompare(right.id),
      );
    const products = matchingProducts
      .slice(offset, offset + limit)
      .map((product) => ({
        id: product.id,
        name: product.name,
        brand: product.brand,
        imageUrl: product.imageUrl,
        category: product.category,
        nutriScore: product.nutriScore,
        novaGroup: product.novaGroup,
        priceInr: product.priceInr,
        nutrition: product.nutrition,
      }));
    return {
      category: {
        id: request.params.id,
        name: categoryName,
        description: null,
      },
      products,
      total: matchingProducts.length,
      limit,
      offset,
    };
  });
}
