import unittest
from typing import Any

from script.replace_product_images_google import (
    count_needs_review_products,
    get_products,
    save_candidate,
    usable_image_row,
)


class FakeResult:
    def __init__(self, rows: list[tuple[Any, ...]]) -> None:
        self.rows = rows

    def fetchall(self) -> list[tuple[Any, ...]]:
        return self.rows

    def fetchone(self) -> tuple[Any, ...] | None:
        return self.rows[0] if self.rows else None


class FakeConnection:
    def __init__(self, rows: list[tuple[Any, ...]]) -> None:
        self.rows = rows
        self.queries: list[tuple[str, tuple[Any, ...]]] = []

    def execute(self, query: str, params: tuple[Any, ...] = ()) -> FakeResult:
        self.queries.append((query, params))
        return FakeResult(self.rows)


class ReplacementSelectionTests(unittest.TestCase):
    def test_existing_image_with_eligible_review_status_is_selected(self) -> None:
        connection = FakeConnection([("product-1", "Snack", "Brand")])

        products = get_products(connection, None)

        self.assertEqual(products[0]["id"], "product-1")
        self.assertIn("review.review_status IS DISTINCT FROM 'needs_review'", connection.queries[0][0])
        self.assertIn("i.image_url IS NOT NULL", connection.queries[0][0])
        self.assertIn("btrim(i.image_url) <> ''", connection.queries[0][0])

    def test_needs_review_products_are_excluded_in_sql(self) -> None:
        connection = FakeConnection([])

        self.assertEqual(get_products(connection, None), [])
        query = connection.queries[0][0]
        self.assertIn("LEFT JOIN public.product_image_reviews", query)
        self.assertIn("IS DISTINCT FROM 'needs_review'", query)

    def test_missing_and_empty_image_urls_are_excluded_in_sql(self) -> None:
        connection = FakeConnection([])

        self.assertEqual(get_products(connection, None), [])
        query = connection.queries[0][0]
        self.assertIn("i.image_url IS NOT NULL", query)
        self.assertIn("btrim(i.image_url) <> ''", query)

    def test_per_product_recheck_also_excludes_needs_review(self) -> None:
        connection = FakeConnection([])

        self.assertIsNone(usable_image_row(connection, "product-1"))
        query = connection.queries[0][0]
        self.assertIn("review.review_status IS DISTINCT FROM 'needs_review'", query)

    def test_needs_review_skip_count_only_counts_products_with_images(self) -> None:
        connection = FakeConnection([(3,)])

        self.assertEqual(count_needs_review_products(connection), 3)
        query = connection.queries[0][0]
        self.assertIn("i.image_url IS NOT NULL", query)
        self.assertIn("btrim(i.image_url) <> ''", query)
        self.assertIn("review.review_status = 'needs_review'", query)

    def test_dry_run_does_not_call_api_update(self) -> None:
        called = False

        def unexpected_update(*args: Any, **kwargs: Any) -> None:
            nonlocal called
            called = True

        import script.replace_product_images_google as runner

        original = runner.authenticated_api_update
        runner.authenticated_api_update = unexpected_update
        try:
            self.assertFalse(save_candidate(False, None, "http://localhost:3000", "product-1", "https://image.test/a.jpg", "https://source.test"))
        finally:
            runner.authenticated_api_update = original

        self.assertFalse(called)


if __name__ == "__main__":
    unittest.main()
