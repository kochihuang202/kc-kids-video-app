import { describe, expect, it } from "vitest";
import { addLocalReminderSeconds, applyLocalReminderUsage, readLocalReminderUsage } from "../src/lib/localReminder";
import type { ChildAccessState } from "../src/types";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

const access: ChildAccessState = {
  state: "AVAILABLE",
  remainingSeconds: 600,
  todayPlayedSeconds: 0,
  dailyLimitSeconds: 600,
  bonusSeconds: 0,
  gracePeriodSeconds: 60,
  nextAllowedAt: null,
  isPaused: false,
  serverTimeTaipei: "10:00",
  todayDate: "2026-09-01",
  message: "",
  categoryStates: [{ categoryId: "course", name: "課程", icon: "📖", tone: "sky", dailyLimitSeconds: 300, todayPlayedSeconds: 0, remainingSeconds: 300, isReached: false }],
};

describe("local reminder usage", () => {
  it("counts time locally without creating a server record", () => {
    const storage = memoryStorage();
    addLocalReminderSeconds(access.todayDate, ["course"], 120, storage);
    expect(readLocalReminderUsage(access.todayDate, storage)).toEqual({ totalSeconds: 120, categorySeconds: { course: 120 } });
    const state = applyLocalReminderUsage(access, storage);
    expect(state.remainingSeconds).toBe(480);
    expect(state.categoryStates?.[0].remainingSeconds).toBe(180);
  });

  it("keeps parent pause while replacing historical totals with local reminder time", () => {
    const storage = memoryStorage();
    addLocalReminderSeconds(access.todayDate, ["course"], 30, storage);
    const state = applyLocalReminderUsage({ ...access, state: "PAUSED_BY_PARENT", todayPlayedSeconds: 999 }, storage);
    expect(state.state).toBe("PAUSED_BY_PARENT");
    expect(state.todayPlayedSeconds).toBe(30);
  });
});
