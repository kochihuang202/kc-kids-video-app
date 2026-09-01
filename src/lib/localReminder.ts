import type { ChildAccessState } from "../types";

type ReminderStorage = Pick<Storage, "getItem" | "setItem">;

interface LocalReminderUsage {
  totalSeconds: number;
  categorySeconds: Record<string, number>;
}

const storageKey = (date: string) => `kid_reminder_usage_${date}`;

function emptyUsage(): LocalReminderUsage {
  return { totalSeconds: 0, categorySeconds: {} };
}

export function readLocalReminderUsage(date: string, storage: ReminderStorage = window.localStorage): LocalReminderUsage {
  try {
    const parsed = JSON.parse(storage.getItem(storageKey(date)) || "null") as Partial<LocalReminderUsage> | null;
    if (!parsed) return emptyUsage();
    return {
      totalSeconds: Math.max(0, Math.floor(Number(parsed.totalSeconds) || 0)),
      categorySeconds: Object.fromEntries(
        Object.entries(parsed.categorySeconds || {}).map(([id, seconds]) => [id, Math.max(0, Math.floor(Number(seconds) || 0))]),
      ),
    };
  } catch {
    return emptyUsage();
  }
}

export function addLocalReminderSeconds(
  date: string,
  categoryIds: string[],
  seconds: number,
  storage: ReminderStorage = window.localStorage,
) {
  const delta = Math.max(0, Math.floor(seconds));
  const usage = readLocalReminderUsage(date, storage);
  if (delta <= 0) return usage;
  usage.totalSeconds += delta;
  for (const categoryId of new Set(categoryIds.filter(Boolean))) {
    usage.categorySeconds[categoryId] = (usage.categorySeconds[categoryId] || 0) + delta;
  }
  storage.setItem(storageKey(date), JSON.stringify(usage));
  return usage;
}

export function applyLocalReminderUsage(
  access: ChildAccessState,
  storage: ReminderStorage = window.localStorage,
): ChildAccessState {
  const usage = readLocalReminderUsage(access.todayDate, storage);
  const categoryStates = access.categoryStates?.map((category) => {
    const played = usage.categorySeconds[category.categoryId] || 0;
    const remaining = category.dailyLimitSeconds && category.dailyLimitSeconds > 0
      ? Math.max(0, category.dailyLimitSeconds - played)
      : null;
    return {
      ...category,
      todayPlayedSeconds: played,
      remainingSeconds: remaining,
      isReached: remaining === 0 && !!category.dailyLimitSeconds,
    };
  });

  if (access.state === "PAUSED_BY_PARENT" || access.state === "OUTSIDE_WINDOW") {
    return { ...access, todayPlayedSeconds: usage.totalSeconds, categoryStates };
  }

  const hasLimit = access.dailyLimitSeconds > 0;
  const remainingSeconds = hasLimit ? Math.max(0, access.dailyLimitSeconds - usage.totalSeconds) : 0;
  const reached = hasLimit && remainingSeconds <= 0;
  const approximateMinutes = Math.max(1, Math.ceil(remainingSeconds / 60));

  return {
    ...access,
    state: reached ? "DAILY_LIMIT_REACHED" : "AVAILABLE",
    remainingSeconds,
    todayPlayedSeconds: usage.totalSeconds,
    message: reached ? "今天的影片時間到了 🌙 明天再來看看吧。" : hasLimit ? `今天還可以看約 ${approximateMinutes} 分鐘 🌱` : "今天可以自在選片 🌱",
    categoryStates,
  };
}
