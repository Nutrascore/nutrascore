import {
  pgTable,
  uuid,
  varchar,
  text,
  numeric,
  timestamp,
  index,
  primaryKey,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const products = pgTable("Products", {
  id: uuid("id").primaryKey(),
  name: varchar("name").notNull(),
  brand: varchar("brand"),
  barcode: varchar("barcode").unique(),
  ingredients: text("ingredients"),
  imageUrl: text("image_url"),
  priceInr: numeric("price_inr"),
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
  cholesterolMg: numeric("cholesterol_mg"),
  calciumMg: numeric("calcium_mg"),
  ironMg: numeric("iron_mg"),
  vitamins: text("vitamins"),
  servingSize: numeric("serving_size"),
  servingUnit: varchar("serving_unit", { length: 20 }),
  nutritionBasis: varchar("nutrition_basis", { length: 20 }),
}, (table) => [
  check(
    "Products_nutrition_basis_check",
    sql`${table.nutritionBasis} in ('per_serving', 'per_100g') or ${table.nutritionBasis} is null`,
  ),
]);

export const users = pgTable("Users", {
  id: uuid("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: varchar("role", { length: 20 }).notNull().default("user"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("Users_role_check", sql`${table.role} in ('user', 'moderator')`),
]);

export const userSessions = pgTable("user_sessions", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("user_sessions_user_id_idx").on(table.userId),
  index("user_sessions_expires_at_idx").on(table.expiresAt),
]);

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey(),
  name: varchar("name").unique().notNull(),
  description: text("description"),
});

export const productCategories = pgTable(
  "product_categories",
  {
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({
      columns: [table.productId, table.categoryId],
    }),
  ],
);
