import { FastifyPluginAsync } from 'fastify';
import { pool } from '../db/pool.js';

interface ProductParams {
	id: string;
}

const productRoutes: FastifyPluginAsync = async (app) => {
	app.get<{
		Params: ProductParams;
	}>('/:id', async (request, reply) => {
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
			LEFT JOIN "Nutrition" n ON n.product_id = p.id
			LEFT JOIN LATERAL (
				SELECT image_url
				FROM "ProductImages"
				WHERE product_id = p.id
				ORDER BY is_primary DESC, id
				LIMIT 1
			) image ON TRUE
			WHERE p.id = $1
			LIMIT 1
			`,
			[request.params.id],
		);

		if (result.rows.length === 0) {
			return reply.status(404).send({
				error: 'PRODUCT_NOT_FOUND',
				message: 'Product not found.',
			});
		}

		const product = result.rows[0];

		return {
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
		};
	});
};

export default productRoutes;
