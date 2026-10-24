import type { Nutrition } from '$lib/api';

export type NutritionDisplayBasis = Nutrition['basis'];

export function convertNutritionValue(
	value: string | number | null | undefined,
	sourceBasis: NutritionDisplayBasis,
	targetBasis: NutritionDisplayBasis,
	servingSize: string | number | null | undefined,
	servingUnit: string | null | undefined
): number | null {
	if (value === null || value === undefined || value === '') return null;
	if (sourceBasis === 'unknown' || targetBasis === 'unknown') return null;
	const numericValue = typeof value === 'number' ? value : Number(value.trim());
	if (!Number.isFinite(numericValue) || numericValue < 0) return null;
	if (sourceBasis === targetBasis) return numericValue;

	if (servingUnit?.trim().toLowerCase() !== 'g') return null;
	const size = typeof servingSize === 'number' ? servingSize : Number(servingSize);
	if (!Number.isFinite(size) || size <= 0) return null;

	return sourceBasis === 'perServing' ? (numericValue * 100) / size : (numericValue * size) / 100;
}
