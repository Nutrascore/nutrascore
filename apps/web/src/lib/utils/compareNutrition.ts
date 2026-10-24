import type { Product } from '$lib/api';
import { convertNutritionValue } from './nutritionDisplay';
import { formatNutritionValue } from './formatNutrition';

export interface NutritionComparison {
	value: string;
	percentage: string;
	percentageClass: string;
}

export interface PriceComparison {
	productAPrice: string;
	productAPercentage: string;
	productAPercentageClass: string;
	productBPrice: string;
	productBPercentage: string;
	productBPercentageClass: string;
}

export type ComparisonNutrientKey =
	| 'kcalPer100g'
	| 'proteinG'
	| 'carbohydratesG'
	| 'fatG'
	| 'saturatedFatG'
	| 'sugarsG'
	| 'saltG'
	| 'sodiumMg'
	| 'fibreG';

interface NutrientDefinition {
	key: ComparisonNutrientKey;
	label: string;
}

const NUTRIENT_DEFINITIONS: NutrientDefinition[] = [
	{ key: 'kcalPer100g', label: 'calories' },
	{ key: 'proteinG', label: 'protein' },
	{ key: 'carbohydratesG', label: 'carbohydrates' },
	{ key: 'fatG', label: 'total fat' },
	{ key: 'saturatedFatG', label: 'saturated fat' },
	{ key: 'sugarsG', label: 'sugar' },
	{ key: 'saltG', label: 'salt' },
	{ key: 'sodiumMg', label: 'sodium' },
	{ key: 'fibreG', label: 'dietary fibre' }
];

function numericValue(value: string | number | null | undefined): number | null {
	if (value === null || value === undefined || value === '') return null;
	const parsed = typeof value === 'number' ? value : Number(String(value).trim());
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function formatPrice(value: number | null): string {
	if (value === null) {
		return 'N/A';
	}

	return new Intl.NumberFormat('en-IN', {
		style: 'currency',
		currency: 'INR',
		minimumFractionDigits: 0,
		maximumFractionDigits: 2
	}).format(value);
}

function formatPricePercentage(value: number | null): string {
	if (value === null || !Number.isFinite(value)) {
		return 'N/A';
	}

	const sign = value > 0 ? '+' : value < 0 ? '−' : '';
	return `${sign}${Math.abs(value).toFixed(2)}%`;
}

function pricePercentageClass(value: number | null): string {
	if (value === null || value === 0) {
		return 'neutral';
	}

	return value > 0 ? 'positive' : 'negative';
}

export function formatPriceComparison(
	productAPrice: string | number | null | undefined,
	productBPrice: string | number | null | undefined
): PriceComparison {
	const priceA = numericValue(productAPrice);
	const priceB = numericValue(productBPrice);
	const validPrices = priceA !== null && priceA > 0 && priceB !== null && priceB > 0;
	let percentageA: number | null = null;
	let percentageB: number | null = null;

	if (validPrices) {
		const calculatedA = ((priceA - priceB) / priceB) * 100;
		const calculatedB = ((priceB - priceA) / priceA) * 100;
		if (Number.isFinite(calculatedA) && Number.isFinite(calculatedB)) {
			percentageA = calculatedA;
			percentageB = calculatedB;
		}
	}

	return {
		productAPrice: formatPrice(priceA),
		productAPercentage: formatPricePercentage(percentageA),
		productAPercentageClass: pricePercentageClass(percentageA),
		productBPrice: formatPrice(priceB),
		productBPercentage: formatPricePercentage(percentageB),
		productBPercentageClass: pricePercentageClass(percentageB)
	};
}

export function normalisedValue(product: Product, key: ComparisonNutrientKey): number | null {
	if (!product.nutrition) {
		return null;
	}

	const rawValue = product.nutrition[key];
	if (rawValue === null || rawValue === undefined || rawValue === '') {
		return null;
	}

	return convertNutritionValue(
		rawValue,
		product.nutrition.basis,
		'per100g',
		product.nutrition.servingSize,
		product.nutrition.servingUnit
	);
}

function isNegligibleDifference(current: number, other: number) {
	const tolerance = Math.max(0.01, Math.abs(current) * 0.01, Math.abs(other) * 0.01);
	return Math.abs(current - other) <= tolerance;
}

function joinPhrases(phrases: string[]) {
	if (phrases.length === 0) return '';
	if (phrases.length === 1) return phrases[0];
	if (phrases.length === 2) return `${phrases[0]} and ${phrases[1]}`;
	return `${phrases.slice(0, -1).join(', ')}, and ${phrases[phrases.length - 1]}`;
}

function priceDifferenceSentence(product: Product, other: Product): string | null {
	const productPrice = numericValue(product.priceInr);
	const otherPrice = numericValue(other.priceInr);

	if (productPrice === null || otherPrice === null) {
		return null;
	}

	if (productPrice === otherPrice) {
		return 'Both products cost the same.';
	}

	if (otherPrice === 0) {
		return 'Price comparison is unavailable.';
	}

	const relativeDifference = ((otherPrice - productPrice) / otherPrice) * 100;
	const percentage = Math.abs(relativeDifference)
		.toFixed(2)
		.replace(/\.?0+$/, '');
	const comparison = relativeDifference > 0 ? 'cheaper' : 'more expensive';
	return `It is also ${percentage}% ${comparison} than ${other.name}.`;
}

function nutrientDescription(label: string, direction: 'higher' | 'lower'): string {
	const lowerLabel = label.toLowerCase();

	if (label === 'calories') {
		return direction === 'higher' ? 'more calories' : 'fewer calories';
	}
	if (label === 'dietary fibre') {
		return direction === 'higher' ? 'more dietary fibre' : 'less dietary fibre';
	}
	if (label === 'total fat') {
		return direction === 'higher' ? 'more total fat' : 'less total fat';
	}
	if (label === 'saturated fat') {
		return direction === 'higher' ? 'more saturated fat' : 'less saturated fat';
	}
	if (lowerLabel === 'sugar') {
		return direction === 'higher' ? 'more sugar' : 'less sugar';
	}
	if (lowerLabel === 'salt' || lowerLabel === 'sodium') {
		return direction === 'higher' ? 'more sodium' : 'less sodium';
	}
	if (direction === 'higher') {
		return `more ${label}`;
	}
	return `less ${label}`;
}

export function buildComparisonAnalysis(product: Product, other: Product): string {
	const hasUnknownBasis =
		product.nutrition?.basis === 'unknown' || other.nutrition?.basis === 'unknown';
	if (hasUnknownBasis) {
		const summary = `Compared with ${other.name}, nutrition values cannot be compared because the basis is unspecified for one or both products.`;
		const priceSentence = priceDifferenceSentence(product, other);
		return priceSentence ? `${summary} ${priceSentence}` : summary;
	}

	const higherPhrases: string[] = [];
	const lowerPhrases: string[] = [];
	const nutrientDefinitions = NUTRIENT_DEFINITIONS.filter((definition) => {
		if (definition.key === 'saltG' || definition.key === 'sodiumMg') {
			if (!(product.nutrition?.saltG != null || other.nutrition?.saltG != null)) {
				return definition.key === 'sodiumMg';
			}
			return definition.key === 'saltG';
		}
		return true;
	});

	for (const definition of nutrientDefinitions) {
		const currentValue = normalisedValue(product, definition.key);
		const otherValue = normalisedValue(other, definition.key);

		if (currentValue == null || otherValue == null) {
			continue;
		}

		if (isNegligibleDifference(currentValue, otherValue)) {
			continue;
		}

		if (currentValue > otherValue) {
			higherPhrases.push(nutrientDescription(definition.label, 'higher'));
		} else {
			lowerPhrases.push(nutrientDescription(definition.label, 'lower'));
		}
	}

	const priceSentence = priceDifferenceSentence(product, other);
	let summary = `Compared with ${other.name}, ${product.name}`;

	if (higherPhrases.length === 0 && lowerPhrases.length === 0) {
		summary += ' has similar values for the available nutrients';
	} else if (higherPhrases.length > 0 && lowerPhrases.length > 0) {
		summary += ` has ${joinPhrases(higherPhrases)} but ${joinPhrases(lowerPhrases)}`;
	} else if (higherPhrases.length > 0) {
		summary += ` has ${joinPhrases(higherPhrases)}`;
	} else {
		summary += ` has ${joinPhrases(lowerPhrases)}`;
	}

	return priceSentence ? `${summary}. ${priceSentence}` : `${summary}.`;
}

export function formatComparisonNutrition(
	value: string | number | null | undefined,
	otherValue: string | number | null | undefined,
	unit: string,
	unitsCompatible = true
): NutritionComparison {
	const current = numericValue(value);
	const other = numericValue(otherValue);
	const formattedValue = formatNutritionValue(
		current === null ? value : Number(current.toFixed(2)),
		unit
	);
	if (!unitsCompatible || current === null || other === null) {
		return { value: formattedValue, percentage: 'N/A', percentageClass: 'neutral' };
	}
	if (current === 0 || other === 0) {
		return { value: formattedValue, percentage: 'N/A', percentageClass: 'neutral' };
	}
	const percentage = ((current - other) / other) * 100;
	const sign = percentage > 0 ? '+' : percentage < 0 ? '−' : '';
	return {
		value: formattedValue,
		percentage: `${sign}${Math.abs(percentage).toFixed(2)}%`,
		percentageClass: percentage > 0 ? 'positive' : percentage < 0 ? 'negative' : 'neutral'
	};
}
