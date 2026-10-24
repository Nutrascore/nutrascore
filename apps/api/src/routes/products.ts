import { FastifyPluginAsync } from 'fastify';
import { pool } from '../db/pool.js';
import { getAuthUser, requireCsrf, requireUser } from '../auth.js';

interface ProductParams {
	id: string;
}

const productRoutes: FastifyPluginAsync = async (app) => {
	app.get<{
		Params: ProductParams;
	}>('/:id', async (request, reply) => {
		const user = await getAuthUser(request);
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
				EXISTS (SELECT 1 FROM product_favourites pf WHERE pf.product_id = p.id AND pf.user_id = $2::uuid) AS is_favourite,
				COALESCE((
					SELECT array_agg(c.name ORDER BY c.name)
					FROM product_categories pc
					INNER JOIN categories c ON c.id = pc.category_id
					WHERE pc.product_id = p.id
				), ARRAY[]::text[]) AS categories,
				COALESCE((
					SELECT array_agg(a.name ORDER BY a.name)
					FROM product_allergens pa
					INNER JOIN allergens a ON a.id = pa.allergen_id
					WHERE pa.product_id = p.id
				), ARRAY[]::text[]) AS allergens,
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
				n.serving_size,
				n.serving_unit
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
			[request.params.id, user?.id ?? null],
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
			isFavourite: product.is_favourite,
			categories: product.categories,
			allergens: product.allergens,
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
				servingSize: product.serving_size,
				servingUnit: product.serving_unit,
			},
		};
	});

	app.get<{ Params: ProductParams }>('/:id/engagement', async (request, reply) => {
		const user = await getAuthUser(request);
		const result = await pool.query(
			`SELECT EXISTS (SELECT 1 FROM "Products" WHERE id = $1) AS product_exists,
				EXISTS (SELECT 1 FROM product_favourites WHERE product_id = $1 AND user_id = $2::uuid) AS is_favourite`,
			[request.params.id, user?.id ?? null],
		);
		if (!result.rows[0]?.product_exists) return reply.status(404).send({ error: 'PRODUCT_NOT_FOUND', message: 'Product not found.' });
		return { isFavourite: result.rows[0].is_favourite };
	});

	app.post<{ Params: ProductParams }>('/:id/favourite', async (request, reply) => {
		const user = await requireUser(request, reply);
		if (!user || !requireCsrf(request, reply)) return;
		const result = await pool.query(
			`INSERT INTO product_favourites (user_id, product_id) VALUES ($1, $2)
			 ON CONFLICT (user_id, product_id) DO NOTHING
			 RETURNING product_id`,
			[user.id, request.params.id],
		);
		if (!result.rowCount) {
			const exists = await pool.query('SELECT 1 FROM "Products" WHERE id = $1', [request.params.id]);
			if (!exists.rowCount) return reply.status(404).send({ error: 'PRODUCT_NOT_FOUND', message: 'Product not found.' });
		}
		return { favourite: true };
	});

	app.delete<{ Params: ProductParams }>('/:id/favourite', async (request, reply) => {
		const user = await requireUser(request, reply);
		if (!user || !requireCsrf(request, reply)) return;
		await pool.query('DELETE FROM product_favourites WHERE user_id = $1 AND product_id = $2', [user.id, request.params.id]);
		return { favourite: false };
	});
};

export default productRoutes;
