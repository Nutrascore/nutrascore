import { apiFetch, clearCsrfToken } from './api/client';

const API_BASE_URL = `${(import.meta.env.PUBLIC_API_URL ?? 'http://localhost:3000')
	.replace(/\/+$/, '')
	.replace(/\/api$/, '')}/api`;

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
	servingSize: string | null;
	servingUnit: string | null;
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
	categories: string[];
	allergens: string[];
	nutrition: Nutrition | null;
	isFavourite?: boolean;
}

export interface ProductSummary {
	id: string;
	name: string;
	brand: string | null;
	barcode: string | null;
	nutriScore: string | null;
	novaGroup: number | null;
	imageUrl: string | null;
	category: string | null;
	nutrition: Nutrition | null;
	isFavourite?: boolean;
}

export interface ProductSearchFilters {
	categories?: string[];
	nutrition?: string[];
}

async function request<T>(path: string): Promise<T> {
	const response = await fetch(`${API_BASE_URL}${path}`, { credentials: 'include' });

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

export interface AuthUser {
	id: string;
	name: string;
	email: string;
	role: 'user' | 'moderator';
}

export async function getCurrentUser(): Promise<AuthUser | null> {
	const result = await apiFetch<{ user: AuthUser | null }>('/api/auth/me');
	return result.user;
}

export async function register(name: string, email: string, password: string): Promise<AuthUser> {
	const result = await apiFetch<{ user: AuthUser }>('/api/auth/register', {
		method: 'POST',
		body: JSON.stringify({ name, email, password })
	});
	return result.user;
}

export async function login(email: string, password: string): Promise<AuthUser> {
	const result = await apiFetch<{ user: AuthUser }>('/api/auth/login', {
		method: 'POST',
		body: JSON.stringify({ email, password })
	});
	return result.user;
}

export async function logout(): Promise<void> {
	await apiFetch('/api/auth/logout', { method: 'POST', body: '{}' });
	clearCsrfToken();
}

export async function setFavourite(productId: string, favourite: boolean): Promise<void> {
	await apiFetch(`/api/products/${encodeURIComponent(productId)}/favourite`, {
		method: favourite ? 'POST' : 'DELETE',
		body: '{}'
	});
}

export async function getFavourites(): Promise<ProductSummary[]> {
	const result = await apiFetch<{ products: ProductSummary[] }>('/api/account/favourites');
	return result.products;
}

export interface ModeratorProduct {
	id: string;
	name: string;
	brand: string | null;
	category: string;
	image_url: string | null;
	source_url: string | null;
	review_status: string | null;
}

export interface ModeratorProductDetails {
	id: string;
	name: string;
	brand: string | null;
	ingredients: string | null;
	nutrition: Nutrition | null;
}

export interface ModeratorCategory {
	id: string;
	name: string;
}

export interface CreateModeratorProductInput {
	name: string;
	brand: string | null;
	categoryId: string | null;
	ingredients: string | null;
	imageUrl: string | null;
	nutrition: Nutrition;
}

export interface CreatedModeratorProduct {
	ok: true;
	id: string;
	name: string;
	imageUrl: string | null;
}

export async function getModeratorProducts(
	query = '',
	status = '',
	page = 1,
	pageSize = 20
): Promise<{
	products: ModeratorProduct[];
	total: number;
	page: number;
	pageSize: number;
	totalPages: number;
}> {
	const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
	if (query) params.set('q', query);
	if (status) params.set('status', status);
	return apiFetch(`/api/moderator/products?${params.toString()}`);
}

export async function createModeratorProduct(
	product: CreateModeratorProductInput
): Promise<CreatedModeratorProduct> {
	return apiFetch('/api/moderator/products', {
		method: 'POST',
		body: JSON.stringify(product)
	});
}

export async function updateModeratorImage(
	productId: string,
	imageUrl: string,
	sourceUrl: string,
	reviewStatus: 'verified' | 'needs_review' = 'needs_review'
) {
	return apiFetch(`/api/moderator/products/${encodeURIComponent(productId)}/image`, {
		method: 'PUT',
		body: JSON.stringify({ imageUrl, sourceUrl, reviewStatus })
	});
}

export async function getModeratorProduct(productId: string): Promise<ModeratorProductDetails> {
	return apiFetch(`/api/moderator/products/${encodeURIComponent(productId)}`);
}

export async function updateModeratorProduct(
	productId: string,
	details: {
		name: string;
		brand: string | null;
		ingredients: string | null;
		nutrition: Nutrition;
	}
) {
	return apiFetch(`/api/moderator/products/${encodeURIComponent(productId)}/details`, {
		method: 'PUT',
		body: JSON.stringify(details)
	});
}

export async function deleteModeratorProduct(
	productId: string
): Promise<{ ok: true; id: string; name: string }> {
	return apiFetch(`/api/moderator/products/${encodeURIComponent(productId)}`, {
		method: 'DELETE',
		body: '{}'
	});
}

export async function uploadModeratorImage(
	productId: string,
	file: File,
	sourceUrl = '',
	reviewStatus: 'verified' | 'needs_review' = 'needs_review'
) {
	const body = new FormData();
	body.append('image', file);
	body.append('sourceUrl', sourceUrl);
	body.append('reviewStatus', reviewStatus);
	return apiFetch<{ ok: true; imageUrl: string }>(
		`/api/moderator/products/${encodeURIComponent(productId)}/image-upload`,
		{
			method: 'PUT',
			body
		}
	);
}

export async function removeModeratorImage(productId: string) {
	return apiFetch(`/api/moderator/products/${encodeURIComponent(productId)}/image`, {
		method: 'DELETE',
		body: '{}'
	});
}

export async function markModeratorImageForReview(productId: string) {
	return apiFetch(`/api/moderator/products/${encodeURIComponent(productId)}/review`, {
		method: 'POST',
		body: '{}'
	});
}
