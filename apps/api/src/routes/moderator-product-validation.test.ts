import { describe, expect, it } from 'vitest';
import {
	normalizeProductMatch,
	parseModeratorNutrition,
} from './moderator-product-validation.js';

describe('moderator product creation validation', () => {
	it('normalizes duplicate matching values', () => {
		expect(normalizeProductMatch('  Choco  Bar ')).toBe('choco bar');
		expect(normalizeProductMatch(null)).toBe('');
	});

	it('accepts supported nutrition values and units', () => {
		const result = parseModeratorNutrition({
			kcalPer100g: '123.4',
			proteinG: 4,
			servingSize: '30',
			servingUnit: 'ML',
		});
		expect(result.error).toBeUndefined();
		expect(result.values.kcalPer100g).toBe('123.4');
		expect(result.servingUnit).toBe('ml');
	});

	it('rejects negative, non-finite, and unsupported values', () => {
		expect(parseModeratorNutrition({ sodiumMg: -1 }).error).toContain('sodiumMg');
		expect(parseModeratorNutrition({ kcalPer100g: 'not-a-number' }).error).toContain('kcalPer100g');
		expect(parseModeratorNutrition({ servingUnit: 'packet' }).error).toContain('Serving unit');
	});
});
