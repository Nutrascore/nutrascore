import { apiFetch } from './client';
import type { Product, ProductSearchFilters, ProductSummary } from './types';

export function getProduct(id: string): Promise<Product> {
	return apiFetch(`/api/products/${encodeURIComponent(id)}`);
}

export function searchProducts(
	query: string,
	page = 1,
	pageSize = 24,
	filters: ProductSearchFilters = {}
): Promise<{
	products: ProductSummary[];
	total: number;
	page: number;
	pageSize: number;
	totalPages: number;
}> {
	const params = new URLSearchParams({
		q: query,
		page: String(page),
		pageSize: String(pageSize)
	});

	if (filters.categories?.length) {
		params.set('categories', filters.categories.join(','));
	}

	return apiFetch(`/api/products/search?${params.toString()}`);
}

export function autocompleteProducts(
	query: string,
	limit = 10
): Promise<{
	suggestions: {
		id: string;
		name: string;
		brand: string | null;
	}[];
}> {
	const params = new URLSearchParams({
		q: query,
		limit: String(limit)
	});

	return apiFetch(`/api/products/autocomplete?${params.toString()}`);
}

export function compareProducts(ids: string[]): Promise<{ products: Product[] }> {
	const params = new URLSearchParams({ ids: ids.join(',') });
	return apiFetch(`/api/compare?${params.toString()}`);
}

export function getCategories(): Promise<{
	categories: {
		id: string;
		name: string;
		description: string | null;
		productCount: number;
	}[];
}> {
	return apiFetch('/api/categories');
}

export function getCategoryProducts(
	categoryId: string,
	limit = 20,
	offset = 0
): Promise<{
	category: {
		id: string;
		name: string;
		description: string | null;
	};
	products: ProductSummary[];
	total: number;
	limit: number;
	offset: number;
}> {
	const params = new URLSearchParams({
		limit: String(limit),
		offset: String(offset)
	});

	return apiFetch(
		`/api/categories/${encodeURIComponent(categoryId)}/products?${params.toString()}`
	);
}
