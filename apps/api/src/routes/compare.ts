import { FastifyPluginAsync } from 'fastify';
import { pool } from '../db/pool.js';

interface CompareQuery {
  ids?: string;
}

const compareRoutes: FastifyPluginAsync = async (app) => {
  app.get<{
    Querystring: CompareQuery;
  }>('/', async (request, reply) => {
    const ids = request.query.ids
      ?.split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    if (!ids || ids.length < 2) {
      return reply.status(400).send({
        error: 'INVALID_PRODUCTS',
        message: 'At least two product IDs are required.',
      });
    }

    if (ids.length > 4) {
      return reply.status(400).send({
        error: 'TOO_MANY_PRODUCTS',
        message: 'A maximum of four products can be compared.',
      });
    }

    const placeholders = ids.map((_, index) => `$${index + 1}`).join(', ');

    const result = await pool.query(
      `
      SELECT
        p.id,
        p.name,
        p.brand,
        p.barcode,
        p.ingredients,
        p.nutri_score,
        p.nova_group,
        image.image_url,

        n.kcal_per_100g,
        n.fat_g,
        n.saturated_fat_g,
        n.trans_fat_g,
        n.carbohydrates_g,
        n.sugars_g,
        n.fibre_g,
        n.protein_g,
        n.sodium_mg,
        n.salt_g

      FROM "Products" p

      LEFT JOIN "Nutrition" n
        ON n.product_id = p.id

      LEFT JOIN LATERAL (
        SELECT image_url
        FROM "ProductImages"
        WHERE product_id = p.id
        ORDER BY is_primary DESC, id
        LIMIT 1
      ) image ON TRUE

      WHERE p.id IN (${placeholders})
      `,
      ids,
    );

    if (result.rows.length === 0) {
      return reply.status(404).send({
        error: 'PRODUCTS_NOT_FOUND',
        message: 'No matching products were found.',
      });
    }

    const products = result.rows.map((product) => ({
      id: product.id,
      name: product.name,
      brand: product.brand,
      barcode: product.barcode,
      ingredients: product.ingredients,
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
    }));

    return {
      products,
    };
  });
};

export default compareRoutes;