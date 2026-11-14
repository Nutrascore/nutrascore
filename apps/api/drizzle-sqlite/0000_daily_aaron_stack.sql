CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_name_unique` ON `categories` (`name`);--> statement-breakpoint
CREATE TABLE `product_categories` (
	`product_id` text NOT NULL,
	`category_id` text NOT NULL,
	PRIMARY KEY(`product_id`, `category_id`),
	FOREIGN KEY (`product_id`) REFERENCES `Products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `Products` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`brand` text,
	`barcode` text,
	`ingredients` text,
	`image_url` text,
	`nutri_score` text,
	`nova_group` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`price_inr` text,
	`kcal_per_100g` text,
	`fat_g` text,
	`saturated_fat_g` text,
	`trans_fat_g` text,
	`carbohydrates_g` text,
	`sugars_g` text,
	`fibre_g` text,
	`protein_g` text,
	`sodium_mg` text,
	`salt_g` text,
	`cholesterol_mg` text,
	`calcium_mg` text,
	`iron_mg` text,
	`vitamins` text,
	`serving_size` text,
	`serving_unit` text,
	`nutrition_basis` text,
	CONSTRAINT "Products_nutrition_basis_check" CHECK("Products"."nutrition_basis" in ('per_serving', 'per_100g') or "Products"."nutrition_basis" is null)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `Products_barcode_unique` ON `Products` (`barcode`);--> statement-breakpoint
CREATE TABLE `user_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text(64) NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `Users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_sessions_token_hash_unique` ON `user_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `user_sessions_user_id_idx` ON `user_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `user_sessions_expires_at_idx` ON `user_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `Users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text(120) NOT NULL,
	`email` text(320) NOT NULL,
	`password_hash` text NOT NULL,
	`role` text(20) DEFAULT 'user' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "Users_role_check" CHECK("Users"."role" in ('user', 'moderator'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `Users_email_unique` ON `Users` (`email`);