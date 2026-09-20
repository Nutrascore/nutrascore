export function formatNutritionValue(value: string | number | null | undefined, unit = ''): string {
	if (value === null || value === undefined || value === '') {
		return 'N/A';
	}

	const text = String(value).trim();
	const formatted = /^([+-]?\d+)(\.\d+)?$/.test(text)
		? text.replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1')
		: text;

	return `${formatted}${unit}`;
}
