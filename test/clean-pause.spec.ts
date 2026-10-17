import { describe, expect, it } from "vitest";
import { CLEAN_PAUSE_CATEGORY_IDS, isCleanPauseCategory } from "../src/KidApp";

describe("clean pause categories configuration", () => {
  it("recognizes Quanling language course category as clean pause category", () => {
    expect(CLEAN_PAUSE_CATEGORY_IDS.has("泉靈的語文課(一上)")).toBe(true);
    expect(isCleanPauseCategory("泉靈的語文課(一上)")).toBe(true);
    expect(isCleanPauseCategory(["泉靈的語文課(一上)"])).toBe(true);
  });

  it("does not treat regular categories as clean pause", () => {
    expect(isCleanPauseCategory("item-66ebbf4d")).toBe(false);
    expect(isCleanPauseCategory("peppa-pig")).toBe(false);
    expect(isCleanPauseCategory(null)).toBe(false);
    expect(isCleanPauseCategory(undefined)).toBe(false);
    expect(isCleanPauseCategory([])).toBe(false);
  });
});
