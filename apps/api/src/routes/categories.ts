import { FastifyPluginAsync } from 'fastify';
import { pool } from '../db/pool.js';
import { nutritionBasisFromDatabase, numericToNumber } from '../db/numeric.js';

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
      INNER JOIN product_categories pc
        ON pc.product_id = p.id
      LEFT JOIN LATERAL (
        SELECT c.name
        FROM product_categories linked_pc
        INNER JOIN categories c ON c.id = linked_pc.category_id
        WHERE linked_pc.product_id = p.id
        ORDER BY c.name ASC
        LIMIT 1
      ) category ON TRUE
      WHERE pc.category_id = $1
      ORDER BY p.name ASC, p.id ASC
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
      limit,
      offset,
    };
  });
};

export default categoryRoutes;