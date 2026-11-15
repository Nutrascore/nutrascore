export function numericToNumber(value: unknown): number | null {
	if (value === null) return null;

	const numericValue =
		typeof value === 'number' || typeof value === 'string' ? Number(value) : Number.NaN;
	if (!Number.isFinite(numericValue)) {
		throw new TypeError('Database returned an invalid numeric value.');
	}

	return numericValue;
}

export type NutritionBasis = 'perServing' | 'per100g' | 'per100ml' | 'unknown';

export function nutritionBasisFromDatabase(value: unknown): NutritionBasis {
	switch (value) {
		case 'per_serving':
			return 'perServing';
		case 'per_100g':
			return 'per100g';
		case 'per_100ml':
			return 'per100ml';
		default:
			return 'unknown';
	}
}
