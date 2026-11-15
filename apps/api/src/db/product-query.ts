import { nutritionBasisFromDatabase } from './numeric.js';

export interface ProductQueryRow {
	id: string;
	name: string;
	brand: string | null;
	ingredients: string | null;
	price_inr: number | null;
	image_url: string | null;
	categories: string[];
	calories: number | null;
	fat_g: number | null;
	saturated_fat_g: number | null;
	trans_fat_g: number | null;
	carbohydrates_g: number | null;
	sugars_g: number | null;
	fibre_g: number | null;
	protein_g: number | null;
	sodium_mg: number | null;
	salt_g: number | null;
	cholesterol_mg: number | null;
	calcium_mg: number | null;
	iron_mg: number | null;
	vitamins: string | null;
	serving_size: number | null;
	serving_unit: string | null;
	nutrition_basis: string | null;
}

export type ProductSummaryRow = Omit<ProductQueryRow, 'ingredients' | 'categories'> & {
	category_name: string | null;
};

export function productDetailsQuery(ids: string[]) {
	const placeholders = ids.map((_, index) => `$${index + 1}`);
	const requestedOrder = ids.map((_, index) => `WHEN $${index + 1} THEN ${index}`).join(' ');
	return {
		statement: `
			SELECT
				p.id,
				p.name,
				p.brand,
				p.ingredients,
				p.price_inr,
				p.image_url,
				COALESCE((
					SELECT json_group_array(c.name)
					FROM (
						SELECT c.name
						FROM product_categories pc
						INNER JOIN categories c ON c.id = pc.category_id
						WHERE pc.product_id = p.id
						ORDER BY c.name
					) c
				), '[]') AS categories,
				p.calories,
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
			WHERE p.id IN (${placeholders.join(', ')})
			ORDER BY CASE p.id ${requestedOrder} ELSE ${ids.length} END
		`,
		values: ids,
	};
}

export function mapProduct(row: ProductQueryRow) {
	return {
		id: row.id,
		name: row.name,
		brand: row.brand,
		ingredients: row.ingredients,
		imageUrl: row.image_url,
		categories: typeof row.categories === 'string'
			? JSON.parse(row.categories) as string[]
			: row.categories,
		priceInr: row.price_inr,
		nutrition: {
			calories: row.calories,
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

export function mapProductSummary(
	row: ProductSummaryRow,
) {
	return {
		id: row.id,
		name: row.name,
		brand: row.brand,
		imageUrl: row.image_url,
		category: row.category_name,
		priceInr: row.price_inr,
		nutrition: {
			calories: row.calories,
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
