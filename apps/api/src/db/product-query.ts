import { nutritionBasisFromDatabase, numericToNumber } from './numeric.js';

export interface ProductQueryRow {
	id: string;
	name: string;
	brand: string | null;
	ingredients: string | null;
	price_inr: string | null;
	image_url: string | null;
	categories: string[];
	kcal_per_100g: string | null;
	fat_g: string | null;
	saturated_fat_g: string | null;
	trans_fat_g: string | null;
	carbohydrates_g: string | null;
	sugars_g: string | null;
	fibre_g: string | null;
	protein_g: string | null;
	sodium_mg: string | null;
	salt_g: string | null;
	cholesterol_mg: string | null;
	calcium_mg: string | null;
	iron_mg: string | null;
	vitamins: string | null;
	serving_size: string | null;
	serving_unit: string | null;
	nutrition_basis: string | null;
}

export const PRODUCT_DETAILS_QUERY = `
	SELECT
		p.id,
		p.name,
		p.brand,
		p.ingredients,
		p.price_inr,
		p.image_url,
		COALESCE((
			SELECT array_agg(c.name ORDER BY c.name)
			FROM product_categories pc
			INNER JOIN categories c ON c.id = pc.category_id
			WHERE pc.product_id = p.id
		), ARRAY[]::text[]) AS categories,
		p.kcal_per_100g,
		p.fat_g,
		p.saturated_fat_g,
		p.trans_fat_g,
		p.carbohydrates_g,
		p.sugars_g,
		p.fibre_g,
		p.protein_g,
		p.sodium_mg,
		p.salt_g,
		p.cholesterol_mg,
		p.calcium_mg,
		p.iron_mg,
		p.vitamins,
		p.serving_size,
		p.serving_unit,
		p.nutrition_basis
	FROM "Products" p
	WHERE p.id = ANY($1::uuid[])
	ORDER BY array_position($1::uuid[], p.id)
`;

export function mapProduct(row: ProductQueryRow) {
	return {
		id: row.id,
		name: row.name,
		brand: row.brand,
		ingredients: row.ingredients,
		imageUrl: row.image_url,
		categories: row.categories,
		priceInr: numericToNumber(row.price_inr),
		nutrition: {
			kcalPer100g: row.kcal_per_100g,
			fatG: row.fat_g,
			saturatedFatG: row.saturated_fat_g,
			transFatG: row.trans_fat_g,
			carbohydratesG: row.carbohydrates_g,
			sugarsG: row.sugars_g,
			fibreG: row.fibre_g,
			proteinG: row.protein_g,
			sodiumMg: row.sodium_mg,
			saltG: row.salt_g,
			cholesterolMg: row.cholesterol_mg,
			calciumMg: row.calcium_mg,
			ironMg: row.iron_mg,
			vitamins: row.vitamins,
			servingSize: row.serving_size,
			servingUnit: row.serving_unit,
			basis: nutritionBasisFromDatabase(row.nutrition_basis),
		},
	};
}
