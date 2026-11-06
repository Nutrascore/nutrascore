import unittest
from decimal import Decimal

from script.sync_product_csv import (
    NUTRITION_COLUMNS,
    match_products,
    normalize,
    serving_amounts,
    validate_schema,
)


def existing_nutrition():
    return {
        "nutrition_basis": "per_100g",
        "serving_size": None,
        "serving_unit": None,
        "kcal_per_100g": Decimal("500"),
        "fat_g": Decimal("10"),
        "saturated_fat_g": None,
        "trans_fat_g": None,
        "carbohydrates_g": None,
        "sugars_g": None,
        "fibre_g": None,
        "protein_g": None,
        "sodium_mg": None,
        "salt_g": None,
        "cholesterol_mg": None,
        "calcium_mg": None,
        "iron_mg": None,
        "vitamins": None,
    }


class ProductCsvSyncTests(unittest.TestCase):
    def test_schema_validation_does_not_require_product_timestamps(self) -> None:
        class FakeCursor:
            def __init__(self):
                self.columns = [
                    ("Products", column)
                    for column in (
                        "id",
                        "name",
                        "brand",
                        "price_inr",
                        *NUTRITION_COLUMNS,
                    )
                ]

            def __enter__(self):
                return self

            def __exit__(self, *_):
                return False

            def execute(self, *_):
                pass

            def fetchall(self):
                return self.columns

        class FakeConnection:
            def cursor(self):
                return FakeCursor()

        validate_schema(FakeConnection())

    def test_matching_requires_unique_name_and_brand(self) -> None:
        self.assertEqual(normalize("  Choco & Crème! "), "choco creme")
        rows = [
            {"_row_number": "2", "Item name": "Choco & Creme", "Brand_Name": "Brand"},
            {"_row_number": "3", "Item name": "Same Product", "Brand_Name": "Brand"},
        ]
        products = [
            {"id": "1", "name": "Choco Creme", "brand": "Brand"},
            {"id": "2", "name": "Same Product", "brand": "Brand"},
            {"id": "3", "name": "Same Product", "brand": "Brand"},
        ]

        matches = match_products(rows, products)

        self.assertEqual(matches[0]["status"], "matched")
        self.assertEqual(matches[0]["product_id"], "1")
        self.assertEqual(matches[1]["status"], "ambiguous")
        self.assertEqual(matches[1]["product_id"], "")

    def test_keeps_nutrition_basis_unchanged_and_rejects_unverified_conversion(self) -> None:
        row = {
            "Serving_Size_g": "20",
            "Calories_kcal": "105",
            "Total_Fat_g": "",
            "Vitamin": "",
        }
        values, reason = serving_amounts(row, existing_nutrition(), "per_100g")

        self.assertIsNone(reason)
        self.assertEqual(values["kcal_per_100g"], Decimal("105"))
        self.assertEqual(values["fat_g"], Decimal("10"))
        self.assertEqual(values["serving_size"], Decimal("20"))
        self.assertEqual(values["serving_unit"], "g")
        self.assertEqual(values["nutrition_basis"], "per_100g")

        values, reason = serving_amounts(row, existing_nutrition(), "per_serving")
        self.assertIsNone(values)
        self.assertIn("no conversion was attempted", reason)

        values, reason = serving_amounts(row, existing_nutrition(), None)
        self.assertIsNone(values)
        self.assertIn("basis is unspecified", reason)


if __name__ == "__main__":
    unittest.main()
