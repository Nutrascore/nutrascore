PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `Products_new` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`brand` text,
	`ingredients` text,
	`image_url` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`price_inr` real,
	`calories` real,
	`fat_g` real,
	`saturated_fat_g` real,
	`trans_fat_g` real,
	`carbohydrates_g` real,
	`sugars_g` real,
	`fibre_g` real,
	`protein_g` real,
	`sodium_mg` real,
	`salt_g` real,
	`cholesterol_mg` real,
	`calcium_mg` real,
	`iron_mg` real,
	`vitamins` text,
	`serving_size` real,
	`serving_unit` text,
	`nutrition_basis` text,
	CONSTRAINT "Products_nutrition_basis_check" CHECK("Products_new"."nutrition_basis" in ('per_serving', 'per_100g', 'per_100ml') or "Products_new"."nutrition_basis" is null),
	CONSTRAINT "Products_serving_unit_check" CHECK("Products_new"."serving_unit" in ('g', 'ml') or "Products_new"."serving_unit" is null)
);
--> statement-breakpoint
INSERT INTO `Products_new` (
	`id`, `name`, `brand`, `ingredients`, `image_url`, `created_at`, `updated_at`,
	`price_inr`, `calories`, `fat_g`, `saturated_fat_g`, `trans_fat_g`,
	`carbohydrates_g`, `sugars_g`, `fibre_g`, `protein_g`, `sodium_mg`, `salt_g`,
	`cholesterol_mg`, `calcium_mg`, `iron_mg`, `vitamins`, `serving_size`,
	`serving_unit`, `nutrition_basis`
)
SELECT
	`id`, `name`, `brand`, `ingredients`, `image_url`, `created_at`, `updated_at`,
	CAST(`price_inr` AS REAL), CAST(`kcal_per_100g` AS REAL), CAST(`fat_g` AS REAL),
	CAST(`saturated_fat_g` AS REAL), CAST(`trans_fat_g` AS REAL),
	CAST(`carbohydrates_g` AS REAL), CAST(`sugars_g` AS REAL), CAST(`fibre_g` AS REAL),
	CAST(`protein_g` AS REAL), CAST(`sodium_mg` AS REAL), CAST(`salt_g` AS REAL),
	CAST(`cholesterol_mg` AS REAL), CAST(`calcium_mg` AS REAL), CAST(`iron_mg` AS REAL),
	`vitamins`, CAST(`serving_size` AS REAL), `serving_unit`, `nutrition_basis`
FROM `Products`;
--> statement-breakpoint
DROP TABLE `Products`;
--> statement-breakpoint
ALTER TABLE `Products_new` RENAME TO `Products`;
--> statement-breakpoint
PRAGMA foreign_keys=ON;
