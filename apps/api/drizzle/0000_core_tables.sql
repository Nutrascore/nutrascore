CREATE TABLE IF NOT EXISTS "Products" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"brand" varchar,
	"barcode" varchar UNIQUE,
	"ingredients" text,
	"nutri_score" varchar,
	"nova_group" smallint,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS "categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL UNIQUE,
	"description" text
);

CREATE TABLE IF NOT EXISTS "allergens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS "ProductImages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL REFERENCES "Products"("id") ON DELETE CASCADE,
	"image_url" text NOT NULL,
	"image_type" varchar,
	"is_primary" boolean NOT NULL
);

CREATE TABLE IF NOT EXISTS "product_categories" (
	"product_id" uuid NOT NULL REFERENCES "Products"("id") ON DELETE CASCADE,
	"category_id" uuid NOT NULL REFERENCES "categories"("id") ON DELETE CASCADE,
	PRIMARY KEY ("product_id", "category_id")
);

CREATE TABLE IF NOT EXISTS "product_allergens" (
	"product_id" uuid NOT NULL REFERENCES "Products"("id") ON DELETE CASCADE,
	"allergen_id" uuid NOT NULL REFERENCES "allergens"("id") ON DELETE CASCADE,
	PRIMARY KEY ("product_id", "allergen_id")
);

CREATE TABLE IF NOT EXISTS "Nutrition" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL UNIQUE REFERENCES "Products"("id") ON DELETE CASCADE,
	"kcal_per_100g" numeric,
	"fat_g" numeric,
	"saturated_fat_g" numeric,
	"trans_fat_g" numeric,
	"carbohydrates_g" numeric,
	"sugars_g" numeric,
	"fibre_g" numeric,
	"protein_g" numeric,
	"sodium_mg" numeric,
	"salt_g" numeric
);
