import { FastifyPluginAsync } from 'fastify';
import { pool } from '../db/pool.js';
import { getAuthUser } from '../auth.js';

interface SearchQuery {
  q?: string;
  page?: string;
  pageSize?: string;
  limit?: string;
  offset?: string;
  categories?: string;
  nutrition?: string;
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
    const user = await getAuthUser(request);
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

    const nutritionFilters = request.query.nutrition?.split(',').filter(Boolean) ?? [];
    for (const filter of nutritionFilters) {
      if (filter === 'High Protein') {
        conditions.push(`n.protein_g >= 10`);
        countConditions.push(`n.protein_g >= 10`);
      } else if (filter === 'Low Sugar') {
        conditions.push(`n.sugars_g <= 5`);
        countConditions.push(`n.sugars_g <= 5`);
      } else if (filter === 'Low Calories') {
        conditions.push(`n.kcal_per_100g <= 100`);
        countConditions.push(`n.kcal_per_100g <= 100`);
      }
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join('\n        AND ')}`
      : '';
    const limitParam = addParam(pageSize);
    const offsetParam = addParam(offset);
    const userParam = addParam(user?.id ?? null);
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
        p.barcode,
        p.nutri_score,
        p.nova_group,
        n.kcal_per_100g,
        n.fat_g,
        n.saturated_fat_g,
        n.trans_fat_g,
        n.carbohydrates_g,
        n.sugars_g,
        n.fibre_g,
        n.protein_g,
        n.sodium_mg,
        n.salt_g,
        image.image_url,
        EXISTS (SELECT 1 FROM product_favourites pf WHERE pf.product_id = p.id AND pf.user_id = ${userParam}::uuid) AS is_favourite,
        category.name AS category_name
      FROM "Products" p
      LEFT JOIN "Nutrition" n ON n.product_id = p.id
      LEFT JOIN LATERAL (
        SELECT image_url
        FROM "ProductImages"
        WHERE product_id = p.id
        ORDER BY is_primary DESC, id
        LIMIT 1
      ) image ON TRUE
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
      LEFT JOIN "Nutrition" n ON n.product_id = p.id
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
        barcode: product.barcode,
        imageUrl: product.image_url,
        isFavourite: product.is_favourite,
        category: product.category_name,
        nutriScore: product.nutri_score,
        novaGroup: product.nova_group,
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