export function getVisiblePages(currentPage: number, totalPages: number): number[] {
	if (totalPages <= 0) return [];
	if (totalPages <= 5) {
		return Array.from({ length: totalPages }, (_, index) => index + 1);
	}

	const start = Math.min(Math.max(currentPage - 2, 1), totalPages - 4);
	return Array.from({ length: 5 }, (_, index) => start + index);
}

export function getPageStateAfterDeletion(
	currentPage: number,
	totalItems: number,
	pageSize: number
): { page: number; total: number; totalPages: number } {
	const total = Math.max(0, totalItems - 1);
	const totalPages = Math.ceil(total / pageSize);
	return {
		page: totalPages === 0 ? 1 : Math.min(currentPage, totalPages),
		total,
		totalPages
	};
}
