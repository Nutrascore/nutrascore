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
	'servingSize',
] as const;

export const moderatorServingUnits = ['g', 'ml', 'oz', 'piece', 'serving'] as const;

export function normalizeProductMatch(value: string | null | undefined): string {
	return (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function parseModeratorNutrition(
	nutrition: Record<string, unknown> | undefined,
): { values: Record<string, string | null>; servingUnit: string | null; error?: string } {
	const values: Record<string, string | null> = {};
	for (const field of moderatorNutritionFields) {
		const value = nutrition?.[field];
		if (value === null || value === undefined || value === '') {
			values[field] = null;
			continue;
		}
		const number = typeof value === 'number' ? value : Number(value);
		if (!Number.isFinite(number) || number < 0 || number > 1_000_000) {
			return { values, servingUnit: null, error: `${field} must be a non-negative number.` };
		}
		values[field] = String(number);
	}
	const rawServingUnit = nutrition?.servingUnit;
	const servingUnit = rawServingUnit == null ? null : String(rawServingUnit).trim().toLowerCase() || null;
	if (servingUnit && !moderatorServingUnits.includes(servingUnit as (typeof moderatorServingUnits)[number])) {
		return {
			values,
			servingUnit: null,
			error: 'Serving unit must be g, ml, oz, piece, or serving.',
		};
	}
	return { values, servingUnit };
}
