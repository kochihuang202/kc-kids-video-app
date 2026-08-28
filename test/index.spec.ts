import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { contentRepository } from "../src/data/repositories";
import { addPlayedSeconds, formatPosition, getLocalDayRange } from "../src/lib/utils";
import worker from "../worker";

describe("fixtures", () => {
  it("sorts categories and videos by their fixed order", () => {
    expect(contentRepository.getCategories().map((item) => item.id)).toEqual(["science", "english", "animals"]);
    expect(contentRepository.getVideos("science").map((item) => item.id)).toEqual(["why-sky-blue", "big-story-dinosaurs"]);
  });
});

describe("time helpers", () => {
  it("formats positions and accumulates only positive elapsed time", () => {
    expect(formatPosition(512)).toBe("08:32");
    expect(addPlayedSeconds(10, 2500)).toBe(13);
    expect(addPlayedSeconds(10, -500)).toBe(10);
  });
  it("builds one local calendar day", () => {
    const range = getLocalDayRange(new Date("2026-08-29T12:00:00+08:00"));
    expect(Date.parse(range.end) - Date.parse(range.start)).toBe(86_400_000);
  });
});

describe("worker validation", () => {
  it("rejects an unknown video before touching D1", async () => {
    const request = new Request("http://example.com/api/notes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ videoId: "unknown", content: "test", videoPositionSeconds: 2 }),
    });
    const context = createExecutionContext();
    const response = await worker.fetch(request, {} as Env, context);
    await waitOnExecutionContext(context);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "找不到這部影片。" });
  });
});

describe("worker D1 flow", () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY NOT NULL, video_id TEXT NOT NULL, content TEXT NOT NULL, video_position_seconds INTEGER NOT NULL DEFAULT 0 CHECK (video_position_seconds >= 0), created_at TEXT NOT NULL)"),
      env.DB.prepare("CREATE TABLE IF NOT EXISTS view_sessions (id TEXT PRIMARY KEY NOT NULL, video_id TEXT NOT NULL, played_seconds INTEGER NOT NULL DEFAULT 0 CHECK (played_seconds >= 0), last_position_seconds INTEGER NOT NULL DEFAULT 0 CHECK (last_position_seconds >= 0), started_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    ]);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM notes"),
      env.DB.prepare("DELETE FROM view_sessions"),
    ]);
  });

  it("stores notes and keeps cumulative session updates idempotent", async () => {
    const context = createExecutionContext();
    const started = await worker.fetch(new Request("http://example.com/api/view-sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ videoId: "why-sky-blue" }),
    }), env, context);
    const session = await started.json() as { id: string };

    for (const playedSeconds of [30, 12]) {
      const updated = await worker.fetch(new Request(`http://example.com/api/view-sessions/${session.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playedSeconds, lastPositionSeconds: 42 }),
      }), env, context);
      expect(updated.status).toBe(200);
    }

    const note = await worker.fetch(new Request("http://example.com/api/notes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ videoId: "why-sky-blue", content: "我發現天空的顏色和光有關。", videoPositionSeconds: 42 }),
    }), env, context);
    expect(note.status).toBe(201);

    const dashboard = await worker.fetch(new Request("http://example.com/api/today?start=2020-01-01T00:00:00.000Z&end=2030-01-01T00:00:00.000Z"), env, context);
    const payload = await dashboard.json() as { summary: { totalPlayedSeconds: number; noteCount: number }; notes: unknown[]; timeline: Array<{ playedSeconds: number }> };
    await waitOnExecutionContext(context);

    expect(payload.summary).toMatchObject({ totalPlayedSeconds: 30, noteCount: 1 });
    expect(payload.notes).toHaveLength(1);
    expect(payload.timeline[0]).toMatchObject({ playedSeconds: 30, noteCount: 1 });
  });
});
