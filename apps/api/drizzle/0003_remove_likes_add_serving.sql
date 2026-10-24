ALTER TABLE IF EXISTS product_likes RENAME TO product_likes_legacy;
ALTER INDEX IF EXISTS product_likes_product_id_idx RENAME TO product_likes_legacy_product_id_idx;

ALTER TABLE "Nutrition" ADD COLUMN IF NOT EXISTS serving_size numeric;
ALTER TABLE "Nutrition" ADD COLUMN IF NOT EXISTS serving_unit varchar(20);
