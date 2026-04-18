import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the Claude-mock E2E suite.
 *
 * Boots a dedicated server on PORT 3002 with `CLAUDE_MOCK_HANDLER=1`, so the
 * `/ws/claude` endpoint serves canned frames instead of proxying to a real
 * Claude CLI. Use this when testing multi-tab streaming, cancellation, and
 * permission flows without needing Claude auth.
 *
 * Usage: npx playwright test --config=playwright.mock-claude.config.ts
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /claude-multi-tab\.spec\.ts$/,
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3002',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm start',
    url: 'http://127.0.0.1:3002/api/health',
    reuseExistingServer: false,
    timeout: 120 * 1000,
    env: {
      NODE_ENV: 'production',
      PROJECT_ROOT: process.cwd(),
      HOST: '127.0.0.1',
      PORT: '3002',
      CLAUDE_MOCK_HANDLER: '1',
    },
  },
});
