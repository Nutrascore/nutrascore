import { formatNutritionValue } from './formatNutrition';

export interface NutritionComparison {
	value: string;
	percentage: string;
}

function numericValue(value: string | number | null | undefined): number | null {
	if (value === null || value === undefined || value === '') return null;
	const parsed = typeof value === 'number' ? value : Number(String(value).trim());
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function formatComparisonNutrition(
	value: string | number | null | undefined,
	otherValue: string | number | null | undefined,
	unit: string,
	unitsCompatible = true
): NutritionComparison {
	const formattedValue = formatNutritionValue(value, unit);
	const current = numericValue(value);
	const other = numericValue(otherValue);
	if (!unitsCompatible || current === null || other === null) {
		return { value: formattedValue, percentage: 'N/A' };
	}
	if (other === 0) {
		return { value: formattedValue, percentage: current === 0 ? '0.00%' : 'N/A' };
	}
	const percentage = ((current - other) / other) * 100;
	const sign = percentage > 0 ? '+' : percentage < 0 ? '−' : '';
	return { value: formattedValue, percentage: `${sign}${Math.abs(percentage).toFixed(2)}%` };
}
