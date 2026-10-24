export const moderatorNutritionFields = [
	'kcalPer100g',
	'fatG',
	'saturatedFatG',
	'transFatG',
	'carbohydratesG',
	'sugarsG',
	'fibreG',
	'proteinG',
	'sodiumMg',
	'saltG',
	'cholesterolMg',
	'calciumMg',
	'ironMg',
	'servingSize',
] as const;

export const moderatorServingUnits = ['g', 'ml', 'oz', 'piece', 'serving'] as const;
export const moderatorNutritionBases = ['perServing', 'per100g'] as const;

export function parseModeratorPrice(value: unknown): { priceInr: string | null; error?: string } {
	if (value === null || value === undefined) return { priceInr: null };
	if (typeof value !== 'string' && typeof value !== 'number') {
		return { priceInr: null, error: 'Price must be a non-negative number.' };
	}
	const price = String(value).trim();
	if (!price) return { priceInr: null };
	if (!/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(price) || !Number.isFinite(Number(price))) {
		return { priceInr: null, error: 'Price must be a non-negative number.' };
	}
	return { priceInr: price };
}

export function normalizeProductMatch(value: string | null | undefined): string {
	return (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function parseModeratorNutrition(
	nutrition: Record<string, unknown> | undefined,
): {
	values: Record<string, string | null>;
	servingUnit: string | null;
	vitamins: string | null;
	basis: (typeof moderatorNutritionBases)[number];
	error?: string;
} {
	const values: Record<string, string | null> = {};
	for (const field of moderatorNutritionFields) {
		const value = nutrition?.[field];
		if (value === null || value === undefined || value === '') {
			values[field] = null;
			continue;
		}
		const number = typeof value === 'number' ? value : Number(value);
		if (!Number.isFinite(number) || number < 0 || number > 1_000_000) {
			return {
				values,
				servingUnit: null,
				vitamins: null,
				basis: 'per100g',
				error: `${field} must be a non-negative number.`,
			};
		}
		values[field] = String(number);
	}
	const rawServingUnit = nutrition?.servingUnit;
	const servingUnit = rawServingUnit == null ? null : String(rawServingUnit).trim().toLowerCase() || null;
	if (servingUnit && !moderatorServingUnits.includes(servingUnit as (typeof moderatorServingUnits)[number])) {
		return {
			values,
			servingUnit: null,
			vitamins: null,
			basis: 'per100g',
			error: 'Serving unit must be g, ml, oz, piece, or serving.',
		};
	}
	const rawBasis = nutrition?.basis;
	const basis = rawBasis == null
		? 'per100g'
		: String(rawBasis) as (typeof moderatorNutritionBases)[number];
	if (!moderatorNutritionBases.includes(basis)) {
		return {
			values,
			servingUnit,
			vitamins: null,
			basis: 'per100g',
			error: 'Nutrition basis must be Per serving or Per 100 g.',
		};
	}
	const rawVitamins = nutrition?.vitamins;
	if (rawVitamins != null && typeof rawVitamins !== 'string') {
		return {
			values,
			servingUnit,
			vitamins: null,
			basis,
			error: 'vitamins must be text.',
		};
	}
	const vitamins = typeof rawVitamins === 'string' ? rawVitamins.trim() || null : null;
	if (vitamins && vitamins.length > 10000) {
		return {
			values,
			servingUnit,
			vitamins: null,
			basis,
			error: 'vitamins must be 10000 characters or fewer.',
		};
	}
	return { values, servingUnit, vitamins, basis };
}
