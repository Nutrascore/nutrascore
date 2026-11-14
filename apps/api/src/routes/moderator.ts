import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { query, transaction } from '../db/database.js';
import { nutritionBasisFromDatabase } from '../db/numeric.js';
import { requireCsrf, requireModerator } from '../auth.js';
import {
	moderatorNutritionFields,
	normalizeProductMatch,
	parseModeratorNutrition,
	parseModeratorPrice,
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

function parsePage(value: string | undefined, fallback: number, max?: number): number | null {
	if (value === undefined) return fallback;
	if (!/^\d+$/.test(value)) return null;
	const page = Number(value);
	if (!Number.isSafeInteger(page) || page < 1 || (max !== undefined && page > max)) {
		return null;
	}
	return page;
}

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

const moderatorRoutes: FastifyPluginAsync = async (app) => {
	app.get<{ Querystring: ListQuery }>('/products', async (request, reply) => {
		if (!(await requireModerator(request, reply))) return;
		const requestedPage = parsePage(request.query.page, 1);
		const pageSize = parsePage(request.query.pageSize, 24, 100);
		if (requestedPage === null || pageSize === null) {
			return reply.status(400).send({ error: 'INVALID_PAGINATION', message: 'Page and pageSize must be positive integers; pageSize cannot exceed 100.' });
		}
		const params: unknown[] = [];
		const conditions: string[] = [];
		if (request.query.q?.trim()) {
			params.push(`%${request.query.q.trim()}%`);
			conditions.push(`(LOWER(p.name) LIKE LOWER($${params.length}) OR LOWER(p.brand) LIKE LOWER($${params.length}))`);
		}
		if (request.query.status === 'missing') conditions.push('p.image_url IS NULL');
		if (request.query.status === 'existing') conditions.push('p.image_url IS NOT NULL');
		const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
		const count = await query(
			`SELECT COUNT(*) AS total FROM "Products" p
			 ${where}`,
			params,
		);
		const total = Number(count.rows[0].total);
		const totalPages = Math.ceil(total / pageSize);
		const page = totalPages === 0 ? 1 : Math.min(requestedPage, totalPages);
		params.push(pageSize, (page - 1) * pageSize);
		const result = await query(
			`SELECT p.id, p.name, p.brand, p.image_url AS "imageUrl",
				COALESCE((
					SELECT c.name FROM product_categories pc
					INNER JOIN categories c ON c.id = pc.category_id
					WHERE pc.product_id = p.id ORDER BY c.name LIMIT 1
				), 'Uncategorized') AS category
			 FROM "Products" p
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

		const outcome = transaction((run) => {
			const normalizedName = normalizeProductMatch(name);
			const normalizedBrand = normalizeProductMatch(brand);
			const duplicate = run(
				`SELECT id, name, brand FROM "Products"
				 WHERE normalize_product_match(name) = $1
				   AND normalize_product_match(COALESCE(brand, '')) = $2
				 ORDER BY id
				 LIMIT 5`,
				[normalizedName, normalizedBrand],
			);
			if (duplicate.rowCount) {
				return { duplicates: duplicate.rows };
			}
			if (categoryId) {
				const category = run('SELECT 1 FROM categories WHERE id = $1', [categoryId]);
				if (!category.rowCount) {
					return { invalidCategory: true as const };
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
			const insertedProduct = run<{ price_inr: string | null }>(
				`INSERT INTO "Products" (${productColumns.map((column) => `"${column}"`).join(', ')})
				 VALUES (${productValues.map((_, index) => `$${index + 1}`).join(', ')})
				 RETURNING price_inr`,
				productValues,
			);
			if (categoryId) {
				run(
					'INSERT INTO product_categories (product_id, category_id) VALUES ($1, $2)',
					[productId, categoryId],
				);
			}
			return {
				product: {
					ok: true,
					id: productId,
					name,
					priceInr: insertedProduct.rows[0].price_inr,
					imageUrl,
				},
			};
		});
		if ('duplicates' in outcome) {
			return reply.status(409).send({
				error: 'POSSIBLE_DUPLICATE_PRODUCT',
				message: 'A product with the same normalized name and brand already exists.',
				duplicates: outcome.duplicates,
			});
		}
		if ('invalidCategory' in outcome) {
			return reply.status(400).send({
				error: 'INVALID_CATEGORY',
				field: 'categoryId',
				message: 'Choose a valid category.',
			});
		}
		return outcome.product;
	});

	app.get<{ Params: ProductParams }>('/products/:id', async (request, reply) => {
		if (!(await requireModerator(request, reply))) return;
		if (!uuidPattern.test(request.params.id)) {
			return reply.status(400).send({ error: 'INVALID_PRODUCT_ID', message: 'A valid product ID is required.' });
		}
		const result = await query(
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
		const updated = transaction((run) => {
			const exists = run('SELECT 1 FROM "Products" WHERE id = $1', [request.params.id]);
			if (!exists.rowCount) return false;
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
			run(
				`UPDATE "Products"
				 SET name = $1, brand = $2, ingredients = $3,
				     price_inr = CASE WHEN $4 THEN $5 ELSE price_inr END,
				     image_url = CASE WHEN $6 THEN $7 ELSE image_url END,
				     ${nutritionAssignments.join(', ')}
				 WHERE id = $${nutritionColumns.length + 11}`,
				[
					name,
					brand,
					ingredients,
					body.priceInr !== undefined ? 1 : 0,
					parsedPrice?.priceInr ?? null,
					body.imageUrl !== undefined ? 1 : 0,
					imageUrl ?? null,
					...nutritionValues,
					request.params.id,
				],
			);
			return true;
		});
		if (!updated) {
			return reply.status(404).send({ error: 'PRODUCT_NOT_FOUND', message: 'Product not found.' });
		}
		return { ok: true };
	});

	app.delete<{ Params: ProductParams }>('/products/:id', async (request, reply) => {
		if (!(await requireModerator(request, reply)) || !requireCsrf(request, reply)) return;
		if (!uuidPattern.test(request.params.id)) {
			return reply.status(400).send({ error: 'INVALID_PRODUCT_ID', message: 'A valid product ID is required.' });
		}
		const productName = transaction((run) => {
			const product = run<{ name: string }>(
				'SELECT name FROM "Products" WHERE id = $1',
				[request.params.id],
			);
			if (!product.rowCount) return null;
			run('DELETE FROM "Products" WHERE id = $1', [request.params.id]);
			return product.rows[0].name;
		});
		if (!productName) {
			return reply.status(404).send({ error: 'PRODUCT_NOT_FOUND', message: 'Product not found.' });
		}
		return { ok: true, id: request.params.id, name: productName };
	});

};

export default moderatorRoutes;
