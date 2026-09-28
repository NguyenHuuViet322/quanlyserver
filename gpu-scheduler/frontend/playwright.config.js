// Test e2e Dashboard — docs/20-test-cases/dashboard.md
// Windows: dùng Microsoft Edge có sẵn (PW_CHANNEL=msedge); Linux/CI: Chromium của Playwright (PW_CHANNEL rỗng).
const { defineConfig } = require('@playwright/test');

const PORT = Number(process.env.E2E_PORT || 4173);
const channel = process.env.PW_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : undefined);

module.exports = defineConfig({
  testDir: './tests/e2e',
  workers: 1, // dùng chung một CSDL test
  fullyParallel: false,
  retries: 0,
  timeout: 30_000,
  reporter: [['list'], ['junit', { outputFile: '../reports/e2e.xml' }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    channel,
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node tests/e2e/server.js',
    url: `http://127.0.0.1:${PORT}/api/config`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: { E2E_PORT: String(PORT), DATABASE_URL: process.env.DATABASE_URL || 'postgres://postgres:test@localhost:55432/vmu_test' },
  },
});
