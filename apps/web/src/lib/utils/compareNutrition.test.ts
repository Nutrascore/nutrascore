import { describe, expect, it } from 'vitest';
import { formatComparisonNutrition } from './compareNutrition';

describe('formatComparisonNutrition', () => {
	it('calculates a signed percentage relative to the other value', () => {
		expect(formatComparisonNutrition('12.4', '15', ' g')).toEqual({
			value: '12.4 g',
			percentage: '−17.33%'
		});
		expect(formatComparisonNutrition('15', '12.4', ' g').percentage).toBe('+20.97%');
	});

	it('handles equal and zero reference values', () => {
		expect(formatComparisonNutrition('200', '200', ' mg').percentage).toBe('0.00%');
		expect(formatComparisonNutrition('5', '0', ' g').percentage).toBe('N/A');
		expect(formatComparisonNutrition('0', '0', ' g').percentage).toBe('0.00%');
	});

	it('preserves values while rejecting missing, invalid, or incompatible comparisons', () => {
		expect(formatComparisonNutrition(null, '2', ' g')).toEqual({
			value: 'N/A',
			percentage: 'N/A'
		});
		expect(formatComparisonNutrition('bad', '2', ' g')).toEqual({
			value: 'bad g',
			percentage: 'N/A'
		});
		expect(formatComparisonNutrition('2', '2', ' g', false).percentage).toBe('N/A');
	});
});
