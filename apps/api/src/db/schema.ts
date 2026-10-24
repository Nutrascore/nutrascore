import {
  pgTable,
  uuid,
  varchar,
  text,
  smallint,
  numeric,
  timestamp,
  boolean,
  primaryKey,
} from "drizzle-orm/pg-core";

// Products
export const products = pgTable("Products", {
  id: uuid("id").primaryKey(),
  name: varchar("name").notNull(),
  brand: varchar("brand"),
  barcode: varchar("barcode").unique(),
  ingredients: text("ingredients"),
  nutriScore: varchar("nutri_score"),
  novaGroup: smallint("nova_group"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

// Product Images
export const productImages = pgTable("ProductImages", {
  id: uuid("id").primaryKey(),
  productId: uuid("product_id").notNull(),
  imageUrl: text("image_url").notNull(),
  imageType: varchar("image_type"),
  isPrimary: boolean("is_primary").notNull(),
});

export const users = pgTable("Users", {
  id: uuid("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: varchar("role", { length: 20 }).notNull().default("user"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const userSessions = pgTable("user_sessions", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id").notNull(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const productFavourites = pgTable(
  "product_favourites",
  {
    userId: uuid("user_id").notNull(),
    productId: uuid("product_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.productId] })],
);

export const productImageReviews = pgTable("product_image_reviews", {
  productId: uuid("product_id").primaryKey(),
  reviewStatus: varchar("review_status", { length: 20 }).notNull().default("needs_review"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

// Categories
export const categories = pgTable("categories", {
  id: uuid("id").primaryKey(),
  name: varchar("name").unique().notNull(),
  description: text("description"),
});

// Product Categories
export const productCategories = pgTable(
  "product_categories",
  {
    productId: uuid("product_id").notNull(),
    categoryId: uuid("category_id").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.productId, table.categoryId],
    }),
  ],
);

// Nutrition
export const nutrition = pgTable("Nutrition", {
  id: uuid("id").primaryKey(),
  productId: uuid("product_id").unique().notNull(),
  kcalPer100g: numeric("kcal_per_100g"),
  fatG: numeric("fat_g"),
  saturatedFatG: numeric("saturated_fat_g"),
  transFatG: numeric("trans_fat_g"),
  carbohydratesG: numeric("carbohydrates_g"),
  sugarsG: numeric("sugars_g"),
  fibreG: numeric("fibre_g"),
  proteinG: numeric("protein_g"),
  sodiumMg: numeric("sodium_mg"),
  saltG: numeric("salt_g"),
  servingSize: numeric("serving_size"),
  servingUnit: varchar("serving_unit", { length: 20 }),
});

// Allergens
export const allergens = pgTable("allergens", {
  id: uuid("id").primaryKey(),
  name: varchar("name").unique().notNull(),
});

// Product Allergens
export const productAllergens = pgTable(
  "product_allergens",
  {
    productId: uuid("product_id").notNull(),
    allergenId: uuid("allergen_id").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.productId, table.allergenId],
    }),
  ],
);