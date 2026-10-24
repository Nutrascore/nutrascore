import { FastifyPluginAsync } from 'fastify';
import { pool } from '../db/pool.js';
import { nutritionBasisFromDatabase, numericToNumber } from '../db/numeric.js';

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
        p.ingredients,
        p.nutri_score,
        p.nova_group,
        p.price_inr,
        image.image_url,
        COALESCE((
          SELECT array_agg(c.name ORDER BY c.name)
          FROM product_categories pc
          INNER JOIN categories c ON c.id = pc.category_id
          WHERE pc.product_id = p.id
        ), ARRAY[]::text[]) AS categories,
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
        n.cholesterol_mg,
        n.calcium_mg,
        n.iron_mg,
        n.vitamins,
        n.serving_size,
        n.serving_unit,
        n.nutrition_basis

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
      ingredients: product.ingredients,
      imageUrl: product.image_url,
      categories: product.categories,
      nutriScore: product.nutri_score,
      novaGroup: product.nova_group,
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
    }));

    return {
      products,
    };
  });
};

export default compareRoutes;