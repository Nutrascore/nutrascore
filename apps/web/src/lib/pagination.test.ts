import { describe, expect, it } from 'vitest';
import { getPageStateAfterDeletion, getVisiblePages } from './pagination';

describe('getVisiblePages', () => {
	it('shows the first five pages at the beginning', () => {
		expect(getVisiblePages(1, 36)).toEqual([1, 2, 3, 4, 5]);
	});

	it('moves the five-page window in the middle', () => {
		expect(getVisiblePages(6, 36)).toEqual([4, 5, 6, 7, 8]);
	});

	it('shows the final five pages at the end', () => {
		expect(getVisiblePages(36, 36)).toEqual([32, 33, 34, 35, 36]);
	});

	it('handles zero, one, and five pages', () => {
		expect(getVisiblePages(1, 0)).toEqual([]);
		expect(getVisiblePages(1, 1)).toEqual([1]);
		expect(getVisiblePages(1, 5)).toEqual([1, 2, 3, 4, 5]);
	});

	it('moves to the previous page when deleting the final item on a page', () => {
		expect(getPageStateAfterDeletion(3, 41, 20)).toEqual({
			page: 2,
			total: 40,
			totalPages: 2
		});
		expect(getPageStateAfterDeletion(1, 1, 20)).toEqual({
			page: 1,
			total: 0,
			totalPages: 0
		});
	});
});
