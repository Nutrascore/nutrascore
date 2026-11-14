import { FastifyPluginAsync } from 'fastify';
import { query } from '../db/database.js';
import { mapProduct, productDetailsQuery, type ProductQueryRow } from '../db/product-query.js';

interface ProductParams {
	id: string;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const productRoutes: FastifyPluginAsync = async (app) => {
	app.get<{
		Params: ProductParams;
	}>('/:id', async (request, reply) => {
		if (!uuidPattern.test(request.params.id)) {
			return reply.status(400).send({
				error: 'INVALID_PRODUCT_ID',
				message: 'A valid product ID is required.',
			});
		}

		const productQuery = productDetailsQuery([request.params.id]);
		const result = await query<ProductQueryRow>(productQuery.statement, productQuery.values);

		if (result.rows.length === 0) {
			return reply.status(404).send({
				error: 'PRODUCT_NOT_FOUND',
				message: 'Product not found.',
			});
		}

		return mapProduct(result.rows[0]);
	});
};

export default productRoutes;
