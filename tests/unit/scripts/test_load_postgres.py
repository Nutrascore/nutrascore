import unittest

from script.load_postgres import (
    duckdb_connection_string,
    load_csv,
    normalize_category_name,
    parse_numeric,
)


class LoadPostgresTests(unittest.TestCase):
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
