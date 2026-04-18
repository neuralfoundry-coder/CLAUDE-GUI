import { defineConfig, devices } from '@playwright/test';

/**
 * Isolated Playwright config — runs the full E2E suite against a dedicated
 * server on PORT 3001 so the tests don't collide with an unrelated process
 * already bound to :3000. Useful on dev machines where another Node server
 * (e.g. a sibling project) holds :3000.
 *
 * Usage: npx playwright test --config=playwright.isolated.config.ts
 */
export default defineConfig({
  testDir: './tests/e2e',
  // The Claude multi-tab spec needs a server with CLAUDE_MOCK_HANDLER=1 —
  // that suite has its own config (`playwright.mock-claude.config.ts`).
  testIgnore: /claude-multi-tab\.spec\.ts$/,
  fullyParallel: true,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3001',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm start',
    url: 'http://127.0.0.1:3001/api/health',
    reuseExistingServer: false,
    timeout: 120 * 1000,
    env: {
      NODE_ENV: 'production',
      PROJECT_ROOT: process.cwd(),
      HOST: '127.0.0.1',
      PORT: '3001',
    },
  },
});
