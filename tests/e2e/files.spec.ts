import { test, expect } from '@playwright/test';

test.describe('UC-01 Project Browse', () => {
  test('file explorer loads project entries', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Explorer')).toBeVisible();
    // Project root should list at least one item (package.json, docs, etc.)
    await page.waitForTimeout(500);
    await expect(page.locator('text=package.json')).toBeVisible({ timeout: 5000 });
  });

  test('health endpoint responds', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('ok');
  });
});
