import { FastifyPluginAsync } from 'fastify';
import { query } from '../db/database.js';
import { mapProductSummary, type ProductSummaryRow } from '../db/product-query.js';

interface CategoryParams {
  id: string;
}

interface CategoryProductsQuery {
  limit?: number;
  offset?: number;
}

const categoryRoutes: FastifyPluginAsync = async (app) => {
  // ============================================================
  // GET ALL CATEGORIES
  // GET /api/categories
  // ============================================================

  app.get('/', async () => {
    const result = await query<{
      id: string;
      name: string;
      description: string | null;
      product_count: number;
    }>(
      `
      SELECT
        c.id,
        c.name,
        c.description,
        COUNT(pc.product_id) AS product_count
      FROM categories c
      LEFT JOIN product_categories pc
        ON pc.category_id = c.id
      GROUP BY
        c.id,
        c.name,
        c.description
      HAVING COUNT(pc.product_id) > 0
      ORDER BY c.name ASC
      `,
    );

    return {
      categories: result.rows.map((category) => ({
        id: category.id,
        name: category.name,
        description: category.description,
        productCount: category.product_count,
      })),
    };
  });

  // ============================================================
  // GET PRODUCTS BY CATEGORY
  // GET /api/categories/:id/products
  // ============================================================

  app.get<{
    Params: CategoryParams;
    Querystring: CategoryProductsQuery;
  }>('/:id/products', async (request, reply) => {
    const { id } = request.params;

    const limit = Math.min(Number(request.query.limit) || 20, 100);
    const offset = Math.max(Number(request.query.offset) || 0, 0);

    const categoryResult = await query<{
      id: string;
      name: string;
      description: string | null;
    }>(
      `
      SELECT
        id,
        name,
        description
      FROM categories
      WHERE id = $1
      LIMIT 1
      `,
      [id],
    );

    if (categoryResult.rows.length === 0) {
      return reply.status(404).send({
        error: 'CATEGORY_NOT_FOUND',
        message: 'Category not found.',
      });
    }

    const result = await query<ProductSummaryRow>(
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
        (
          SELECT c.name
          FROM product_categories linked_pc
          INNER JOIN categories c ON c.id = linked_pc.category_id
          WHERE linked_pc.product_id = p.id
          ORDER BY c.name ASC
          LIMIT 1
        ) AS category_name
      FROM "Products" p
      INNER JOIN product_categories pc
        ON pc.product_id = p.id
      WHERE pc.category_id = $1
      ORDER BY p.name ASC, p.id ASC
      LIMIT $2
      OFFSET $3
      `,
      [id, limit, offset],
    );

    const countResult = await query<{ total: number }>(
      `
      SELECT COUNT(*) AS total
      FROM product_categories
      WHERE category_id = $1
      `,
      [id],
    );

    return {
      category: {
        id: categoryResult.rows[0].id,
        name: categoryResult.rows[0].name,
        description: categoryResult.rows[0].description,
      },

      products: result.rows.map(mapProductSummary),

      total: countResult.rows[0].total,
      limit,
      offset,
    };
  });
};

export default categoryRoutes;