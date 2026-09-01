import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ParentApp from "../src/ParentApp";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const navigateTargets = vi.hoisted(() => [] as string[]);

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    Navigate: ({ to }: { to: string }) => {
      navigateTargets.push(to);
      return null;
    },
  };
});

vi.mock("../src/data/repositories", () => ({
  parentRepository: {
    session: vi.fn(async () => ({ authenticated: true })),
    rules: vi.fn(async () => ({ rules: [], todayOverride: null })),
    todayPicks: vi.fn(async () => []),
    categories: vi.fn(async () => []),
  },
}));

describe("ParentApp legacy route fallback", () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    navigateTargets.length = 0;
    host = document.createElement("div");
    document.body.appendChild(host);
  });

  afterEach(() => {
    host.remove();
    vi.clearAllMocks();
  });

  it("redirects a malformed nested parent route exactly once to /parent/today", async () => {
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/parent/today/rules"]}>
          <Routes>
            <Route path="/parent/*" element={<ParentApp />} />
          </Routes>
        </MemoryRouter>,
      );
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(navigateTargets).toEqual(["/parent/today"]);
    await act(async () => root.unmount());
  });
});
