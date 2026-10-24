import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { pool } from '../db/pool.js';
import { requireCsrf, requireModerator } from '../auth.js';
import { getModeratorTotalPages, parseModeratorPaginationValue } from './moderator-pagination.js';
import {
	moderatorNutritionFields,
	normalizeProductMatch,
	parseModeratorNutrition,
	parseModeratorPrice,
} from './moderator-product-validation.js';

interface ProductParams { id: string }
interface ListQuery { q?: string; status?: 'missing' | 'existing' | 'review'; page?: string; pageSize?: string }
interface ImageBody { imageUrl?: string; sourceUrl?: string; sourceName?: string; reviewStatus?: 'verified' | 'needs_review' }
interface ProductDetailsBody {
	name?: string;
	brand?: string | null;
	ingredients?: string | null;
	priceInr?: string | number | null;
	nutrition?: Record<string, unknown>;
}
interface ProductCreateBody extends ProductDetailsBody {
	categoryId?: string | null;
	imageUrl?: string | null;
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

function isPrivateAddress(address: string): boolean {
	const value = address.toLowerCase();
	if (isIP(value) === 4) {
		const [a, b] = value.split('.').map(Number);
		return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
	}
	return value === '::1' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb');
}

async function assertPublicImageUrl(value: string): Promise<void> {
	let parsed: URL;
	try { parsed = new URL(value); } catch { throw new Error('Image URL must be valid.'); }
	if (parsed.protocol !== 'https:' || !parsed.hostname) throw new Error('Image URL must use HTTPS.');
	const addresses = await lookup(parsed.hostname, { all: true });
	if (addresses.some(({ address }) => isPrivateAddress(address))) throw new Error('Image URL host is not publicly reachable.');
	const response = await fetch(parsed, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(8000) });
	if (!response.ok || !response.headers.get('content-type')?.toLowerCase().startsWith('image/')) {
		throw new Error('The image URL did not return a reachable image.');
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
		if (request.query.status === 'missing') conditions.push('image.image_url IS NULL');
		if (request.query.status === 'existing') conditions.push('image.image_url IS NOT NULL');
		if (request.query.status === 'review') conditions.push(`review.review_status = 'needs_review'`);
		const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
		const count = await pool.query(
			`SELECT COUNT(*)::int AS total FROM "Products" p
			 LEFT JOIN LATERAL (SELECT image_url FROM "ProductImages" WHERE product_id = p.id ORDER BY is_primary DESC, id LIMIT 1) image ON TRUE
			 LEFT JOIN product_image_sources source ON source.product_id = p.id
			 LEFT JOIN product_image_reviews review ON review.product_id = p.id ${where}`,
			params,
		);
		const total = Number(count.rows[0].total);
		const totalPages = getModeratorTotalPages(total, pageSize);
		const page = totalPages === 0 ? 1 : Math.min(requestedPage, totalPages);
		params.push(pageSize, (page - 1) * pageSize);
		const result = await pool.query(
			`SELECT p.id, p.name, p.brand, image.image_url,
				source.source_url, review.review_status,
				COALESCE(category.name, 'Uncategorized') AS category
			 FROM "Products" p
			 LEFT JOIN LATERAL (SELECT image_url FROM "ProductImages" WHERE product_id = p.id ORDER BY is_primary DESC, id LIMIT 1) image ON TRUE
			 LEFT JOIN product_image_sources source ON source.product_id = p.id
			 LEFT JOIN product_image_reviews review ON review.product_id = p.id
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
			const normalizedName = normalizeProductMatch(name);
			const normalizedBrand = normalizeProductMatch(brand);
			await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
				`${normalizedName}\u0000${normalizedBrand}`,
			]);
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
			const insertedProduct = await client.query(
				`INSERT INTO "Products" (id, name, brand, ingredients, price_inr, created_at, updated_at)
				 VALUES ($1, $2, $3, $4, $5::numeric, NOW(), NOW())
				 RETURNING price_inr`,
				[productId, name, brand, ingredients, parsedPrice.priceInr],
			);
			await client.query(
				`INSERT INTO "Nutrition" (id, product_id, kcal_per_100g, fat_g, saturated_fat_g, trans_fat_g,
					carbohydrates_g, sugars_g, fibre_g, protein_g, sodium_mg, salt_g, cholesterol_mg, calcium_mg,
					iron_mg, serving_size, serving_unit, vitamins, nutrition_basis)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
				[
					randomUUID(),
					productId,
					...nutritionColumns.map(([jsonName]) => parsedNutrition.values[jsonName]),
					parsedNutrition.servingUnit,
					parsedNutrition.vitamins,
					parsedNutrition.basis === 'perServing'
						? 'per_serving'
						: 'per_100g',
				],
			);
			if (categoryId) {
				await client.query(
					'INSERT INTO product_categories (product_id, category_id) VALUES ($1, $2)',
					[productId, categoryId],
				);
			}
			if (imageUrl) {
				await client.query(
					`INSERT INTO "ProductImages" (id, product_id, image_url, image_type, is_primary)
					 VALUES ($1, $2, $3, 'product', TRUE)`,
					[randomUUID(), productId, imageUrl],
				);
				await client.query(
					`INSERT INTO product_image_sources (product_id, source_name, source_url, match_confidence, license_metadata, verified_at)
					 VALUES ($1, 'Moderator supplied source', $2, 1, 'Moderator supplied; identity requires human review.', NOW())`,
					[productId, imageUrl],
				);
				await client.query(
					`INSERT INTO product_image_reviews (product_id, review_status, updated_at)
					 VALUES ($1, 'needs_review', NOW())`,
					[productId],
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
		const result = await pool.query(
			`SELECT p.id, p.name, p.brand, p.ingredients, p.price_inr, image.image_url, source.source_url, source.source_name, review.review_status,
				n.kcal_per_100g, n.fat_g, n.saturated_fat_g, n.trans_fat_g, n.carbohydrates_g,
				n.sugars_g, n.fibre_g, n.protein_g, n.sodium_mg, n.salt_g, n.cholesterol_mg,
				n.calcium_mg, n.iron_mg, n.vitamins, n.serving_size, n.serving_unit, n.nutrition_basis
			 FROM "Products" p
			 LEFT JOIN LATERAL (SELECT image_url FROM "ProductImages" WHERE product_id = p.id ORDER BY is_primary DESC, id LIMIT 1) image ON TRUE
			 LEFT JOIN product_image_sources source ON source.product_id = p.id
			 LEFT JOIN product_image_reviews review ON review.product_id = p.id
			 LEFT JOIN "Nutrition" n ON n.product_id = p.id
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
			image_url: product.image_url,
			source_url: product.source_url,
			source_name: product.source_name,
			review_status: product.review_status,
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
				basis: product.nutrition_basis === 'per_serving' ? 'perServing' : 'per100g',
			},
		};
	});

	app.put<{ Params: ProductParams; Body: ProductDetailsBody }>('/products/:id/details', async (request, reply) => {
		if (!(await requireModerator(request, reply)) || !requireCsrf(request, reply)) return;
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
		const client = await pool.connect();
		try {
			await client.query('BEGIN');
			const exists = await client.query('SELECT 1 FROM "Products" WHERE id = $1 FOR UPDATE', [request.params.id]);
			if (!exists.rowCount) {
				await client.query('ROLLBACK');
				return reply.status(404).send({ error: 'PRODUCT_NOT_FOUND', message: 'Product not found.' });
			}
			await client.query(
				`UPDATE "Products"
				 SET name = $1, brand = $2, ingredients = $3,
				     price_inr = CASE WHEN $4 THEN $5::numeric ELSE price_inr END,
				     updated_at = NOW()
				 WHERE id = $6`,
				[name, brand, ingredients, body.priceInr !== undefined, parsedPrice?.priceInr ?? null, request.params.id],
			);
			await client.query(
				`INSERT INTO "Nutrition" (id, product_id, kcal_per_100g, fat_g, saturated_fat_g, trans_fat_g,
					carbohydrates_g, sugars_g, fibre_g, protein_g, sodium_mg, salt_g, cholesterol_mg, calcium_mg,
					iron_mg, serving_size, serving_unit, vitamins, nutrition_basis)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
				 ON CONFLICT (product_id) DO UPDATE SET kcal_per_100g = EXCLUDED.kcal_per_100g,
				 fat_g = EXCLUDED.fat_g, saturated_fat_g = EXCLUDED.saturated_fat_g, trans_fat_g = EXCLUDED.trans_fat_g,
				 carbohydrates_g = EXCLUDED.carbohydrates_g, sugars_g = EXCLUDED.sugars_g, fibre_g = EXCLUDED.fibre_g,
				 protein_g = EXCLUDED.protein_g, sodium_mg = EXCLUDED.sodium_mg, salt_g = EXCLUDED.salt_g,
				 cholesterol_mg = EXCLUDED.cholesterol_mg, calcium_mg = EXCLUDED.calcium_mg,
				 iron_mg = EXCLUDED.iron_mg, vitamins = EXCLUDED.vitamins,
				 serving_size = EXCLUDED.serving_size, serving_unit = EXCLUDED.serving_unit,
				 nutrition_basis = EXCLUDED.nutrition_basis`,
				[
					randomUUID(),
					request.params.id,
					...nutritionColumns.map(([jsonName]) => parsedNutrition.values[jsonName]),
					parsedNutrition.servingUnit,
					parsedNutrition.vitamins,
					parsedNutrition.basis === 'perServing'
						? 'per_serving'
						: 'per_100g',
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
			await client.query('DELETE FROM product_categories WHERE product_id = $1', [productId]);
			await client.query('DELETE FROM product_image_reviews WHERE product_id = $1', [productId]);
			await client.query('DELETE FROM product_image_sources WHERE product_id = $1', [productId]);
			await client.query('DELETE FROM "ProductImages" WHERE product_id = $1', [productId]);
			await client.query('DELETE FROM "Nutrition" WHERE product_id = $1', [productId]);
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

	app.put<{ Params: ProductParams; Body: ImageBody }>('/products/:id/image', async (request, reply) => {
		if (!(await requireModerator(request, reply)) || !requireCsrf(request, reply)) return;
		const imageUrl = request.body.imageUrl?.trim() ?? '';
		const sourceUrl = request.body.sourceUrl?.trim() || imageUrl;
		const sourceName = request.body.sourceName?.trim() || 'Moderator supplied source';
		if (!imageUrl) return reply.status(400).send({ error: 'INVALID_IMAGE_URL', message: 'Image URL is required.' });
		try {
			await assertPublicImageUrl(imageUrl);
			new URL(sourceUrl);
		} catch (error) {
			return reply.status(400).send({ error: 'INVALID_IMAGE_URL', message: error instanceof Error ? error.message : 'Invalid image URL.' });
		}
		const client = await pool.connect();
		try {
			await client.query('BEGIN');
			const product = await client.query('SELECT 1 FROM "Products" WHERE id = $1', [request.params.id]);
			if (!product.rowCount) {
				await client.query('ROLLBACK');
				return reply.status(404).send({ error: 'PRODUCT_NOT_FOUND', message: 'Product not found.' });
			}
			const existingImage = await client.query(
				`SELECT id FROM "ProductImages"
				 WHERE product_id = $1
				 ORDER BY is_primary DESC, id
				 LIMIT 1
				 FOR UPDATE`,
				[request.params.id],
			);
			if (existingImage.rowCount) {
				await client.query(
					`UPDATE "ProductImages"
					 SET image_url = $1, image_type = 'product', is_primary = TRUE
					 WHERE id = $2`,
					[imageUrl, existingImage.rows[0].id],
				);
				await client.query(
					`UPDATE "ProductImages" SET is_primary = FALSE
					 WHERE product_id = $1 AND id <> $2`,
					[request.params.id, existingImage.rows[0].id],
				);
			} else {
				await client.query(
					`INSERT INTO "ProductImages" (id, product_id, image_url, image_type, is_primary)
					 VALUES ($1, $2, $3, 'product', TRUE)`,
					[randomUUID(), request.params.id, imageUrl],
				);
			}
			await client.query(
				`INSERT INTO product_image_sources (product_id, source_name, source_url, match_confidence, license_metadata, verified_at)
				 VALUES ($1, $2, $3, 1, 'Moderator supplied; identity requires human review.', NOW())
				 ON CONFLICT (product_id) DO UPDATE SET source_name = EXCLUDED.source_name, source_url = EXCLUDED.source_url,
				 match_confidence = EXCLUDED.match_confidence, license_metadata = EXCLUDED.license_metadata,
				 verified_at = EXCLUDED.verified_at`,
				[request.params.id, sourceName, sourceUrl],
			);
			await client.query(
				`INSERT INTO product_image_reviews (product_id, review_status, updated_at)
				 VALUES ($1, $2, NOW())
				 ON CONFLICT (product_id) DO UPDATE SET review_status = EXCLUDED.review_status, updated_at = NOW()`,
				[request.params.id, request.body.reviewStatus ?? 'needs_review'],
			);
			await client.query('COMMIT');
			return { ok: true };
		} catch (error) {
			await client.query('ROLLBACK');
			throw error;
		} finally { client.release(); }
	});

	app.delete<{ Params: ProductParams }>('/products/:id/image', async (request, reply) => {
		if (!(await requireModerator(request, reply)) || !requireCsrf(request, reply)) return;
		const client = await pool.connect();
		try {
			await client.query('BEGIN');
			await client.query('DELETE FROM "ProductImages" WHERE product_id = $1', [request.params.id]);
			await client.query('DELETE FROM product_image_sources WHERE product_id = $1', [request.params.id]);
			await client.query('DELETE FROM product_image_reviews WHERE product_id = $1', [request.params.id]);
			await client.query('COMMIT');
			return { ok: true };
		} catch (error) { await client.query('ROLLBACK'); throw error; }
		finally { client.release(); }
	});

	app.post<{ Params: ProductParams }>('/products/:id/review', async (request, reply) => {
		if (!(await requireModerator(request, reply)) || !requireCsrf(request, reply)) return;
		const result = await pool.query(
			`INSERT INTO product_image_reviews (product_id, review_status, updated_at)
			 VALUES ($1, 'needs_review', NOW())
			 ON CONFLICT (product_id) DO UPDATE SET review_status = 'needs_review', updated_at = NOW()
			 RETURNING product_id`,
			[request.params.id],
		);
		if (!result.rowCount) return reply.status(404).send({ error: 'IMAGE_SOURCE_NOT_FOUND', message: 'No image provenance exists for this product.' });
		return { ok: true };
	});
};

export default moderatorRoutes;
