import { defineConfig, devices } from '@playwright/test';

// Uses locally installed Edge/Chrome (no browser download). CI installs Chromium instead.
const channel = process.env.PW_CHANNEL ?? 'msedge';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173/company-of-1-it-hub/',
    trace: 'off',
    screenshot: 'off'
  },
  webServer: {
    command: 'node scripts/serve-dist.mjs',
    url: 'http://localhost:4173/company-of-1-it-hub/',
    reuseExistingServer: false,
    timeout: 20_000
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Edge'], channel: channel === 'chromium' ? undefined : channel } },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel: channel === 'chromium' ? undefined : channel } }
  ]
});
