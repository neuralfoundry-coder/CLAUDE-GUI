import { test, expect } from '@playwright/test';

test.describe('UC-01 Project Browse', () => {
  test('file explorer loads project entries', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Explorer', { exact: true })).toBeVisible();
    // Wait for the file tree REST call to populate
    await expect(page.locator('text=package.json').first()).toBeVisible({ timeout: 10000 });
  });

  test('health endpoint responds', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('ok');
  });

  test('files list endpoint responds', async ({ request }) => {
    const res = await request.get('/api/files?path=');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.entries)).toBe(true);
  });

  test('sandbox blocks path traversal', async ({ request }) => {
    const res = await request.get('/api/files/read?path=../../../etc/passwd');
    expect(res.status()).toBe(403);
  });

  test('git status endpoint responds', async ({ request }) => {
    const res = await request.get('/api/git/status');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(typeof body.data.isRepo).toBe('boolean');
  });
});
