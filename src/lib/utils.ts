import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function clampSeconds(value: number) {
  return Math.max(0, Math.round(Number.isFinite(value) ? value : 0));
}

export function addPlayedSeconds(total: number, elapsedMilliseconds: number) {
  return clampSeconds(total + Math.max(0, elapsedMilliseconds) / 1000);
}

export function formatPosition(totalSeconds: number) {
  const seconds = clampSeconds(totalSeconds);
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export function formatClock(iso: string) {
  return new Intl.DateTimeFormat("zh-TW", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function getLocalDayRange(now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function zonedOffsetMilliseconds(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit",
    minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const representedAsUtc = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute), Number(values.second));
  return representedAsUtc - date.getTime();
}

function zonedMidnightUtc(year: number, month: number, day: number, timeZone: string) {
  const candidate = new Date(Date.UTC(year, month - 1, day));
  let timestamp = candidate.getTime() - zonedOffsetMilliseconds(candidate, timeZone);
  timestamp = candidate.getTime() - zonedOffsetMilliseconds(new Date(timestamp), timeZone);
  return new Date(timestamp);
}

export function getDayRangeInTimeZone(timeZone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = Number(values.year); const month = Number(values.month); const day = Number(values.day);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return {
    start: zonedMidnightUtc(year, month, day, timeZone).toISOString(),
    end: zonedMidnightUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), timeZone).toISOString(),
  };
}
