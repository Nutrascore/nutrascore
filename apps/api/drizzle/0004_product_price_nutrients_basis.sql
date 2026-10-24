ALTER TABLE "Products"
  ADD COLUMN IF NOT EXISTS price_inr numeric;

ALTER TABLE "Nutrition"
  ADD COLUMN IF NOT EXISTS cholesterol_mg numeric,
  ADD COLUMN IF NOT EXISTS calcium_mg numeric,
  ADD COLUMN IF NOT EXISTS iron_mg numeric,
  ADD COLUMN IF NOT EXISTS vitamins text,
  ADD COLUMN IF NOT EXISTS nutrition_basis varchar(20) NOT NULL DEFAULT 'per_100g';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Nutrition_nutrition_basis_check'
      AND conrelid = '"Nutrition"'::regclass
  ) THEN
    ALTER TABLE "Nutrition"
      ADD CONSTRAINT "Nutrition_nutrition_basis_check"
      CHECK (nutrition_basis IN ('per_serving', 'per_100g'));
  END IF;
END;
$$;
