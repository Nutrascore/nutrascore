import { apiFetch } from './client';
import type {
	CreateModeratorProductInput,
	CreatedModeratorProduct,
	ModeratorProduct,
	ModeratorProductDetails,
	Nutrition
} from './types';

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

export function createModeratorProduct(
	product: CreateModeratorProductInput
): Promise<CreatedModeratorProduct> {
	return apiFetch('/api/moderator/products', {
		method: 'POST',
		body: JSON.stringify(product)
	});
}

export function updateModeratorImage(
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

export function getModeratorProduct(productId: string): Promise<ModeratorProductDetails> {
	return apiFetch(`/api/moderator/products/${encodeURIComponent(productId)}`);
}

export function updateModeratorProduct(
	productId: string,
	details: {
		name: string;
		brand: string | null;
		ingredients: string | null;
		priceInr: string | null;
		nutrition: Nutrition;
	}
) {
	return apiFetch(`/api/moderator/products/${encodeURIComponent(productId)}/details`, {
		method: 'PUT',
		body: JSON.stringify(details)
	});
}

export function deleteModeratorProduct(
	productId: string
): Promise<{ ok: true; id: string; name: string }> {
	return apiFetch(`/api/moderator/products/${encodeURIComponent(productId)}`, {
		method: 'DELETE',
		body: '{}'
	});
}

export function removeModeratorImage(productId: string) {
	return apiFetch(`/api/moderator/products/${encodeURIComponent(productId)}/image`, {
		method: 'DELETE',
		body: '{}'
	});
}

export function markModeratorImageForReview(productId: string) {
	return apiFetch(`/api/moderator/products/${encodeURIComponent(productId)}/review`, {
		method: 'POST',
		body: '{}'
	});
}
