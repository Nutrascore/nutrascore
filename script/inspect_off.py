from pathlib import Path
import pandas as pd

# Paths relative to the NutraScore project root
INPUT_FILE = Path("data/raw/food.parquet")
OUTPUT_FILE = Path("data/raw/india_products.parquet")

print("Loading dataset...")
df = pd.read_parquet(INPUT_FILE)

print(f"Total OFF records: {len(df):,}")

# Filter products associated with India
india_mask = df["countries_tags"].apply(
    lambda x: isinstance(x, list) and "en:india" in x
)

india_df = df[india_mask].copy()

print(f"India records: {len(india_df):,}")

# Save the filtered dataset
india_df.to_parquet(
    OUTPUT_FILE,
    index=False
)

print(f"\nSaved to: {OUTPUT_FILE}")

# Show a few examples
print("\nExamples:")
print(
    india_df[
        ["code", "product_name", "brands"]
    ].head(10).to_string(index=False)
)