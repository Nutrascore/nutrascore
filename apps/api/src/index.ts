
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';

import { pool } from './db/pool.js';

import productRoutes from './routes/products.js';
import searchRoutes from './routes/search.js';
import compareRoutes from './routes/compare.js';
import categoryRoutes from './routes/categories.js';
import authRoutes from './routes/auth.js';
import moderatorRoutes from './routes/moderator.js';

const app = Fastify({
	logger: true,
});

const uploadDirectory = path.resolve(process.env.UPLOAD_DIR ?? path.join(process.cwd(), 'uploads'));

// ============================================================
// CORS
// ============================================================

await app.register(cors, {
	origin: (origin, callback) => {
		const configuredOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
		const allowedOrigins = new Set([
			configuredOrigin,
			'http://localhost:5173',
			'http://127.0.0.1:5173',
		]);
		if (!origin || allowedOrigins.has(origin)) {
			callback(null, true);
			return;
		}
		callback(new Error('Origin is not allowed.'), false);
	},
	credentials: true,
	methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
	allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
});

await mkdir(uploadDirectory, { recursive: true });
await app.register(fastifyStatic, {
	root: uploadDirectory,
	prefix: '/uploads/',
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

app.register(authRoutes, {
	prefix: '/api/auth',
});

app.register(moderatorRoutes, {
	prefix: '/api/moderator',
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
