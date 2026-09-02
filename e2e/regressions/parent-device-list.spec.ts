import { expect, test } from "@playwright/test";

test("REG-010 restores the authorized device list and its management actions", async ({ page }) => {
  let devices = [
    {
      id: "device-current",
      name: "家庭 iPad",
      createdAt: "2026-08-20T02:00:00.000Z",
      lastUsedAt: "2026-09-02T10:00:00.000Z",
      revokedAt: null as string | null,
      isCurrent: true,
    },
    {
      id: "device-mac",
      name: "MacBook",
      createdAt: "2026-08-21T02:00:00.000Z",
      lastUsedAt: "2026-09-01T10:00:00.000Z",
      revokedAt: null as string | null,
      isCurrent: false,
    },
  ];

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const fulfill = (body: unknown, status = 200) => route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });

    if (path === "/api/parent/session" && request.method() === "GET") return fulfill({ authenticated: true });
    if (path === "/api/parent/settings" && request.method() === "GET") return fulfill({ timezone: "Asia/Taipei" });
    if (path === "/api/parent/devices" && request.method() === "GET") return fulfill(devices);
    if (path === "/api/parent/devices/device-current" && request.method() === "PATCH") {
      const body = request.postDataJSON() as { name: string };
      devices = devices.map((device) => device.id === "device-current" ? { ...device, name: body.name } : device);
      return fulfill({ ok: true });
    }
    if (path === "/api/parent/devices/device-mac" && request.method() === "DELETE") {
      devices = devices.map((device) => device.id === "device-mac"
        ? { ...device, revokedAt: "2026-09-02T11:00:00.000Z" }
        : device);
      return fulfill({ ok: true });
    }
    return fulfill({ error: `Unexpected request: ${request.method()} ${path}` }, 404);
  });

  await page.goto("/parent/settings");

  const deviceSection = page.getByRole("region", { name: "家庭裝置" });
  await expect(deviceSection).toBeVisible();
  await expect(deviceSection).toContainText("目前裝置");
  const deviceRows = deviceSection.locator("article");
  await expect(deviceRows).toHaveCount(2);

  const currentDevice = deviceRows.nth(0);
  await expect(currentDevice.getByRole("textbox", { name: "裝置名稱" })).toHaveValue("家庭 iPad");
  await currentDevice.getByRole("textbox", { name: "裝置名稱" }).fill("客廳 iPad");
  await currentDevice.getByRole("button", { name: "儲存名稱" }).click();
  await expect(currentDevice.getByRole("textbox", { name: "裝置名稱" })).toHaveValue("客廳 iPad");

  const macDevice = deviceRows.nth(1);
  await expect(macDevice.getByRole("textbox", { name: "裝置名稱" })).toHaveValue("MacBook");
  await macDevice.getByRole("button", { name: "撤銷" }).click();
  await expect(macDevice).toHaveClass(/is-revoked/);
  await expect(macDevice.getByRole("button", { name: "撤銷" })).toBeHidden();
});
