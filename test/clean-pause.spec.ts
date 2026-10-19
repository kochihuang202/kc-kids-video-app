import { describe, expect, it } from "vitest";
import { CLEAN_PAUSE_CATEGORY_IDS, isCleanPauseCategory, resolveCleanPause } from "../src/KidApp";

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

  it("resolves cleanPause based on dynamic video.cleanPause flag", () => {
    expect(resolveCleanPause({ cleanPause: true })).toBe(true);
    expect(resolveCleanPause({ cleanPause: true, categoryId: "peppa-pig" })).toBe(true);
    expect(resolveCleanPause({ cleanPause: false, categoryId: "泉靈的語文課(一上)" })).toBe(false);
    expect(resolveCleanPause({ categoryId: "泉靈的語文課(一上)" })).toBe(true);
    expect(resolveCleanPause({ categoryId: "peppa-pig" })).toBe(false);
    expect(resolveCleanPause(null)).toBe(false);
  });
});
