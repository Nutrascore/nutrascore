import { describe, expect, it } from 'vitest';
import { normalizeCategoryNames, parsePagination } from './search.js';

describe('search pagination', () => {
	it('uses the default page size and calculates the offset', () => {
		expect(parsePagination()).toEqual({ page: 1, pageSize: 24, offset: 0 });
		expect(parsePagination('3', '24')).toEqual({ page: 3, pageSize: 24, offset: 48 });
	});

	it('rejects invalid page and page size values', () => {
		expect(parsePagination('0', '24')).toBeNull();
		expect(parsePagination('-1', '24')).toBeNull();
		expect(parsePagination('1.5', '24')).toBeNull();
		expect(parsePagination('1', '0')).toBeNull();
		expect(parsePagination('1', '101')).toBeNull();
	});

	it('normalizes category names for matching stored relationships', () => {
		expect(normalizeCategoryNames([' Snacks ', 'Instant Noodles', ''])).toEqual([
			'snacks',
			'instant noodles'
		]);
	});
});
