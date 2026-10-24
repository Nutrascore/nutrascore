import { afterEach, describe, expect, it } from "vitest";
import { compareStore } from "$lib/stores/compareStore";

afterEach(() => {
  compareStore.clear();
});

function currentIds() {
  let ids: string[] = [];
  const unsubscribe = compareStore.subscribe((value) => (ids = value));
  unsubscribe();
  return ids;
}

describe("compareStore", () => {
  it("preserves order, ignores duplicates, and limits comparison to two products", () => {
    ["one", "two", "one", "three"].forEach((id) => compareStore.addProduct(id));
    expect(currentIds()).toEqual(["one", "two"]);

    compareStore.removeProduct("one");
    expect(currentIds()).toEqual(["two"]);
  });
});
