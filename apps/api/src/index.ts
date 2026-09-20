
import Fastify from 'fastify';
import cors from '@fastify/cors';

import { pool } from './db/pool.js';

import productRoutes from './routes/products.js';
import searchRoutes from './routes/search.js';
import barcodeRoutes from './routes/barcode.js';
import compareRoutes from './routes/compare.js';
import categoryRoutes from './routes/categories.js';

const app = Fastify({
	logger: true,
});

// ============================================================
// CORS
// ============================================================

await app.register(cors, {
	origin: 'http://localhost:5173',
});

// ============================================================
// HEALTH
// ============================================================

app.get('/api/health', async () => {
	const result = await pool.query('SELECT 1');

	return {
		status: 'ok',
		database: result.rowCount === 1 ? 'connected' : 'unknown',
	};
});

// ============================================================
// PRODUCT ROUTES
// ============================================================

app.register(productRoutes, {
	prefix: '/api/products',
});

// ============================================================
// SEARCH ROUTES
// ============================================================

app.register(searchRoutes, {
	prefix: '/api/products',
});

// ============================================================
// BARCODE ROUTES
// ============================================================

app.register(barcodeRoutes, {
	prefix: '/api/products',
});

// ============================================================
// COMPARE ROUTES
// ============================================================

app.register(compareRoutes, {
	prefix: '/api/compare',
});

// ============================================================
// CATEGORY ROUTES
// ============================================================

app.register(categoryRoutes, {
	prefix: '/api/categories',
});

// ============================================================
// START SERVER
// ============================================================

const start = async () => {
	try {
		const port = Number(process.env.PORT) || 3000;

		await app.listen({
			port,
			host: '0.0.0.0',
		});
	} catch (error) {
		app.log.error(error);
		process.exit(1);
	}
};

start();
