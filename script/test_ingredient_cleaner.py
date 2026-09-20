import unittest

from ingredient_cleaner import clean_ingredient_text


class IngredientCleanerTests(unittest.TestCase):
    def test_plain_ingredients(self):
        value = "Water, sugar, and salt."
        self.assertEqual(clean_ingredient_text(value), value)

    def test_removes_html_tags_and_preserves_text(self):
        value = 'Water, <span class="allergen">milk</span>, sugar'
        self.assertEqual(clean_ingredient_text(value), "Water, milk, sugar")

    def test_normalizes_repeated_whitespace(self):
        value = "  Water,\n\t sugar   and   salt  "
        self.assertEqual(clean_ingredient_text(value), "Water, sugar and salt")

    def test_decodes_html_entities(self):
        value = "Water &amp; sugar&nbsp;(brown)"
        self.assertEqual(clean_ingredient_text(value), "Water & sugar (brown)")

    def test_keeps_parentheses_and_text_unchanged(self):
        value = "Flour (wheat), oil (sunflower), salt"
        self.assertEqual(clean_ingredient_text(value), value)


if __name__ == "__main__":
    unittest.main()
