export interface HealthResponse {
	status: string;
	database: string;
}

export interface Nutrition {
	basis: 'perServing' | 'per100g' | 'per100ml' | 'unknown';
	calories: number | null;
	fatG: number | null;
	saturatedFatG: number | null;
	transFatG: number | null;
	carbohydratesG: number | null;
	sugarsG: number | null;
	fibreG: number | null;
	proteinG: number | null;
	sodiumMg: number | null;
	saltG: number | null;
	cholesterolMg: number | null;
	calciumMg: number | null;
	ironMg: number | null;
	vitamins: string | null;
	servingSize: number | null;
	servingUnit: string | null;
}

export interface Product {
	id: string;
	name: string;
	brand: string | null;
	ingredients: string | null;
	priceInr: number | null;
	imageUrl: string | null;
	categories: string[];
	nutrition: Nutrition | null;
}

export interface ProductSummary {
	id: string;
	name: string;
	brand: string | null;
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
	imageUrl: string | null;
}

export interface ModeratorProductDetails {
	id: string;
	name: string;
	brand: string | null;
	ingredients: string | null;
	priceInr: number | null;
	imageUrl: string | null;
	categories: string[];
	nutrition: Nutrition | null;
}

export interface CreateModeratorProductInput {
	name: string;
	brand: string | null;
	categoryId: string | null;
	ingredients: string | null;
	priceInr: string | null;
	imageUrl?: string | null;
	nutrition: Nutrition;
}

export interface CreatedModeratorProduct {
	ok: true;
	id: string;
	name: string;
	priceInr: number | null;
	imageUrl: string | null;
}
