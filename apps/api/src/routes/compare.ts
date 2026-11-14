import { FastifyPluginAsync } from 'fastify';
import { query } from '../db/database.js';
import { mapProduct, productDetailsQuery, type ProductQueryRow } from '../db/product-query.js';
import { parseComparisonIds } from './compare-validation.js';

interface CompareQuery {
  ids?: string | string[];
}

const compareRoutes: FastifyPluginAsync = async (app) => {
  app.get<{
    Querystring: CompareQuery;
  }>('/', async (request, reply) => {
    const ids = parseComparisonIds(request.query.ids);
    if (!ids) {
      return reply.status(400).send({
        error: 'INVALID_PRODUCTS',
        message: 'Exactly two distinct, valid product IDs are required.',
      });
    }

    const productQuery = productDetailsQuery(ids);
    const result = await query<ProductQueryRow>(productQuery.statement, productQuery.values);

    if (result.rows.length !== ids.length) {
      return reply.status(404).send({
        error: 'PRODUCTS_NOT_FOUND',
        message: 'Both requested products must exist.',
      });
    }

    const products = result.rows.map(mapProduct);

    return {
      products,
    };
  });
};

export default compareRoutes;