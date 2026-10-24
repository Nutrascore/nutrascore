import { describe, expect, it } from "vitest";
import {
  buildComparisonAnalysis,
  formatComparisonNutrition,
  formatPriceComparison,
} from "$lib/utils/compareNutrition";
import type { Product } from "$lib/api";

function createProduct(
  id: string,
  name: string,
  priceInr: number | null,
  nutrition: Product["nutrition"] = null,
): Product {
  return {
    id,
    name,
    brand: null,
    ingredients: null,
    nutriScore: null,
    novaGroup: null,
    priceInr,
    imageUrl: null,
    categories: [],
    nutrition,
  };
}

const productA = createProduct("a", "Product A", 80, {
  basis: "per100g",
  kcalPer100g: "180",
  fatG: "5",
  carbohydratesG: "12",
  proteinG: "20",
  sugarsG: "1",
  saltG: "0.5",
  fibreG: "7",
  saturatedFatG: "2",
  sodiumMg: null,
  servingSize: null,
  servingUnit: null,
  transFatG: null,
  cholesterolMg: null,
  calciumMg: null,
  ironMg: null,
  vitamins: null,
});

const productB = createProduct("b", "Product B", 100, {
  ...productA.nutrition!,
  proteinG: "12",
  sugarsG: "6",
});

describe("nutrition comparison", () => {
  it("compares nutrient amounts and relative prices for two products", () => {
    const analysis = buildComparisonAnalysis(productA, productB);

    expect(analysis).toContain("more protein");
    expect(analysis).toContain("less sugar");
    expect(analysis).toContain("20% cheaper than Product B");
  });

  it("keeps zero values visible and marks missing or zero-reference comparisons unavailable", () => {
    expect(formatComparisonNutrition("12.4", "15", " g").percentage).toBe(
      "−17.33%",
    );
    expect(formatComparisonNutrition("0", "10", " g")).toMatchObject({
      value: "0 g",
      percentage: "N/A",
    });
    expect(formatComparisonNutrition("5", "0", " g").percentage).toBe("N/A");
    expect(formatComparisonNutrition(null, "10", " g")).toMatchObject({
      value: "N/A",
      percentage: "N/A",
    });
  });

  it("formats prices and avoids percentages for missing or zero prices", () => {
    expect(formatPriceComparison(100, 75)).toMatchObject({
      productAPrice: "₹100",
      productBPrice: "₹75",
      productAPercentage: "+33.33%",
      productBPercentage: "−25.00%",
    });
    expect(formatPriceComparison(0, 75)).toMatchObject({
      productAPercentage: "N/A",
      productBPercentage: "N/A",
    });
    expect(formatPriceComparison(null, 75).productAPercentage).toBe("N/A");
  });
});
