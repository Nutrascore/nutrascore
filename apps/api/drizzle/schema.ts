import { pgTable, foreignKey, unique, uuid, varchar, text, smallint, timestamp, boolean, numeric, primaryKey } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const products = pgTable("Products", {
	id: uuid().primaryKey().notNull(),
	name: varchar().notNull(),
	brand: varchar(),
	barcode: varchar(),
	ingredients: text(),
	nutriScore: varchar("nutri_score"),
	novaGroup: smallint("nova_group"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.id],
			foreignColumns: [nutrition.productId],
			name: "Products_id_fkey"
		}),
	unique("Products_barcode_key").on(table.barcode),
]);

export const productImages = pgTable("ProductImages", {
	id: uuid().primaryKey().notNull(),
	productId: uuid("product_id").notNull(),
	imageUrl: text("image_url").notNull(),
	imageType: varchar("image_type"),
	isPrimary: boolean("is_primary").notNull(),
}, (table) => [
	foreignKey({
			columns: [table.productId],
			foreignColumns: [products.id],
			name: "ProductImages_product_id_fkey"
		}),
]);

export const nutrition = pgTable("Nutrition", {
	id: uuid().primaryKey().notNull(),
	productId: uuid("product_id").notNull(),
	kcalPer100G: numeric("kcal_per_100g"),
	fatG: numeric("fat_g"),
	saturatedFatG: numeric("saturated_fat_g"),
	transFatG: numeric("trans_fat_g"),
	carbohydratesG: numeric("carbohydrates_g"),
	sugarsG: numeric("sugars_g"),
	fibreG: numeric("fibre_g"),
	proteinG: numeric("protein_g"),
	sodiumMg: numeric("sodium_mg"),
	saltG: numeric("salt_g"),
}, (table) => [
	unique("Nutrition_product_id_key").on(table.productId),
]);

export const categories = pgTable("categories", {
	id: uuid().primaryKey().notNull(),
	name: varchar().notNull(),
	description: text(),
}, (table) => [
	unique("categories_name_key").on(table.name),
]);

export const allergens = pgTable("allergens", {
	id: uuid().primaryKey().notNull(),
	name: varchar().notNull(),
}, (table) => [
	unique("allergens_name_key").on(table.name),
]);

export const productCategories = pgTable("product_categories", {
	productId: uuid("product_id").notNull(),
	categoryId: uuid("category_id").notNull(),
}, (table) => [
	foreignKey({
			columns: [table.productId],
			foreignColumns: [products.id],
			name: "product_categories_product_id_fkey"
		}),
	foreignKey({
			columns: [table.categoryId],
			foreignColumns: [categories.id],
			name: "product_categories_category_id_fkey"
		}),
	primaryKey({ columns: [table.productId, table.categoryId], name: "product_categories_pkey"}),
]);

export const productAllergens = pgTable("product_allergens", {
	productId: uuid("product_id").notNull(),
	allergenId: uuid("allergen_id").notNull(),
}, (table) => [
	foreignKey({
			columns: [table.productId],
			foreignColumns: [products.id],
			name: "product_allergens_product_id_fkey"
		}),
	foreignKey({
			columns: [table.allergenId],
			foreignColumns: [allergens.id],
			name: "product_allergens_allergen_id_fkey"
		}),
	primaryKey({ columns: [table.productId, table.allergenId], name: "product_allergens_pkey"}),
]);
