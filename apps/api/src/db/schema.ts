import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const products = sqliteTable("Products", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  brand: text("brand"),
  barcode: text("barcode").unique(),
  ingredients: text("ingredients"),
  imageUrl: text("image_url"),
  nutriScore: text("nutri_score"),
  novaGroup: integer("nova_group"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  priceInr: text("price_inr"),
  kcalPer100g: text("kcal_per_100g"),
  fatG: text("fat_g"),
  saturatedFatG: text("saturated_fat_g"),
  transFatG: text("trans_fat_g"),
  carbohydratesG: text("carbohydrates_g"),
  sugarsG: text("sugars_g"),
  fibreG: text("fibre_g"),
  proteinG: text("protein_g"),
  sodiumMg: text("sodium_mg"),
  saltG: text("salt_g"),
  cholesterolMg: text("cholesterol_mg"),
  calciumMg: text("calcium_mg"),
  ironMg: text("iron_mg"),
  vitamins: text("vitamins"),
  servingSize: text("serving_size"),
  servingUnit: text("serving_unit"),
  nutritionBasis: text("nutrition_basis"),
}, (table) => [
  check(
    "Products_nutrition_basis_check",
    sql`${table.nutritionBasis} in ('per_serving', 'per_100g') or ${table.nutritionBasis} is null`,
  ),
]);

export const users = sqliteTable("Users", {
  id: text("id").primaryKey(),
  name: text("name", { length: 120 }).notNull(),
  email: text("email", { length: 320 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { length: 20 }).notNull().default("user"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  check("Users_role_check", sql`${table.role} in ('user', 'moderator')`),
]);

export const userSessions = sqliteTable("user_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash", { length: 64 }).notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("user_sessions_user_id_idx").on(table.userId),
  index("user_sessions_expires_at_idx").on(table.expiresAt),
]);

export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
});

export const productCategories = sqliteTable(
  "product_categories",
  {
    productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    categoryId: text("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({
      columns: [table.productId, table.categoryId],
    }),
  ],
);
