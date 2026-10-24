export interface HealthResponse {
	status: string;
	database: string;
}

export interface Nutrition {
	basis: 'perServing' | 'per100g' | 'unknown';
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
	cholesterolMg: string | null;
	calciumMg: string | null;
	ironMg: string | null;
	vitamins: string | null;
	servingSize: string | null;
	servingUnit: string | null;
}

export interface Product {
	id: string;
	name: string;
	brand: string | null;
	ingredients: string | null;
	nutriScore: string | null;
	novaGroup: number | null;
	priceInr: number | null;
	imageUrl: string | null;
	categories: string[];
	nutrition: Nutrition | null;
}

export interface ProductSummary {
	id: string;
	name: string;
	brand: string | null;
	nutriScore: string | null;
	novaGroup: number | null;
	priceInr?: number | null;
	imageUrl: string | null;
	category: string | null;
	nutrition: Nutrition | null;
}

export interface ProductSearchFilters {
	categories?: string[];
}

export interface AuthUser {
	id: string;
	name: string;
	email: string;
	role: 'user' | 'moderator';
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
	priceInr: string | null;
	nutrition: Nutrition | null;
}

export interface CreateModeratorProductInput {
	name: string;
	brand: string | null;
	categoryId: string | null;
	ingredients: string | null;
	priceInr: string | null;
	imageUrl: string | null;
	nutrition: Nutrition;
}

export interface CreatedModeratorProduct {
	ok: true;
	id: string;
	name: string;
	priceInr: string | null;
	imageUrl: string | null;
}
