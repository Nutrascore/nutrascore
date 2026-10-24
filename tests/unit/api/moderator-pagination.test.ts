import { describe, expect, it } from "vitest";
import {
  getModeratorTotalPages,
  parseModeratorPaginationValue,
} from "../../../apps/api/src/routes/moderator-pagination.js";

describe("moderator pagination", () => {
  it("accepts valid pages, rejects invalid values, and calculates page totals", () => {
    expect(parseModeratorPaginationValue(undefined, 1)).toBe(1);
    expect(parseModeratorPaginationValue("25", 1)).toBe(25);
    for (const value of ["0", "-1", "1.5", "abc", ""]) {
      expect(parseModeratorPaginationValue(value, 1)).toBeNull();
    }
    expect(parseModeratorPaginationValue("101", 24, 100)).toBeNull();
    expect(getModeratorTotalPages(41, 20)).toBe(3);
    expect(getModeratorTotalPages(0, 20)).toBe(0);
  });
});
