const API_BASE_URL = 'http://localhost:3000/api';

export interface Nutrition {
	kcalPer100g: string | null;
	fatG: string | null;
	saturatedFatG: string | null;
	transFatG: string | null;
	carbohydratesG: string | null;
	sugarsG: string | null;
	fibreG: string | null;
	proteinG: string | null;
	sodiumMg: string | null;
	saltG: string | null;
}

export interface Product {
	id: string;
	name: string;
	brand: string | null;
	barcode: string | null;
	ingredients: string | null;
	nutriScore: string | null;
	novaGroup: number | null;
	imageUrl: string | null;
	nutrition: Nutrition | null;
}

export interface ProductSummary {
	id: string;
	name: string;
	brand: string | null;
	barcode: string | null;
	nutriScore: string | null;
	novaGroup: number | null;
	imageUrl: string | null;
	nutrition: Nutrition | null;
}

export interface ProductSearchFilters {
	categories?: string[];
	nutrition?: string[];
}

async function request<T>(path: string): Promise<T> {
	const response = await fetch(`${API_BASE_URL}${path}`);

	if (!response.ok) {
		let message = `API request failed with status ${response.status}`;

		try {
			const error = await response.json();

			if (error?.message) {
				message = error.message;
			}
		} catch {
			// Keep default message.
		}

		throw new Error(message);
	}

	return response.json();
}

export async function getProduct(id: string): Promise<Product> {
	return request<Product>(`/products/${encodeURIComponent(id)}`);
}

export async function getProductByBarcode(barcode: string): Promise<Product> {
	return request<Product>(`/products/barcode/${encodeURIComponent(barcode)}`);
}

export async function searchProducts(
	query: string,
	limit = 20,
	offset = 0,
	filters: ProductSearchFilters = {}
): Promise<{
	products: ProductSummary[];
	total: number;
	limit: number;
	offset: number;
}> {
	const params = new URLSearchParams({
		q: query,
		limit: String(limit),
		offset: String(offset)
	});

	if (filters.categories?.length) {
		params.set('categories', filters.categories.join(','));
	}

	if (filters.nutrition?.length) {
		params.set('nutrition', filters.nutrition.join(','));
	}

	return request(`/products/search?${params.toString()}`);
}

export async function autocompleteProducts(
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

	return request(`/products/autocomplete?${params.toString()}`);
}

export async function compareProducts(ids: string[]): Promise<{
	products: Product[];
}> {
	const params = new URLSearchParams({
		ids: ids.join(',')
	});

	return request(`/compare?${params.toString()}`);
}

export async function getCategories(): Promise<{
	categories: {
		id: string;
		name: string;
		description: string | null;
		productCount: number;
	}[];
}> {
	return request('/categories');
}

export async function getCategoryProducts(
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

	return request(`/categories/${encodeURIComponent(categoryId)}/products?${params.toString()}`);
}
