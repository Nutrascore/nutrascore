import { relations } from "drizzle-orm/relations";
import { nutrition, products, productImages, productCategories, categories, productAllergens, allergens } from "./schema";

export const productsRelations = relations(products, ({one, many}) => ({
	nutrition: one(nutrition, {
		fields: [products.id],
		references: [nutrition.productId]
	}),
	productImages: many(productImages),
	productCategories: many(productCategories),
	productAllergens: many(productAllergens),
}));

export const nutritionRelations = relations(nutrition, ({many}) => ({
	products: many(products),
}));

export const productImagesRelations = relations(productImages, ({one}) => ({
	product: one(products, {
		fields: [productImages.productId],
		references: [products.id]
	}),
}));

export const productCategoriesRelations = relations(productCategories, ({one}) => ({
	product: one(products, {
		fields: [productCategories.productId],
		references: [products.id]
	}),
	category: one(categories, {
		fields: [productCategories.categoryId],
		references: [categories.id]
	}),
}));

export const categoriesRelations = relations(categories, ({many}) => ({
	productCategories: many(productCategories),
}));

export const productAllergensRelations = relations(productAllergens, ({one}) => ({
	product: one(products, {
		fields: [productAllergens.productId],
		references: [products.id]
	}),
	allergen: one(allergens, {
		fields: [productAllergens.allergenId],
		references: [allergens.id]
	}),
}));

export const allergensRelations = relations(allergens, ({many}) => ({
	productAllergens: many(productAllergens),
}));