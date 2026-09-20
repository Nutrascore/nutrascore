import { FastifyPluginAsync } from 'fastify';
import { pool } from '../db/pool.js';

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
    const result = await pool.query(
      `
      SELECT
        c.id,
        c.name,
        c.description,
        COUNT(pc.product_id)::int AS product_count
      FROM categories c
      LEFT JOIN product_categories pc
        ON pc.category_id = c.id
      GROUP BY
        c.id,
        c.name,
        c.description
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

    const categoryResult = await pool.query(
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
        image.image_url
      FROM "Products" p
      INNER JOIN product_categories pc
        ON pc.product_id = p.id
      LEFT JOIN "Nutrition" n
        ON n.product_id = p.id
      LEFT JOIN LATERAL (
        SELECT image_url
        FROM "ProductImages"
        WHERE product_id = p.id
        ORDER BY is_primary DESC, id
        LIMIT 1
      ) image ON TRUE
      WHERE pc.category_id = $1
      ORDER BY p.name ASC
      LIMIT $2
      OFFSET $3
      `,
      [id, limit, offset],
    );

    const countResult = await pool.query(
      `
      SELECT COUNT(*)::int AS total
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

      products: result.rows.map((product) => ({
        id: product.id,
        name: product.name,
        brand: product.brand,
        barcode: product.barcode,
        imageUrl: product.image_url,
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
      limit,
      offset,
    };
  });
};

export default categoryRoutes;