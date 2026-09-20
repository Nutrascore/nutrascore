import { describe, expect, it } from 'vitest';
import { formatNutritionValue } from './formatNutrition';

describe('formatNutritionValue', () => {
	it.each([
		['12.000000', '12'],
		['5.500000', '5.5'],
		['0.000000', '0'],
		['12.340000', '12.34']
	])('removes unnecessary trailing zeros from %s', (value, expected) => {
		expect(formatNutritionValue(value)).toBe(expected);
	});

	it('preserves missing values as N/A', () => {
		expect(formatNutritionValue(null)).toBe('N/A');
		expect(formatNutritionValue(undefined)).toBe('N/A');
	});

	it('preserves useful precision and appends units', () => {
		expect(formatNutritionValue('12.34567', ' g')).toBe('12.34567 g');
	});
});
