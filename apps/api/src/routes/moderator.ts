import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import type { PoolClient } from 'pg';
import { pool } from '../db/pool.js';
import { nutritionBasisFromDatabase } from '../db/numeric.js';
import { requireCsrf, requireModerator } from '../auth.js';
import { getModeratorTotalPages, parseModeratorPaginationValue } from './moderator-pagination.js';
import {
	moderatorNutritionFields,
	normalizeProductMatch,
	parseModeratorNutrition,
	parseModeratorPrice,
	productMatchLockKey,
} from './moderator-product-validation.js';

interface ProductParams { id: string }
interface ListQuery { q?: string; status?: 'missing' | 'existing'; page?: string; pageSize?: string }
interface ProductDetailsBody {
	name?: string;
	brand?: string | null;
	ingredients?: string | null;
	priceInr?: string | number | null;
	imageUrl?: string | null;
	nutrition?: Record<string, unknown>;
}
interface ProductCreateBody extends ProductDetailsBody {
	categoryId?: string | null;
}
const nutritionColumns = [
	['kcalPer100g', 'kcal_per_100g'],
	['fatG', 'fat_g'],
	['saturatedFatG', 'saturated_fat_g'],
	['transFatG', 'trans_fat_g'],
	['carbohydratesG', 'carbohydrates_g'],
	['sugarsG', 'sugars_g'],
	['fibreG', 'fibre_g'],
	['proteinG', 'protein_g'],
	['sodiumMg', 'sodium_mg'],
	['saltG', 'salt_g'],
	['cholesterolMg', 'cholesterol_mg'],
	['calciumMg', 'calcium_mg'],
	['ironMg', 'iron_mg'],
	['servingSize', 'serving_size'],
] as const;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function nutritionBasisValue(basis: 'unknown' | 'perServing' | 'per100g'): string | null {
	if (basis === 'unknown') return null;
	return basis === 'perServing' ? 'per_serving' : 'per_100g';
}

function isPrivateAddress(address: string): boolean {
	const value = address.toLowerCase();
	if (isIP(value) === 4) {
		const [a, b] = value.split('.').map(Number);
		return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) ||
			(a === 169 && b === 254) || (a === 192 && b === 168) ||
			(a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)) ||
			a >= 224;
	}
	if (isIP(value) === 6) {
		const mappedIpv4 = value.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
		if (mappedIpv4) return isPrivateAddress(mappedIpv4[1]);
		return value === '::' || value === '::1' || value.startsWith('fc') ||
			value.startsWith('fd') || value.startsWith('fe8') || value.startsWith('fe9') ||
			value.startsWith('fea') || value.startsWith('feb') || value.startsWith('ff');
	}
	return false;
}

async function assertPublicImageUrl(value: string): Promise<void> {
	let parsed: URL;
	try { parsed = new URL(value); } catch { throw new Error('Image URL must be valid.'); }
	if (
		value.length > 2048 ||
		parsed.protocol !== 'https:' ||
		!parsed.hostname ||
		parsed.username ||
		parsed.password
	) {
		throw new Error('Image URL must be a valid HTTPS URL without embedded credentials.');
	}
	const addresses = await lookup(parsed.hostname, { all: true });
	if (addresses.some(({ address }) => isPrivateAddress(address))) throw new Error('Image URL host is not publicly reachable.');
	const response = await fetch(parsed, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(8000) });
	if (!response.ok || !response.headers.get('content-type')?.toLowerCase().startsWith('image/')) {
		throw new Error('The image URL did not return a reachable image.');
	}
}

async function deleteLegacyProductRows(client: PoolClient, productId: string): Promise<void> {
	const legacyTables = [
		{ tableName: 'ProductImages', tableRef: '"ProductImages"' },
		{ tableName: 'Nutrition', tableRef: '"Nutrition"' },
		{ tableName: 'product_image_reviews', tableRef: 'product_image_reviews' },
		{ tableName: 'product_image_sources', tableRef: 'product_image_sources' },
		{ tableName: 'product_allergens', tableRef: 'product_allergens' },
		{ tableName: 'product_barcode_sources', tableRef: 'product_barcode_sources' },
	];
	for (const { tableName, tableRef } of legacyTables) {
		const tableExists = await client.query(
			`SELECT EXISTS (
				SELECT 1
				FROM information_schema.columns
				WHERE table_schema = 'public'
				  AND table_name = $1
				  AND column_name = 'product_id'
			) AS has_product_id`,
			[tableName],
		);
		if (!tableExists.rows[0]?.has_product_id) continue;
		await client.query(`DELETE FROM ${tableRef} WHERE product_id = $1`, [productId]);
	}
}

const moderatorRoutes: FastifyPluginAsync = async (app) => {
	app.get<{ Querystring: ListQuery }>('/products', async (request, reply) => {
		if (!(await requireModerator(request, reply))) return;
		const requestedPage = parseModeratorPaginationValue(request.query.page, 1);
		const pageSize = parseModeratorPaginationValue(request.query.pageSize, 24, 100);
		if (requestedPage === null || pageSize === null) {
			return reply.status(400).send({ error: 'INVALID_PAGINATION', message: 'Page and pageSize must be positive integers; pageSize cannot exceed 100.' });
		}
		const params: unknown[] = [];
		const conditions: string[] = [];
		if (request.query.q?.trim()) {
			params.push(`%${request.query.q.trim()}%`);
			conditions.push(`(p.name ILIKE $${params.length} OR p.brand ILIKE $${params.length})`);
		}
		if (request.query.status === 'missing') conditions.push('p.image_url IS NULL');
		if (request.query.status === 'existing') conditions.push('p.image_url IS NOT NULL');
		const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
		const count = await pool.query(
			`SELECT COUNT(*)::int AS total FROM "Products" p
			 ${where}`,
			params,
		);
		const total = Number(count.rows[0].total);
		const totalPages = getModeratorTotalPages(total, pageSize);
		const page = totalPages === 0 ? 1 : Math.min(requestedPage, totalPages);
		params.push(pageSize, (page - 1) * pageSize);
		const result = await pool.query(
			`SELECT p.id, p.name, p.brand, p.image_url AS "imageUrl",
				COALESCE(category.name, 'Uncategorized') AS category
			 FROM "Products" p
			 LEFT JOIN LATERAL (SELECT c.name FROM product_categories pc INNER JOIN categories c ON c.id = pc.category_id WHERE pc.product_id = p.id ORDER BY c.name LIMIT 1) category ON TRUE
			 ${where}
			 ORDER BY p.name, p.id
			 LIMIT $${params.length - 1} OFFSET $${params.length}`,
			params,
		);
		return { products: result.rows, total, page, pageSize, totalPages };
	});

	app.post<{ Body: ProductCreateBody }>('/products', async (request, reply) => {
		if (!(await requireModerator(request, reply)) || !requireCsrf(request, reply)) return;
		const body = request.body ?? {};
		const name = typeof body.name === 'string' ? body.name.trim() : '';
		if (!name) return reply.status(400).send({ error: 'INVALID_PRODUCT', field: 'name', message: 'Product name is required.' });
		if (name.length > 500) return reply.status(400).send({ error: 'INVALID_PRODUCT', field: 'name', message: 'Product name is too long.' });
		const brand = body.brand == null ? null : String(body.brand).trim() || null;
		if (brand && brand.length > 500) return reply.status(400).send({ error: 'INVALID_PRODUCT', field: 'brand', message: 'Brand is too long.' });
		const ingredients = body.ingredients == null ? null : String(body.ingredients);
		const parsedPrice = body.priceInr === undefined
			? { priceInr: null }
			: parseModeratorPrice(body.priceInr);
		if ('error' in parsedPrice && parsedPrice.error) {
			return reply.status(400).send({
				error: 'INVALID_PRICE',
				field: 'priceInr',
				message: parsedPrice.error,
			});
		}
		const categoryId = body.categoryId == null ? null : String(body.categoryId).trim() || null;
		if (categoryId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(categoryId)) {
			return reply.status(400).send({ error: 'INVALID_CATEGORY', field: 'categoryId', message: 'Choose a valid category.' });
		}
		const nutrition = body.nutrition && typeof body.nutrition === 'object' ? body.nutrition : {};
		const parsedNutrition = parseModeratorNutrition(nutrition);
		if (parsedNutrition.error) {
			const field = moderatorNutritionFields.find((key) => parsedNutrition.error?.startsWith(key)) ?? 'nutrition';
			return reply.status(400).send({ error: 'INVALID_NUTRITION', field, message: parsedNutrition.error });
		}
		const imageUrl = body.imageUrl == null ? null : String(body.imageUrl).trim() || null;
		if (imageUrl) {
			try {
				await assertPublicImageUrl(imageUrl);
			} catch (error) {
				return reply.status(400).send({
					error: 'INVALID_IMAGE_URL',
					field: 'imageUrl',
					message: error instanceof Error ? error.message : 'Invalid image URL.',
				});
			}
		}

		const client = await pool.connect();
		try {
			await client.query('BEGIN');
			await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
				productMatchLockKey(name, brand),
			]);
			const normalizedName = normalizeProductMatch(name);
			const normalizedBrand = normalizeProductMatch(brand);
			const duplicate = await client.query(
				`SELECT id, name, brand FROM "Products"
				 WHERE lower(regexp_replace(trim(name), '\\s+', ' ', 'g')) = $1
				   AND lower(regexp_replace(trim(COALESCE(brand, '')), '\\s+', ' ', 'g')) = $2
				 ORDER BY id
				 LIMIT 5`,
				[normalizedName, normalizedBrand],
			);
			if (duplicate.rowCount) {
				await client.query('ROLLBACK');
				return reply.status(409).send({
					error: 'POSSIBLE_DUPLICATE_PRODUCT',
					message: 'A product with the same normalized name and brand already exists.',
					duplicates: duplicate.rows,
				});
			}
			if (categoryId) {
				const category = await client.query('SELECT 1 FROM categories WHERE id = $1', [categoryId]);
				if (!category.rowCount) {
					await client.query('ROLLBACK');
					return reply.status(400).send({ error: 'INVALID_CATEGORY', field: 'categoryId', message: 'Choose a valid category.' });
				}
			}
			const productId = randomUUID();
			const productColumns = [
				'id',
				'name',
				'brand',
				'ingredients',
				'price_inr',
				'image_url',
				...nutritionColumns.map(([, column]) => column),
				'serving_unit',
				'vitamins',
				'nutrition_basis',
			];
			const productValues = [
				productId,
				name,
				brand,
				ingredients,
				parsedPrice.priceInr,
				imageUrl,
				...nutritionColumns.map(([jsonName]) => parsedNutrition.values[jsonName]),
				parsedNutrition.servingUnit,
				parsedNutrition.vitamins,
				nutritionBasisValue(parsedNutrition.basis),
			];
			const insertedProduct = await client.query(
				`INSERT INTO "Products" (${productColumns.map((column) => `"${column}"`).join(', ')})
				 VALUES (${productValues.map((_, index) => `$${index + 1}`).join(', ')})
				 RETURNING price_inr`,
				productValues,
			);
			if (categoryId) {
				await client.query(
					'INSERT INTO product_categories (product_id, category_id) VALUES ($1, $2)',
					[productId, categoryId],
				);
			}
			await client.query('COMMIT');
			return { ok: true, id: productId, name, priceInr: insertedProduct.rows[0].price_inr, imageUrl };
		} catch (error) {
			await client.query('ROLLBACK');
			throw error;
		} finally {
			client.release();
		}
	});

	app.get<{ Params: ProductParams }>('/products/:id', async (request, reply) => {
		if (!(await requireModerator(request, reply))) return;
		if (!uuidPattern.test(request.params.id)) {
			return reply.status(400).send({ error: 'INVALID_PRODUCT_ID', message: 'A valid product ID is required.' });
		}
		const result = await pool.query(
			`SELECT p.id, p.name, p.brand, p.ingredients, p.price_inr, p.image_url AS "imageUrl",
				p.kcal_per_100g, p.fat_g, p.saturated_fat_g, p.trans_fat_g, p.carbohydrates_g,
				p.sugars_g, p.fibre_g, p.protein_g, p.sodium_mg, p.salt_g, p.cholesterol_mg,
				p.calcium_mg, p.iron_mg, p.vitamins, p.serving_size, p.serving_unit, p.nutrition_basis
			 FROM "Products" p
			 WHERE p.id = $1`,
			[request.params.id],
		);
		if (!result.rowCount) return reply.status(404).send({ error: 'PRODUCT_NOT_FOUND', message: 'Product not found.' });
		const product = result.rows[0];
		return {
			id: product.id,
			name: product.name,
			brand: product.brand,
			ingredients: product.ingredients,
			priceInr: product.price_inr,
			imageUrl: product.imageUrl,
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
		};
	});

	app.put<{ Params: ProductParams; Body: ProductDetailsBody }>('/products/:id/details', async (request, reply) => {
		if (!(await requireModerator(request, reply)) || !requireCsrf(request, reply)) return;
		if (!uuidPattern.test(request.params.id)) {
			return reply.status(400).send({ error: 'INVALID_PRODUCT_ID', message: 'A valid product ID is required.' });
		}
		const body = request.body ?? {};
		const name = typeof body.name === 'string' ? body.name.trim() : '';
		if (!name) return reply.status(400).send({ error: 'INVALID_PRODUCT', message: 'Product name is required.' });
		if (name.length > 500) return reply.status(400).send({ error: 'INVALID_PRODUCT', message: 'Product name is too long.' });
		const brand = body.brand == null ? null : String(body.brand).trim() || null;
		const ingredients = body.ingredients == null ? null : String(body.ingredients);
		const nutrition = body.nutrition ?? {};
		const parsedPrice = body.priceInr === undefined
			? null
			: parseModeratorPrice(body.priceInr);
		if (parsedPrice?.error) {
			return reply.status(400).send({
				error: 'INVALID_PRICE',
				field: 'priceInr',
				message: parsedPrice.error,
			});
		}
		const parsedNutrition = parseModeratorNutrition(nutrition);
		if (parsedNutrition.error) {
			const field = moderatorNutritionFields.find((key) => parsedNutrition.error?.startsWith(key)) ?? 'nutrition';
			return reply.status(400).send({ error: 'INVALID_NUTRITION', field, message: parsedNutrition.error });
		}
		const imageUrl = body.imageUrl === undefined
			? undefined
			: body.imageUrl == null
				? null
				: String(body.imageUrl).trim() || null;
		if (imageUrl) {
			try {
				await assertPublicImageUrl(imageUrl);
			} catch (error) {
				return reply.status(400).send({
					error: 'INVALID_IMAGE_URL',
					field: 'imageUrl',
					message: error instanceof Error ? error.message : 'Invalid image URL.',
				});
			}
		}
		const client = await pool.connect();
		try {
			await client.query('BEGIN');
			const exists = await client.query('SELECT 1 FROM "Products" WHERE id = $1 FOR UPDATE', [request.params.id]);
			if (!exists.rowCount) {
				await client.query('ROLLBACK');
				return reply.status(404).send({ error: 'PRODUCT_NOT_FOUND', message: 'Product not found.' });
			}
			const nutritionValues = [
				...nutritionColumns.map(([jsonName]) => parsedNutrition.values[jsonName]),
				parsedNutrition.servingUnit,
				parsedNutrition.vitamins,
				nutritionBasisValue(parsedNutrition.basis),
			];
			const nutritionAssignments = [
				...nutritionColumns.map(([, column], index) => `"${column}" = $${index + 8}`),
				`"serving_unit" = $${nutritionColumns.length + 8}`,
				`"vitamins" = $${nutritionColumns.length + 9}`,
				`"nutrition_basis" = $${nutritionColumns.length + 10}`,
			];
			await client.query(
				`UPDATE "Products"
				 SET name = $1, brand = $2, ingredients = $3,
				     price_inr = CASE WHEN $4 THEN $5::numeric ELSE price_inr END,
				     image_url = CASE WHEN $6 THEN $7 ELSE image_url END,
				     ${nutritionAssignments.join(', ')}
				 WHERE id = $${nutritionColumns.length + 11}`,
				[
					name,
					brand,
					ingredients,
					body.priceInr !== undefined,
					parsedPrice?.priceInr ?? null,
					body.imageUrl !== undefined,
					imageUrl ?? null,
					...nutritionValues,
					request.params.id,
				],
			);
			await client.query('COMMIT');
			return { ok: true };
		} catch (error) {
			await client.query('ROLLBACK');
			throw error;
		} finally {
			client.release();
		}
	});

	app.delete<{ Params: ProductParams }>('/products/:id', async (request, reply) => {
		if (!(await requireModerator(request, reply)) || !requireCsrf(request, reply)) return;
		if (!uuidPattern.test(request.params.id)) {
			return reply.status(400).send({ error: 'INVALID_PRODUCT_ID', message: 'A valid product ID is required.' });
		}
		const client = await pool.connect();
		try {
			await client.query('BEGIN');
			const product = await client.query(
				'SELECT name FROM "Products" WHERE id = $1 FOR UPDATE',
				[request.params.id],
			);
			if (!product.rowCount) {
				await client.query('ROLLBACK');
				return reply.status(404).send({ error: 'PRODUCT_NOT_FOUND', message: 'Product not found.' });
			}

			const productId = request.params.id;
			await deleteLegacyProductRows(client, productId);
			await client.query('DELETE FROM product_categories WHERE product_id = $1', [productId]);
			await client.query('DELETE FROM "Products" WHERE id = $1', [productId]);
			await client.query('COMMIT');
			return { ok: true, id: productId, name: product.rows[0].name };
		} catch (error) {
			await client.query('ROLLBACK');
			throw error;
		} finally {
			client.release();
		}
	});

};

export default moderatorRoutes;
