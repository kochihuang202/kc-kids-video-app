import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './test',
  testMatch: '*.spec.ts',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: process.env.PICTUREBOOK_BASE_URL || 'http://127.0.0.1:5186', hasTouch: true, isMobile: true, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [
    { name: 'ipad-landscape', use: { browserName: 'chromium', viewport: { width: 1194, height: 834 } } },
    { name: 'ipad-portrait', use: { browserName: 'chromium', viewport: { width: 834, height: 1194 } } },
    { name: 'webkit-ipad-landscape', use: { browserName: 'webkit', viewport: { width: 1194, height: 834 } } },
    { name: 'webkit-ipad-portrait', use: { browserName: 'webkit', viewport: { width: 834, height: 1194 } } },
  ],
  webServer: process.env.PICTUREBOOK_BASE_URL ? undefined : { command: 'node scripts/preview.mjs', url: 'http://127.0.0.1:5186', reuseExistingServer: true },
});
