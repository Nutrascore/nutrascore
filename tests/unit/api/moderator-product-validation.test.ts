import { describe, expect, it } from "vitest";
import {
  normalizeProductMatch,
  parseModeratorNutrition,
  parseModeratorPrice,
} from "../../../apps/api/src/routes/moderator-product-validation.js";

describe("moderator product validation", () => {
  it("normalizes products and validates nutrition, serving, and price fields", () => {
    expect(normalizeProductMatch("  Choco  Bar ")).toBe("choco bar");
    expect(normalizeProductMatch(null)).toBe("");
    const result = parseModeratorNutrition({
      kcalPer100g: "123.4",
      proteinG: 4,
      servingSize: "30",
      servingUnit: "ML",
      basis: "perServing",
      vitamins: "Vitamin D (mcg) 2",
    });
    expect(result.error).toBeUndefined();
    expect(result.values.kcalPer100g).toBe("123.4");
    expect(result.servingUnit).toBe("ml");
    expect(result.basis).toBe("perServing");
    expect(result.vitamins).toBe("Vitamin D (mcg) 2");
    expect(parseModeratorNutrition({ sodiumMg: -1 }).error).toContain(
      "sodiumMg",
    );
    expect(
      parseModeratorNutrition({ kcalPer100g: "not-a-number" }).error,
    ).toContain("kcalPer100g");
    expect(parseModeratorNutrition({ servingUnit: "packet" }).error).toContain(
      "Serving unit",
    );
    expect(parseModeratorNutrition({ basis: "unknown" }).error).toContain(
      "basis",
    );
    expect(parseModeratorNutrition({ vitamins: 3 }).error).toContain(
      "vitamins",
    );
    expect(parseModeratorPrice(null)).toEqual({ priceInr: null });
    expect(parseModeratorPrice("")).toEqual({ priceInr: null });
    expect(parseModeratorPrice("0")).toEqual({ priceInr: "0" });
    expect(parseModeratorPrice("12.75")).toEqual({ priceInr: "12.75" });
    expect(parseModeratorPrice("-1").error).toContain("non-negative");
    expect(parseModeratorPrice("not-a-price").error).toContain("non-negative");
    expect(parseModeratorPrice(Number.NaN).error).toContain("non-negative");
  });
});
