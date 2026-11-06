import { FastifyPluginAsync } from 'fastify';
import { pool } from '../db/pool.js';
import { nutritionBasisFromDatabase, numericToNumber } from '../db/numeric.js';

interface SearchQuery {
  q?: string;
  page?: string;
  pageSize?: string;
  limit?: string;
  offset?: string;
  categories?: string;
}

export function parsePagination(pageValue = '1', pageSizeValue = '24') {
  const page = Number(pageValue);
  const pageSize = Number(pageSizeValue);

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

export function normalizeCategoryNames(categories: string[]): string[] {
  return categories.map((category) => category.trim().toLowerCase()).filter(Boolean);
}

const searchRoutes: FastifyPluginAsync = async (app) => {
  // ============================================================
  // SEARCH
  // GET /api/products/search?q=oreo
  // ============================================================

  app.get<{
    Querystring: SearchQuery;
  }>('/search', async (request, reply) => {
    const q = request.query.q?.trim() ?? '';
    const pageSizeInput = request.query.pageSize ?? request.query.limit ?? '24';
    const pageInput = request.query.page ?? (
      request.query.offset
        ? String(Math.floor(Number(request.query.offset) / Number(pageSizeInput)) + 1)
        : '1'
    );
    const pagination = parsePagination(pageInput, pageSizeInput);
    if (!pagination) {
      return reply.status(400).send({
        error: 'INVALID_PAGINATION',
        message: 'page must be a positive integer and pageSize must be between 1 and 100.',
      });
    }

    const { page, pageSize, offset } = pagination;

    const params: unknown[] = [];
    const conditions: string[] = [];
    const countParams: unknown[] = [];
    const countConditions: string[] = [];

    const addParam = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };

    const addCountParam = (value: unknown) => {
      countParams.push(value);
      return `$${countParams.length}`;
    };

    let exactTerm: string | null = null;
    let prefixTerm: string | null = null;

    if (q) {
      const searchTerm = addParam(`%${q}%`);
      const countSearchTerm = addCountParam(`%${q}%`);
      exactTerm = addParam(q);
      prefixTerm = addParam(`${q}%`);
      conditions.push(`(
        p.name ILIKE ${searchTerm}
        OR p.brand ILIKE ${searchTerm}
      )`);
      countConditions.push(`(
        p.name ILIKE ${countSearchTerm}
        OR p.brand ILIKE ${countSearchTerm}
      )`);
    }

    const categoryNames = request.query.categories?.split(',').filter(Boolean) ?? [];
    if (categoryNames.length > 0) {
      const normalizedCategoryNames = normalizeCategoryNames(categoryNames);
      const categoryParam = addParam(normalizedCategoryNames);
      const countCategoryParam = addCountParam(normalizedCategoryNames);
      conditions.push(`EXISTS (
        SELECT 1
        FROM product_categories pc
        INNER JOIN categories c ON c.id = pc.category_id
        WHERE pc.product_id = p.id
          AND LOWER(TRIM(c.name)) = ANY(${categoryParam}::text[])
      )`);
      countConditions.push(`EXISTS (
        SELECT 1
        FROM product_categories pc
        INNER JOIN categories c ON c.id = pc.category_id
        WHERE pc.product_id = p.id
          AND LOWER(TRIM(c.name)) = ANY(${countCategoryParam}::text[])
      )`);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join('\n        AND ')}`
      : '';
    const limitParam = addParam(pageSize);
    const offsetParam = addParam(offset);
    const orderClause = q
      ? `CASE
          WHEN LOWER(p.name) = LOWER(${exactTerm}) THEN 1
          WHEN LOWER(p.name) LIKE LOWER(${prefixTerm}) THEN 2
          ELSE 3
        END,
        p.name ASC,
        p.id ASC`
      : 'p.name ASC, p.id ASC';

    const result = await pool.query(
      `
      SELECT
        p.id,
        p.name,
        p.brand,
        p.price_inr,
        p.kcal_per_100g,
        p.fat_g,
        p.saturated_fat_g,
        p.trans_fat_g,
        p.carbohydrates_g,
        p.sugars_g,
        p.fibre_g,
        p.protein_g,
        p.sodium_mg,
        p.salt_g,
        p.cholesterol_mg,
        p.calcium_mg,
        p.iron_mg,
        p.vitamins,
        p.serving_size,
        p.serving_unit,
        p.nutrition_basis,
        p.image_url,
        category.name AS category_name
      FROM "Products" p
      LEFT JOIN LATERAL (
        SELECT c.name
        FROM product_categories pc
        INNER JOIN categories c ON c.id = pc.category_id
        WHERE pc.product_id = p.id
        ORDER BY c.name ASC
        LIMIT 1
      ) category ON TRUE
      ${whereClause}
      ORDER BY
        ${orderClause}
      LIMIT ${limitParam}
      OFFSET ${offsetParam}
      `,
      params,
    );

    const countResult = await pool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM "Products" p
      ${countConditions.length > 0
        ? `WHERE ${countConditions.join('\n        AND ')}`
        : ''}
      `,
      countParams,
    );

    return {
      products: result.rows.map((product) => ({
        id: product.id,
        name: product.name,
        brand: product.brand,
        imageUrl: product.image_url,
        category: product.category_name,
        priceInr: numericToNumber(product.price_inr),
        nutrition: {
          kcalPer100g: product.kcal_per_100g,
          fatG: product.fat_g,
          saturatedFatG: product.saturated_fat_g,
          transFatG: product.trans_fat_g,
          carbohydratesG: product.carbohydrates_g,
          sugarsG: product.sugars_g,
          fibreG: product.fibre_g,
          proteinG: product.protein_g,
          sodiumMg: product.sodium_mg,
          saltG: product.salt_g,
          cholesterolMg: product.cholesterol_mg,
          calciumMg: product.calcium_mg,
          ironMg: product.iron_mg,
          vitamins: product.vitamins,
          servingSize: product.serving_size,
          servingUnit: product.serving_unit,
          basis: nutritionBasisFromDatabase(product.nutrition_basis),
        },
      })),
      total: countResult.rows[0].total,
      page,
      pageSize,
      totalPages: Math.ceil(Number(countResult.rows[0].total) / pageSize),
    };
  });

  // ============================================================
  // AUTOCOMPLETE
  // GET /api/products/autocomplete?q=ore
  // ============================================================

  app.get<{
    Querystring: SearchQuery;
  }>('/autocomplete', async (request) => {
    const q = request.query.q?.trim() ?? '';
    const limit = Math.min(Number(request.query.limit) || 10, 20);

    if (!q) {
      return {
        suggestions: [],
      };
    }

    const searchTerm = `${q}%`;

    const result = await pool.query(
      `
      SELECT
        p.id,
        p.name,
        p.brand
      FROM "Products" p
      WHERE
        p.name ILIKE $1
        OR p.brand ILIKE $1
      ORDER BY p.name ASC
      LIMIT $2
      `,
      [searchTerm, limit],
    );

    return {
      suggestions: result.rows.map((product) => ({
        id: product.id,
        name: product.name,
        brand: product.brand,
      })),
    };
  });
};

export default searchRoutes;