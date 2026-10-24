
"""Validate the NutraScore packaged-food dataset without modifying it.

Run from any directory:
    python script/validate_dataset.py
    python script/validate_dataset.py --input data/raw/packaged_foods_india.csv
"""

import argparse
from pathlib import Path

import pandas as pd


ROOT_DIR = (
    Path(__file__).resolve().parents[1]
    if Path(__file__).resolve().parent.name == "script"
    else Path(__file__).resolve().parent
)

DEFAULT_INPUT = ROOT_DIR / "data" / "raw" / "packaged_foods_india_cleaned.csv"

NUMERIC_COLUMNS = [
    "Serving_Size_g",
    "Calories_kcal",
    "Carbohydrates_g",
    "Proteins_g",
    "Total_Fat_g",
    "Saturated_Fat_g",
    "Trans_Fat_g",
    "Sugar_g",
    "Sodium_mg",
    "Dietary_Fiber_g",
    "Cholesterol_mg",
    "Calcium_mg",
    "Iron_mg",
    "Price_INR",
]

REQUIRED_COLUMNS = ["S.No", "Item name", "Brand_Name", "Ingredients"]


def main():
    parser = argparse.ArgumentParser(
        description="Report data-quality issues without changing the dataset."
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=DEFAULT_INPUT,
        help="CSV to validate (defaults to the cleaned dataset).",
    )
    parser.add_argument(
        "--report-dir",
        type=Path,
        default=ROOT_DIR / "data" / "reports",
        help="Directory for CSV issue reports.",
    )
    args = parser.parse_args()

    input_path = args.input.resolve()

    if not input_path.is_file():
        raise FileNotFoundError(f"Dataset not found: {input_path}")

    df = pd.read_csv(input_path)
    print(f"Dataset: {input_path}")
    print(f"Rows: {len(df)}")
    print(f"Columns: {len(df.columns)}")

    missing_columns = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing_columns:
        raise ValueError(
            "Missing expected columns: " + ", ".join(missing_columns)
        )

    print("\n=== Missing values by column ===")
    missing = df.isna().sum().sort_values(ascending=False)
    print(missing[missing > 0].to_string() if (missing > 0).any() else "None")

    # Duplicate name/brand pairs are review candidates, not automatic deletions.
    duplicate_mask = df.duplicated(
        subset=["Item name", "Brand_Name"], keep=False
    )
    duplicates = df.loc[duplicate_mask].sort_values(
        ["Item name", "Brand_Name"]
    )

    print("\n=== Duplicate name + brand candidates ===")
    print(f"Rows involved: {len(duplicates)}")
    print(f"Duplicate pairs beyond first occurrences: "
          f"{int(df.duplicated(['Item name', 'Brand_Name']).sum())}")

    # Convert available numeric fields to numbers for validation.
    numeric_columns = [c for c in NUMERIC_COLUMNS if c in df.columns]
    numeric = df[numeric_columns].apply(pd.to_numeric, errors="coerce")

    print("\n=== Numeric summary ===")
    if numeric_columns:
        print(numeric.describe().round(2).to_string())
    else:
        print("No recognized numeric columns found.")

    print("\n=== Negative numeric values ===")
    negative_counts = (numeric < 0).sum()
    print(
        negative_counts[negative_counts > 0].to_string()
        if (negative_counts > 0).any()
        else "None"
    )

    # Flag values that deserve inspection; do not assume they are errors.
    suspicious_mask = pd.Series(False, index=df.index)

    if "Calories_kcal" in numeric:
        suspicious_mask |= numeric["Calories_kcal"] > 900

    if "Serving_Size_g" in numeric:
        suspicious_mask |= numeric["Serving_Size_g"] <= 0

    if all(
        c in numeric.columns
        for c in ["Carbohydrates_g", "Proteins_g", "Total_Fat_g"]
    ):
        macros = numeric[
            ["Carbohydrates_g", "Proteins_g", "Total_Fat_g"]
        ]
        macro_sum = macros.sum(axis=1, min_count=3)
        suspicious_mask |= macro_sum > 100

    suspicious = df.loc[suspicious_mask].copy()

    print("\n=== Suspicious records for manual review ===")
    print(f"Rows flagged: {len(suspicious)}")
    if not suspicious.empty:
        display_columns = [
            c for c in [
                "S.No",
                "Item name",
                "Brand_Name",
                "Serving_Size_g",
                "Calories_kcal",
                "Carbohydrates_g",
                "Proteins_g",
                "Total_Fat_g",
            ]
            if c in suspicious.columns
        ]
        print(suspicious[display_columns].to_string(index=False))
    else:
        print("None flagged by the basic checks.")

    # Report numeric cells that contain non-empty, non-numeric values.
    print("\n=== Non-numeric values in numeric columns ===")
    invalid_numeric = {}
    for column in numeric_columns:
        original = df[column]
        converted = pd.to_numeric(original, errors="coerce")
        invalid = original.notna() & original.astype(str).str.strip().ne("") & converted.isna()
        count = int(invalid.sum())
        if count:
            invalid_numeric[column] = count

    print(
        pd.Series(invalid_numeric).to_string()
        if invalid_numeric
        else "None"
    )

    # Save review files only if there is something to review.
    args.report_dir.mkdir(parents=True, exist_ok=True)

    if not duplicates.empty:
        path = args.report_dir.resolve() / "duplicate_candidates.csv"
        duplicates.to_csv(path, index=False)
        print(f"\nDuplicate review report: {path}")

    if not suspicious.empty:
        path = args.report_dir.resolve() / "suspicious_records.csv"
        suspicious.to_csv(path, index=False)
        print(f"Suspicious-record report: {path}")

    print("\nValidation finished. The input dataset was not modified.")


if __name__ == "__main__":
    main()
