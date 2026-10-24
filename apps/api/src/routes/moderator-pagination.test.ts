import { describe, expect, it } from "vitest";
import {
  getModeratorTotalPages,
  parseModeratorPaginationValue,
} from "./moderator-pagination.js";

describe("moderator pagination", () => {
  it("defaults omitted values and accepts positive integer pages", () => {
    expect(parseModeratorPaginationValue(undefined, 1)).toBe(1);
    expect(parseModeratorPaginationValue("25", 1)).toBe(25);
    expect(parseModeratorPaginationValue("100", 24, 100)).toBe(100);
  });

  it("rejects invalid pages and page sizes", () => {
    for (const value of ["0", "-1", "1.5", "abc", ""]) {
      expect(parseModeratorPaginationValue(value, 1)).toBeNull();
    }
    expect(parseModeratorPaginationValue("101", 24, 100)).toBeNull();
  });

  it("calculates page totals for filtered and empty result sets", () => {
    expect(getModeratorTotalPages(41, 20)).toBe(3);
    expect(getModeratorTotalPages(0, 20)).toBe(0);
  });
});
