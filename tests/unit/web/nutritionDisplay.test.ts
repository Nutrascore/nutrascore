import { describe, expect, it } from "vitest";
import { convertNutritionValue } from "$lib/utils/nutritionDisplay";

describe("convertNutritionValue", () => {
  it("converts between serving bases and rejects invalid serving sizes", () => {
    expect(
      convertNutritionValue("105", "perServing", "per100g", "20", "g"),
    ).toBe(525);
    expect(
      convertNutritionValue("500", "per100g", "perServing", "30", "g"),
    ).toBe(150);
    expect(
      convertNutritionValue("12.34", "perServing", "perServing", null, null),
    ).toBe(12.34);
    expect(
      convertNutritionValue("12.34", "unknown", "per100g", "30", "g"),
    ).toBeNull();
    for (const value of [null, undefined, "", "not-a-number", "-2"]) {
      expect(
        convertNutritionValue(value, "perServing", "per100g", "30", "g"),
      ).toBeNull();
    }
    for (const size of [null, undefined, "", "0", "-1", "invalid"]) {
      expect(
        convertNutritionValue("25", "perServing", "per100g", size, "g"),
      ).toBeNull();
    }
    expect(
      convertNutritionValue("25", "perServing", "per100g", "1", "piece"),
    ).toBeNull();
  });
});
