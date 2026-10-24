import type { FastifyPluginAsync } from 'fastify';
import { pool } from '../db/pool.js';
import { requireUser } from '../auth.js';

const accountRoutes: FastifyPluginAsync = async (app) => {
	app.get('/favourites', async (request, reply) => {
		const user = await requireUser(request, reply);
		if (!user) return;
		const result = await pool.query(
			`SELECT p.id, p.name, p.brand, p.barcode, image.image_url,
				EXISTS (SELECT 1 FROM product_favourites current_pf WHERE current_pf.product_id = p.id AND current_pf.user_id = $1) AS is_favourite
			 FROM product_favourites pf
			 INNER JOIN "Products" p ON p.id = pf.product_id
			 LEFT JOIN LATERAL (
				SELECT image_url FROM "ProductImages"
				WHERE product_id = p.id ORDER BY is_primary DESC, id LIMIT 1
			 ) image ON TRUE
			 WHERE pf.user_id = $1
			 ORDER BY pf.created_at DESC`,
			[user.id],
		);
		return { products: result.rows };
	});
};

export default accountRoutes;
