import unittest

from script.load_postgres import (
    CSV_PATH,
    PRODUCT_TABLES,
    REQUIRED_COLUMNS_IN_DATABASE,
    REQUIRED_TABLES,
    duckdb_connection_string,
    load_csv,
    normalize_category_name,
    parse_numeric,
)
from script.validate_dataset import DEFAULT_INPUT


class LoadPostgresTests(unittest.TestCase):
    def test_import_schema_uses_five_table_model_without_separate_nutrition(self) -> None:
        self.assertEqual(REQUIRED_TABLES, {"Products", "categories", "product_categories"})
        self.assertEqual(PRODUCT_TABLES, ('"Products"', "product_categories", "categories"))
        self.assertIn("image_url", REQUIRED_COLUMNS_IN_DATABASE["Products"])
        self.assertIn("nutrition_basis", REQUIRED_COLUMNS_IN_DATABASE["Products"])
        self.assertNotIn("Nutrition", REQUIRED_TABLES)
        self.assertNotIn("created_at", REQUIRED_COLUMNS_IN_DATABASE["Products"])
        self.assertNotIn("updated_at", REQUIRED_COLUMNS_IN_DATABASE["Products"])

    def test_importer_and_validator_share_the_canonical_cleaned_csv(self) -> None:
        self.assertEqual(CSV_PATH, DEFAULT_INPUT)
        self.assertEqual(CSV_PATH.name, "packaged_foods_india_cleaned.csv")
        self.assertEqual(CSV_PATH.parent.name, "processed")

    def test_import_data_preserves_values_without_inventing_nutrition_basis(self) -> None:
        products, nutrition, _, _ = load_csv()
        product = products[
            products["name"].str.contains(
                "Sunfeast Baked Creations Rich Choco Chip Cookies",
                regex=False,
            )
        ].iloc[0]
        nutrients = nutrition[nutrition["product_id"] == product["id"]].iloc[0]

        self.assertEqual(product["price_inr"], 25)
        self.assertEqual(nutrients["serving_size"], 20)
        self.assertEqual(nutrients["serving_unit"], "g")
        self.assertEqual(nutrients["kcal_per_100g"], 105)
        self.assertEqual(nutrients["carbohydrates_g"], 12.6)
        self.assertIsNone(nutrients["nutrition_basis"])
        self.assertIsNone(parse_numeric("not a number"))
        self.assertIsNone(parse_numeric(-1))
        self.assertIsNone(parse_numeric(0, allow_zero=False))
        self.assertEqual(parse_numeric(0), 0)
        self.assertTrue(products["price_inr"].isna().any())
        self.assertTrue(nutrition["kcal_per_100g"].isna().any())

    def test_categories_normalize_case_and_whitespace(self) -> None:
        self.assertEqual(
            normalize_category_name("  Snack   Foods "),
            normalize_category_name("snack foods"),
        )

    def test_database_url_password_is_in_connection_options(self) -> None:
        connection_string = duckdb_connection_string(
            "postgresql://audit-user:a%40udit%27pass@localhost/nutrascore"
        )
        self.assertIn("password='a@udit\\'pass'", connection_string)


if __name__ == "__main__":
    unittest.main()
