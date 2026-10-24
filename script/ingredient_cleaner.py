import argparse
import html
import re
from pathlib import Path

import pandas as pd


# Resolve paths relative to the repository.
ROOT_DIR = (
    Path(__file__).resolve().parents[1]
    if Path(__file__).resolve().parent.name == "script"
    else Path(__file__).resolve().parent
)

DEFAULT_INPUT = ROOT_DIR / "data" / "raw" / "packaged_foods_india.csv"
DEFAULT_OUTPUT = ROOT_DIR / "data" / "raw" / "packaged_foods_india_cleaned.csv"

_HTML_TAG_PATTERN = re.compile(r"<[^>]*>")
_WHITESPACE_PATTERN = re.compile(r"\s+")


def clean_ingredient_text(value):
    """Remove HTML markup and normalize whitespace without rewriting wording."""
    if pd.isna(value):
        return None

    text = html.unescape(str(value))
    text = _HTML_TAG_PATTERN.sub("", text)
    text = html.unescape(text)
    text = _WHITESPACE_PATTERN.sub(" ", text).strip()

    return text or None


def main():
    parser = argparse.ArgumentParser(
        description="Clean ingredient text in the Indian packaged foods dataset."
    )

    parser.add_argument(
        "--input",
        type=Path,
        default=DEFAULT_INPUT,
        help="Input CSV path (default: data/raw/packaged_foods_india.csv)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help="Output CSV path (default: data/raw/packaged_foods_india_cleaned.csv)",
    )
    parser.add_argument(
        "--ingredient-column",
        default="Ingredients",
        help="Name of the ingredient column (default: Ingredients)",
    )

    args = parser.parse_args()

    input_path = args.input.resolve()
    output_path = args.output.resolve()

    if not input_path.is_file():
        raise FileNotFoundError(f"Dataset not found: {input_path}")

    if input_path == output_path:
        raise ValueError(
            "Input and output paths must be different. "
            "The original dataset will not be overwritten."
        )

    df = pd.read_csv(input_path)

    # Match the requested column name without case sensitivity or surrounding
    # whitespace, while preserving the original column names in the output.
    column_lookup = {
        str(column).strip().casefold(): column for column in df.columns
    }
    requested_column = args.ingredient_column.strip().casefold()

    if requested_column not in column_lookup:
        raise ValueError(
            f"Column '{args.ingredient_column}' not found.\n"
            f"Available columns: {', '.join(map(str, df.columns))}"
        )

    ingredient_column = column_lookup[requested_column]

    original_values = df[ingredient_column]
    cleaned_values = original_values.map(clean_ingredient_text)

    changed_rows = int(
        (original_values.fillna("").astype(str) !=
         cleaned_values.fillna("").astype(str)).sum()
    )

    df[ingredient_column] = cleaned_values

    output_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(output_path, index=False)

    print("Ingredient cleaning completed.")
    print(f"Input: {input_path}")
    print(f"Output: {output_path}")
    print(f"Total rows: {len(df)}")
    print(f"Cleaned column: {ingredient_column}")
    print(f"Rows changed: {changed_rows}")
    print("Original dataset was not modified.")


if __name__ == "__main__":
    main()
